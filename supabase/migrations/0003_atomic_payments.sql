-- Phase 3: transactional payment orchestration.
-- Razorpay network calls intentionally stay outside database transactions. These
-- functions atomically claim/finalize each side effect and commit the related
-- state transition and audit evidence together.

alter table public.payment_records
  add column if not exists confirmation_idempotency_key text,
  add column if not exists order_creation_idempotency_key text,
  add column if not exists callback_idempotency_key text,
  add column if not exists state_version integer not null default 1,
  add column if not exists manual_review_required boolean not null default false;

update public.payment_records
set confirmation_idempotency_key = 'legacy-' || payment_record_id
where confirmation_idempotency_key is null;

alter table public.payment_records
  alter column confirmation_idempotency_key set not null;

create unique index if not exists payment_records_confirmation_idempotency_idx
  on public.payment_records (confirmation_idempotency_key);
create unique index if not exists payment_records_confirmed_cart_idx
  on public.payment_records (decision_id, session_id, cart_hash);
create unique index if not exists payment_records_order_idempotency_idx
  on public.payment_records (order_creation_idempotency_key)
  where order_creation_idempotency_key is not null;
create unique index if not exists payment_records_callback_idempotency_idx
  on public.payment_records (callback_idempotency_key)
  where callback_idempotency_key is not null;
create unique index if not exists payment_records_payment_id_idx
  on public.payment_records (razorpay_payment_id)
  where razorpay_payment_id is not null;

create or replace function public.payment_audit_insert(
  p_record_id text,
  p_event_type text,
  p_actor_type text,
  p_outcome text,
  p_reason_code text,
  p_evidence jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sequence integer;
begin
  -- Callers lock the payment record first, serializing sequence allocation.
  select coalesce(max(sequence_number), 0) + 1 into v_sequence
  from public.audit_events where trace_id = p_record_id;

  insert into public.audit_events (
    audit_event_id, trace_id, sequence_number, event_type, actor_type, outcome,
    reason_code, resource_type, resource_id, evidence
  ) values (
    'AUD-' || upper(gen_random_uuid()::text), p_record_id, v_sequence,
    p_event_type, p_actor_type, p_outcome, p_reason_code,
    'payment_record', p_record_id, coalesce(p_evidence, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.payment_audit_insert(text, text, text, text, text, jsonb) from public;

create or replace function public.confirm_checkout(
  p_session_id text,
  p_decision_id text,
  p_catalog_version text,
  p_policy_version text,
  p_selected_candidate_id text,
  p_amount_paise integer,
  p_cart_hash text,
  p_confirmed_cart jsonb,
  p_decision_payload jsonb,
  p_idempotency_key text
) returns public.payment_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_record public.payment_records;
  v_payment_record_id text := 'PAYREC-' || upper(gen_random_uuid()::text);
  v_internal_order_id text := 'ORD-' || upper(gen_random_uuid()::text);
begin
  if length(p_session_id) < 16 or p_amount_paise < 100
     or p_cart_hash !~ '^[a-f0-9]{64}$'
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,160}$' then
    raise exception 'invalid_checkout_confirmation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_session_id || ':' || p_decision_id || ':' || p_cart_hash, 0));

  select * into v_payment_record from public.payment_records
  where confirmation_idempotency_key = p_idempotency_key for update;
  if found then
    if v_payment_record.session_id <> p_session_id
       or v_payment_record.decision_id <> p_decision_id
       or v_payment_record.cart_hash <> p_cart_hash
       or v_payment_record.amount_paise <> p_amount_paise then
      raise exception 'idempotency_key_reused';
    end if;
    return v_payment_record;
  end if;

  select * into v_payment_record from public.payment_records
  where decision_id = p_decision_id and session_id = p_session_id and cart_hash = p_cart_hash
  order by created_at desc limit 1 for update;
  if found then return v_payment_record; end if;

  insert into public.offer_decisions (
    decision_id, session_id, catalog_version, policy_version, selected_candidate_id,
    customer_total_paise, cart_hash, decision_payload
  ) values (
    p_decision_id, p_session_id, p_catalog_version, p_policy_version, p_selected_candidate_id,
    p_amount_paise, p_cart_hash, p_decision_payload
  ) on conflict (decision_id, session_id, cart_hash) do nothing;

  insert into public.payment_records (
    payment_record_id, internal_order_id, decision_id, session_id, cart_hash,
    confirmed_cart, amount_paise, currency, mode, state, confirmation_idempotency_key
  ) values (
    v_payment_record_id, v_internal_order_id, p_decision_id, p_session_id, p_cart_hash,
    p_confirmed_cart, p_amount_paise, 'INR', 'test', 'customer_confirmed', p_idempotency_key
  ) returning * into v_payment_record;

  insert into public.payment_transitions (
    payment_record_id, from_state, to_state, trigger, source, applied, reason_code
  ) values (
    v_payment_record_id, null, 'customer_confirmed', 'customer_confirmation',
    'customer_api', true, 'EXACT_TOTAL_CONFIRMED'
  );
  perform public.payment_audit_insert(
    v_payment_record_id, 'checkout.customer_confirmed', 'customer', 'success',
    'EXACT_TOTAL_CONFIRMED',
    jsonb_build_object('decision_id', p_decision_id, 'amount_paise', p_amount_paise,
      'cart_hash', p_cart_hash, 'idempotent', true)
  );
  return v_payment_record;
end;
$$;

revoke all on function public.confirm_checkout(text, text, text, text, text, integer, text, jsonb, jsonb, text) from public;
grant execute on function public.confirm_checkout(text, text, text, text, text, integer, text, jsonb, jsonb, text) to service_role;

-- Preserve rolling-deployment compatibility while routing older callers through
-- the same idempotent implementation.
create or replace function public.confirm_checkout(
  p_session_id text,
  p_decision_id text,
  p_catalog_version text,
  p_policy_version text,
  p_selected_candidate_id text,
  p_amount_paise integer,
  p_cart_hash text,
  p_confirmed_cart jsonb,
  p_decision_payload jsonb
) returns public.payment_records
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from public.confirm_checkout(
    p_session_id, p_decision_id, p_catalog_version, p_policy_version,
    p_selected_candidate_id, p_amount_paise, p_cart_hash, p_confirmed_cart,
    p_decision_payload,
    'legacy:' || encode(extensions.digest(p_session_id || ':' || p_decision_id || ':' || p_cart_hash, 'sha256'), 'hex')
  );
$$;

revoke all on function public.confirm_checkout(text, text, text, text, text, integer, text, jsonb, jsonb) from public;
grant execute on function public.confirm_checkout(text, text, text, text, text, integer, text, jsonb, jsonb) to service_role;

create or replace function public.claim_payment_order(
  p_record_id text,
  p_session_id text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.payment_records;
begin
  if p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,160}$' then raise exception 'invalid_idempotency_key'; end if;
  select * into v_record from public.payment_records
  where payment_record_id = p_record_id and session_id = p_session_id for update;
  if not found then raise exception 'payment_record_not_found'; end if;
  if v_record.razorpay_order_id is not null then
    return jsonb_build_object('status', 'existing', 'record', to_jsonb(v_record));
  end if;
  if v_record.state = 'order_creation_pending' and v_record.order_creation_idempotency_key = p_idempotency_key then
    return jsonb_build_object('status', 'in_progress', 'record', to_jsonb(v_record));
  end if;
  if v_record.state <> 'customer_confirmed' then raise exception 'order_creation_not_claimable'; end if;

  update public.payment_records set
    state = 'order_creation_pending', order_creation_claimed_at = now(),
    order_creation_idempotency_key = p_idempotency_key, state_version = state_version + 1,
    updated_at = now()
  where payment_record_id = p_record_id returning * into v_record;
  insert into public.payment_transitions (
    payment_record_id, from_state, to_state, trigger, source, applied, reason_code
  ) values (p_record_id, 'customer_confirmed', 'order_creation_pending',
    'order_creation_claimed', 'server_api', true, 'ORDER_CREATION_CLAIMED');
  perform public.payment_audit_insert(p_record_id, 'payment.order_creation_claimed',
    'system', 'success', 'ORDER_CREATION_CLAIMED', jsonb_build_object('idempotent', true));
  return jsonb_build_object('status', 'claimed', 'record', to_jsonb(v_record));
end;
$$;

revoke all on function public.claim_payment_order(text, text, text) from public;
grant execute on function public.claim_payment_order(text, text, text) to service_role;

create or replace function public.complete_payment_order(
  p_record_id text,
  p_session_id text,
  p_idempotency_key text,
  p_razorpay_order_id text,
  p_order_status text,
  p_receipt text
) returns public.payment_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.payment_records;
  v_before text;
begin
  select * into v_record from public.payment_records
  where payment_record_id = p_record_id and session_id = p_session_id for update;
  if not found then raise exception 'payment_record_not_found'; end if;
  if v_record.razorpay_order_id is not null then
    if v_record.razorpay_order_id <> p_razorpay_order_id then raise exception 'razorpay_order_conflict'; end if;
    return v_record;
  end if;
  if v_record.state not in ('order_creation_pending', 'order_creation_unknown')
     or v_record.order_creation_idempotency_key <> p_idempotency_key then
    raise exception 'order_claim_mismatch';
  end if;
  v_before := v_record.state;

  update public.payment_records set
    state = 'order_created', razorpay_order_id = p_razorpay_order_id,
    razorpay_order_status = p_order_status, order_receipt = p_receipt,
    failure_code = null, state_version = state_version + 1, updated_at = now()
  where payment_record_id = p_record_id returning * into v_record;
  insert into public.payment_transitions (
    payment_record_id, from_state, to_state, trigger, source, applied, reason_code
  ) values (p_record_id, v_before, 'order_created',
    'razorpay_order_created', 'server_api', true, 'TEST_ORDER_CREATED');
  perform public.payment_audit_insert(p_record_id, 'payment.order_created', 'system',
    'success', 'TEST_ORDER_CREATED', jsonb_build_object(
      'razorpayOrderId', p_razorpay_order_id, 'amountPaise', v_record.amount_paise,
      'currency', v_record.currency));
  return v_record;
end;
$$;

revoke all on function public.complete_payment_order(text, text, text, text, text, text) from public;
grant execute on function public.complete_payment_order(text, text, text, text, text, text) to service_role;

create or replace function public.mark_payment_order_unknown(
  p_record_id text,
  p_session_id text,
  p_idempotency_key text,
  p_reason_code text
) returns public.payment_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.payment_records;
begin
  select * into v_record from public.payment_records
  where payment_record_id = p_record_id and session_id = p_session_id for update;
  if not found then raise exception 'payment_record_not_found'; end if;
  if v_record.razorpay_order_id is not null then return v_record; end if;
  if v_record.state <> 'order_creation_pending'
     or v_record.order_creation_idempotency_key <> p_idempotency_key then return v_record; end if;
  update public.payment_records set state = 'order_creation_unknown',
    failure_code = p_reason_code, state_version = state_version + 1, updated_at = now()
  where payment_record_id = p_record_id returning * into v_record;
  insert into public.payment_transitions (
    payment_record_id, from_state, to_state, trigger, source, applied, reason_code
  ) values (p_record_id, 'order_creation_pending', 'order_creation_unknown',
    'razorpay_order_outcome_unknown', 'server_api', true, p_reason_code);
  perform public.payment_audit_insert(p_record_id, 'payment.order_creation_unknown',
    'system', 'failure', p_reason_code,
    jsonb_build_object('safeToRetryCreate', false, 'reconciliationRequired', true));
  return v_record;
end;
$$;

revoke all on function public.mark_payment_order_unknown(text, text, text, text) from public;
grant execute on function public.mark_payment_order_unknown(text, text, text, text) to service_role;

create or replace function public.apply_payment_callback(
  p_record_id text,
  p_session_id text,
  p_payment_id text,
  p_signature_valid boolean,
  p_reason_code text,
  p_idempotency_key text
) returns public.payment_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.payment_records;
  v_before text;
  v_next_state text;
  v_applied boolean := true;
begin
  if p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,160}$' then raise exception 'invalid_idempotency_key'; end if;
  select * into v_record from public.payment_records
  where payment_record_id = p_record_id and session_id = p_session_id for update;
  if not found or v_record.razorpay_order_id is null then raise exception 'payment_record_not_found'; end if;
  v_before := v_record.state;

  if v_record.callback_idempotency_key = p_idempotency_key
     or (p_signature_valid and v_record.callback_verified and v_record.razorpay_payment_id = p_payment_id) then
    return v_record;
  end if;

  if v_record.capture_confirmed then
    if p_signature_valid and (v_record.razorpay_payment_id is null or v_record.razorpay_payment_id = p_payment_id) then
      update public.payment_records set callback_verified = true,
        razorpay_payment_id = coalesce(razorpay_payment_id, p_payment_id),
        callback_idempotency_key = p_idempotency_key,
        state_version = state_version + 1, updated_at = now()
      where payment_record_id = p_record_id returning * into v_record;
      v_next_state := v_record.state;
    else
      v_next_state := v_record.state;
      v_applied := false;
    end if;
  elsif p_signature_valid and v_record.razorpay_payment_id is not null
        and v_record.razorpay_payment_id <> p_payment_id then
    update public.payment_records set manual_review_required = true,
      failure_code = 'PAYMENT_ID_CONFLICT', callback_idempotency_key = p_idempotency_key,
      state_version = state_version + 1, updated_at = now()
    where payment_record_id = p_record_id returning * into v_record;
    v_next_state := v_record.state;
    v_applied := false;
  elsif not p_signature_valid and v_record.state in ('payment_authorized', 'payment_failed') then
    update public.payment_records set callback_idempotency_key = p_idempotency_key,
      state_version = state_version + 1, updated_at = now()
    where payment_record_id = p_record_id returning * into v_record;
    v_next_state := v_record.state;
    v_applied := false;
  else
    v_next_state := case
      when p_signature_valid and v_record.state = 'payment_authorized' then 'payment_authorized'
      when p_signature_valid then 'callback_verified'
      else 'signature_verification_failed'
    end;
    update public.payment_records set
      state = v_next_state,
      callback_verified = callback_verified or p_signature_valid,
      razorpay_payment_id = case when p_signature_valid then p_payment_id else razorpay_payment_id end,
      fulfilment_authorized = false,
      failure_code = case when p_signature_valid then null else p_reason_code end,
      callback_idempotency_key = p_idempotency_key,
      state_version = state_version + 1, updated_at = now()
    where payment_record_id = p_record_id returning * into v_record;
  end if;

  insert into public.payment_transitions (
    payment_record_id, from_state, to_state, trigger, source, applied, reason_code
  ) values (p_record_id, v_before, v_next_state, 'checkout_callback',
    'browser_callback', v_applied, p_reason_code);
  perform public.payment_audit_insert(p_record_id,
    case when p_signature_valid then 'payment.callback_verified' else 'payment.callback_rejected' end,
    'payment_provider', case when p_signature_valid then 'success' else 'failure' end,
    p_reason_code, jsonb_build_object('callbackVerified', p_signature_valid,
      'fulfilmentAuthorized', false, 'transitionApplied', v_applied));
  return v_record;
end;
$$;

revoke all on function public.apply_payment_callback(text, text, text, boolean, text, text) from public;
grant execute on function public.apply_payment_callback(text, text, text, boolean, text, text) to service_role;

create or replace function public.apply_payment_reconciliation(
  p_record_id text,
  p_expected_version integer,
  p_next_state text,
  p_reason_code text,
  p_update jsonb,
  p_outcome text
) returns public.payment_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.payment_records;
  v_before text;
begin
  select * into v_record from public.payment_records
  where payment_record_id = p_record_id for update;
  if not found then raise exception 'payment_record_not_found'; end if;
  if v_record.state_version <> p_expected_version then raise exception 'payment_version_conflict'; end if;
  if v_record.capture_confirmed and p_next_state <> 'payment_captured' then return v_record; end if;
  if p_update = '{}'::jsonb then
    insert into public.payment_transitions (
      payment_record_id, from_state, to_state, trigger, source, applied, reason_code
    ) values (p_record_id, v_record.state, v_record.state, 'payment_reconciliation',
      'razorpay_payments_api', false, p_reason_code);
    perform public.payment_audit_insert(p_record_id, 'payment.api_recheck_rejected',
      'merchant', p_outcome, p_reason_code,
      jsonb_build_object('captureConfirmed', v_record.capture_confirmed,
        'fulfilmentAuthorized', v_record.fulfilment_authorized));
    return v_record;
  end if;
  if coalesce((p_update->>'fulfilment_authorized')::boolean, false)
     and not (p_next_state = 'payment_captured'
       and coalesce((p_update->>'capture_confirmed')::boolean, false)
       and p_update->>'razorpay_order_status' = 'paid') then
    raise exception 'fulfilment_gate_failed';
  end if;
  v_before := v_record.state;
  update public.payment_records set
    state = p_next_state,
    razorpay_order_status = coalesce(p_update->>'razorpay_order_status', razorpay_order_status),
    razorpay_payment_id = coalesce(p_update->>'razorpay_payment_id', razorpay_payment_id),
    capture_confirmed = coalesce((p_update->>'capture_confirmed')::boolean, capture_confirmed),
    capture_confirmation_source = coalesce(p_update->>'capture_confirmation_source', capture_confirmation_source),
    fulfilment_authorized = coalesce((p_update->>'fulfilment_authorized')::boolean, fulfilment_authorized),
    failure_code = case when p_update ? 'failure_code' then p_update->>'failure_code' else failure_code end,
    state_version = state_version + 1, updated_at = now()
  where payment_record_id = p_record_id returning * into v_record;
  insert into public.payment_transitions (
    payment_record_id, from_state, to_state, trigger, source, applied, reason_code
  ) values (p_record_id, v_before, p_next_state, 'payment_reconciliation',
    'razorpay_payments_api', true, p_reason_code);
  perform public.payment_audit_insert(p_record_id, 'payment.api_recheck_completed',
    'merchant', p_outcome, p_reason_code,
    jsonb_build_object('captureConfirmed', v_record.capture_confirmed,
      'fulfilmentAuthorized', v_record.fulfilment_authorized));
  return v_record;
end;
$$;

revoke all on function public.apply_payment_reconciliation(text, integer, text, text, jsonb, text) from public;
grant execute on function public.apply_payment_reconciliation(text, integer, text, text, jsonb, text) to service_role;

create or replace function public.apply_payment_timeout(
  p_record_id text,
  p_expected_state text,
  p_cutoff timestamptz,
  p_reason_code text
) returns public.payment_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.payment_records;
begin
  select * into v_record from public.payment_records
  where payment_record_id = p_record_id for update;
  if not found then raise exception 'payment_record_not_found'; end if;
  if v_record.state <> p_expected_state or v_record.created_at > p_cutoff
     or v_record.razorpay_payment_id is not null or v_record.callback_verified
     or v_record.capture_confirmed or v_record.fulfilment_authorized then return v_record; end if;
  update public.payment_records set state = 'payment_failed', failure_code = p_reason_code,
    fulfilment_authorized = false, state_version = state_version + 1, updated_at = now()
  where payment_record_id = p_record_id returning * into v_record;
  insert into public.payment_transitions (
    payment_record_id, from_state, to_state, trigger, source, applied, reason_code
  ) values (p_record_id, p_expected_state, 'payment_failed', 'payment_timeout',
    'cartpilot_server', true, p_reason_code);
  perform public.payment_audit_insert(p_record_id, 'payment.timeout_applied', 'system',
    'failure', p_reason_code, jsonb_build_object('fulfilmentAuthorized', false));
  return v_record;
end;
$$;

revoke all on function public.apply_payment_timeout(text, text, timestamptz, text) from public;
grant execute on function public.apply_payment_timeout(text, text, timestamptz, text) to service_role;

-- Webhook receipt, deduplication, reconciliation, state transition, fulfilment
-- gate, and audit evidence commit as one transaction.
create or replace function public.apply_razorpay_webhook(
  p_event_id text,
  p_event_type text,
  p_payload_hash text,
  p_order_id text,
  p_payment_id text,
  p_payment_amount integer,
  p_payment_currency text,
  p_payment_status text,
  p_payment_captured boolean,
  p_payment_error_code text,
  p_order_amount integer,
  p_order_currency text,
  p_order_status text,
  p_order_amount_paid integer,
  p_order_amount_due integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.payment_records;
  v_inserted integer;
  v_before text;
  v_reason text := 'EVENT_NOT_APPLICABLE';
  v_applied boolean := false;
  v_reconciled boolean := true;
  v_order_paid boolean := false;
begin
  insert into public.webhook_events (
    event_id, event_type, payload_hash, verified, processing_status
  ) values (p_event_id, p_event_type, p_payload_hash, true, 'received')
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('duplicate', true, 'applied', false); end if;

  if p_order_id is null then
    update public.webhook_events set processing_status = 'ignored', failure_code = 'ORDER_ID_MISSING', processed_at = now()
    where event_id = p_event_id;
    return jsonb_build_object('duplicate', false, 'applied', false, 'reasonCode', 'ORDER_ID_MISSING');
  end if;

  select * into v_record from public.payment_records
  where razorpay_order_id = p_order_id for update;
  if not found then
    update public.webhook_events set processing_status = 'ignored', failure_code = 'PAYMENT_RECORD_NOT_FOUND', processed_at = now()
    where event_id = p_event_id;
    return jsonb_build_object('duplicate', false, 'applied', false, 'reasonCode', 'PAYMENT_RECORD_NOT_FOUND');
  end if;
  v_before := v_record.state;

  if (p_payment_amount is not null and (p_payment_amount <> v_record.amount_paise or p_payment_currency <> v_record.currency))
     or (p_order_amount is not null and (p_order_amount <> v_record.amount_paise or coalesce(p_order_currency, v_record.currency) <> v_record.currency)) then
    v_reconciled := false;
    v_reason := 'WEBHOOK_AMOUNT_OR_ORDER_MISMATCH';
  elsif v_record.capture_confirmed and p_event_type in ('payment.failed', 'payment.authorized') then
    v_reason := 'MONOTONIC_STATE_PROTECTED';
  elsif p_event_type = 'payment.failed' then
    update public.payment_records set state = 'payment_failed',
      razorpay_payment_id = coalesce(p_payment_id, razorpay_payment_id),
      failure_code = coalesce(p_payment_error_code, 'PAYMENT_FAILED'),
      fulfilment_authorized = false, state_version = state_version + 1, updated_at = now()
    where payment_record_id = v_record.payment_record_id returning * into v_record;
    v_reason := 'TEST_PAYMENT_FAILED_SAFELY'; v_applied := true;
  elsif p_event_type = 'payment.authorized' then
    update public.payment_records set state = 'payment_authorized',
      razorpay_payment_id = coalesce(p_payment_id, razorpay_payment_id), failure_code = null,
      fulfilment_authorized = false, state_version = state_version + 1, updated_at = now()
    where payment_record_id = v_record.payment_record_id returning * into v_record;
    v_reason := 'PAYMENT_AUTHORIZED_CAPTURE_PENDING'; v_applied := true;
  elsif p_event_type = 'payment.captured' then
    if p_payment_id is null or p_payment_status <> 'captured' or p_payment_captured is not true then
      v_reconciled := false; v_reason := 'CAPTURE_EVIDENCE_INCOMPLETE';
    else
      v_order_paid := (p_order_status = 'paid' and p_order_amount_due = 0 and p_order_amount_paid = v_record.amount_paise)
        or v_record.razorpay_order_status = 'paid';
      update public.payment_records set state = 'payment_captured',
        razorpay_payment_id = p_payment_id,
        razorpay_order_status = coalesce(p_order_status, razorpay_order_status),
        capture_confirmed = true, capture_confirmation_source = 'verified_webhook',
        fulfilment_authorized = v_order_paid, failure_code = null,
        state_version = state_version + 1, updated_at = now()
      where payment_record_id = v_record.payment_record_id returning * into v_record;
      v_reason := case when v_order_paid then 'CAPTURE_AND_ORDER_RECONCILED' else 'CAPTURE_CONFIRMED_ORDER_STATUS_PENDING' end;
      v_applied := true;
    end if;
  elsif p_event_type = 'order.paid' then
    if p_order_status <> 'paid' or p_order_amount_due <> 0 or p_order_amount_paid <> v_record.amount_paise then
      v_reconciled := false; v_reason := 'ORDER_PAID_EVIDENCE_INCOMPLETE';
    else
      update public.payment_records set
        state = case when capture_confirmed then 'payment_captured' else state end,
        razorpay_order_status = 'paid', fulfilment_authorized = capture_confirmed,
        failure_code = null, state_version = state_version + 1, updated_at = now()
      where payment_record_id = v_record.payment_record_id returning * into v_record;
      v_reason := case when v_record.capture_confirmed then 'CAPTURE_AND_ORDER_RECONCILED' else 'ORDER_PAID_CAPTURE_PENDING' end;
      v_applied := true;
    end if;
  end if;

  insert into public.payment_transitions (
    payment_record_id, from_state, to_state, trigger, source, applied, reason_code
  ) values (v_record.payment_record_id, v_before, v_record.state, p_event_type,
    'verified_webhook', v_applied, v_reason);
  update public.webhook_events set payment_record_id = v_record.payment_record_id,
    processing_status = case when not v_reconciled then 'failed' when v_applied then 'applied' else 'ignored' end,
    failure_code = case when v_reconciled then null else v_reason end, processed_at = now()
  where event_id = p_event_id;
  perform public.payment_audit_insert(v_record.payment_record_id,
    case when not v_reconciled then 'payment.webhook_reconciliation_failed'
      when v_applied then 'payment.webhook_applied' else 'payment.webhook_ignored' end,
    'payment_provider', case when v_reconciled then 'success' else 'failure' end,
    v_reason, jsonb_build_object('eventId', p_event_id, 'eventType', p_event_type,
      'captureConfirmed', v_record.capture_confirmed,
      'fulfilmentAuthorized', v_record.fulfilment_authorized));
  return jsonb_build_object('duplicate', false, 'applied', v_applied,
    'reconciled', v_reconciled, 'reasonCode', v_reason,
    'paymentRecordId', v_record.payment_record_id,
    'state', v_record.state, 'fulfilmentAuthorized', v_record.fulfilment_authorized);
end;
$$;

revoke all on function public.apply_razorpay_webhook(text, text, text, text, text, integer, text, text, boolean, text, integer, text, text, integer, integer) from public;
grant execute on function public.apply_razorpay_webhook(text, text, text, text, text, integer, text, text, boolean, text, integer, text, text, integer, integer) to service_role;
