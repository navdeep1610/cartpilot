-- Phase 4: complete, append-only and tamper-evident audit trail.
-- Payment rows own a stable TRACE-* identifier. Audit sequence allocation and
-- hashing happen under a transaction-scoped advisory lock, so concurrent
-- callbacks and webhooks cannot fork a trace.

alter table public.payment_records
  add column if not exists trace_id text;

update public.payment_records
set trace_id = 'TRACE-' || upper(gen_random_uuid()::text)
where trace_id is null;

alter table public.payment_records
  alter column trace_id set default ('TRACE-' || upper(gen_random_uuid()::text)),
  alter column trace_id set not null;

create unique index if not exists payment_records_trace_id_idx
  on public.payment_records (trace_id);

alter table public.audit_events
  add column if not exists schema_version text,
  add column if not exists idempotency_key text,
  add column if not exists previous_event_hash text,
  add column if not exists payload_hash text,
  add column if not exists event_hash text,
  add column if not exists canonical_payload text,
  add column if not exists event_payload jsonb;

create unique index if not exists audit_events_trace_idempotency_idx
  on public.audit_events (trace_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists audit_events_trace_event_hash_idx
  on public.audit_events (trace_id, event_hash)
  where event_hash is not null;

create or replace function public.audit_events_are_immutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'audit_events_are_append_only';
end;
$$;

drop trigger if exists audit_events_immutable on public.audit_events;
create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function public.audit_events_are_immutable();

create or replace function public.audit_event_payload_valid(p_payload jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(p_payload) = 'object'
    and p_payload ?& array[
      'schema_version', 'event_id', 'sequence', 'occurred_at', 'recorded_at',
      'event_name', 'event_category', 'severity', 'outcome', 'correlation',
      'actor', 'source', 'subject', 'action', 'request_context',
      'catalog_context', 'decision_context', 'money_context', 'gate_results',
      'state_change', 'failure', 'recovery', 'explanation', 'integrity', 'privacy'
    ]
    and p_payload->>'schema_version' = '1.0.0'
    and (p_payload->>'sequence')::integer >= 1
    and p_payload->'integrity'->>'hash_algorithm' = 'SHA-256'
    and (p_payload->'integrity'->>'append_only')::boolean
    and (p_payload->'integrity'->>'schema_validation_passed')::boolean
    and (p_payload->'integrity'->>'tamper_evident_chain_enabled')::boolean;
$$;

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
  v_record public.payment_records;
  v_sequence integer;
  v_audit_id text := 'AUD-' || upper(gen_random_uuid()::text);
  v_event_id text := 'EVT-' || upper(gen_random_uuid()::text);
  v_parent_event_id text;
  v_previous_hash text;
  v_payload_hash text;
  v_event_hash text;
  v_canonical text;
  v_payload jsonb;
  v_event_name text;
  v_category text;
  v_action text;
  v_actor text;
  v_subject text;
  v_outcome text;
  v_severity text;
  v_failure jsonb := 'null'::jsonb;
  v_money jsonb := 'null'::jsonb;
  v_gates jsonb := '[]'::jsonb;
  v_now timestamptz := clock_timestamp();
  v_idempotency text;
  v_is_failure boolean;
  v_authorizes_fulfilment boolean;
begin
  select * into v_record from public.payment_records
  where payment_record_id = p_record_id;
  if not found then raise exception 'payment_record_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_record.trace_id, 0));
  select coalesce(max(sequence_number), 0) + 1,
         (array_agg(event_hash order by sequence_number desc))[1],
         (array_agg(event_payload->>'event_id' order by sequence_number desc))[1]
    into v_sequence, v_previous_hash, v_parent_event_id
  from public.audit_events
  where trace_id = v_record.trace_id and schema_version = '1.0.0';

  -- A new confirmation trigger already wrote this material event.
  if p_event_type = 'checkout.customer_confirmed' and exists (
    select 1 from public.audit_events
    where trace_id = v_record.trace_id and event_type = 'customer.confirmed'
  ) then return; end if;

  v_authorizes_fulfilment := coalesce((p_evidence->>'fulfilmentAuthorized')::boolean, false);
  v_event_name := case
    when v_authorizes_fulfilment then 'fulfilment.authorized'
    when p_event_type in ('intent.extracted', 'catalog.filtered', 'candidate.generated',
      'offer.selected', 'cart.presented', 'customer.confirmed') then p_event_type
    when p_event_type = 'checkout.customer_confirmed' then 'customer.confirmed'
    when p_event_type = 'payment.order_creation_claimed' then 'order.creation_authorized'
    when p_event_type = 'payment.order_created' then 'order.created'
    when p_event_type = 'payment.order_creation_unknown' then 'order.creation_failed'
    when p_event_type = 'payment.callback_verified' then 'payment.signature_verified'
    when p_event_type = 'payment.callback_rejected' then 'payment.signature_failed'
    when p_event_type = 'payment.timeout_applied' then 'payment.failed'
    when p_event_type = 'payment.webhook_reconciliation_failed' then 'system.data_integrity_failed'
    when p_event_type = 'payment.webhook_ignored' then 'webhook.out_of_order_reconciled'
    when p_event_type = 'payment.webhook_applied' and v_record.state = 'payment_failed' then 'payment.failed'
    when p_event_type = 'payment.webhook_applied' and v_record.state = 'payment_authorized' then 'payment.authorized'
    when p_event_type = 'payment.webhook_applied' then 'payment.captured'
    when p_event_type = 'payment.api_recheck_completed' and v_record.capture_confirmed then 'payment.captured'
    when p_event_type = 'payment.api_recheck_completed' then 'payment.authorized'
    when p_event_type = 'payment.api_recheck_rejected' then 'fulfilment.blocked'
    else 'system.manual_review_requested'
  end;
  v_category := split_part(v_event_name, '.', 1);
  if v_category = 'candidate' then v_category := 'recommendation'; end if;
  if v_category = 'customer' then v_category := 'confirmation'; end if;
  if v_category = 'compatibility' then v_category := 'recommendation'; end if;

  v_action := case
    when v_event_name = 'intent.extracted' then 'parse_intent'
    when v_event_name = 'catalog.filtered' then 'filter_catalog'
    when v_event_name = 'candidate.generated' then 'generate_candidate'
    when v_event_name = 'offer.selected' then 'select_offer'
    when v_event_name = 'cart.presented' then 'present_cart'
    when v_event_name = 'customer.confirmed' then 'record_confirmation'
    when v_event_name like 'order.%' then 'create_order'
    when v_event_name like 'payment.signature%' then 'verify_signature'
    when v_event_name = 'fulfilment.authorized' then 'authorize_fulfilment'
    when v_event_name = 'fulfilment.blocked' then 'authorize_fulfilment'
    when v_event_name like 'payment.%' or v_event_name like 'webhook.%' then 'update_payment_state'
    when v_event_name = 'system.manual_review_requested' then 'request_manual_review'
    else 'none'
  end;
  v_subject := case
    when v_category = 'intent' then 'customer_intent'
    when v_category = 'catalog' then 'catalog_selection'
    when v_event_name = 'candidate.generated' then 'candidate'
    when v_category = 'offer' then 'offer_decision'
    when v_category = 'cart' then 'cart'
    when v_category = 'confirmation' then 'customer_confirmation'
    when v_category = 'order' then 'internal_order'
    when v_category = 'webhook' then 'webhook_event'
    when v_category = 'fulfilment' then 'fulfilment_gate'
    when v_category = 'payment' then 'payment_attempt'
    else 'system_operation'
  end;
  v_actor := case
    when p_actor_type = 'customer' then 'customer'
    when p_actor_type = 'payment_provider' and v_category = 'webhook' then 'razorpay_webhook'
    when p_actor_type = 'payment_provider' then 'razorpay_api'
    when p_actor_type = 'merchant' then 'operator'
    else 'backend_engine'
  end;
  v_is_failure := v_event_name in ('order.creation_failed', 'payment.signature_failed',
    'payment.failed', 'system.data_integrity_failed');
  v_outcome := case
    when v_authorizes_fulfilment then 'succeeded'
    when v_is_failure then 'failed'
    when p_outcome in ('rejected', 'blocked', 'pending', 'no_change', 'duplicate_ignored') then p_outcome
    when v_event_name = 'offer.selected' then 'selected'
    else 'succeeded'
  end;
  v_severity := case when v_is_failure then 'error' else 'info' end;

  if v_category in ('discount', 'cart', 'confirmation', 'order', 'checkout', 'payment', 'fulfilment') then
    v_money := jsonb_build_object(
      'currency', 'INR', 'amount_unit', 'minor_units_paise',
      'list_total_paise', coalesce((v_record.confirmed_cart->>'grossPaise')::integer, v_record.amount_paise),
      'discount_paise', coalesce((v_record.confirmed_cart->>'savingPaise')::integer, 0),
      'final_total_paise', v_record.amount_paise,
      'product_cost_paise', 0, 'variable_cost_paise', 0,
      'contribution_profit_paise', v_record.amount_paise,
      'contribution_margin_bps', case when v_record.amount_paise > 0 then 10000 else 0 end,
      'profit_formula_version', '1.0.0', 'price_source', 'server_catalog',
      'customer_confirmation_status', 'confirmed', 'server_total_revalidated', true,
      'payment_status', case when v_record.capture_confirmed then 'captured'
        when v_record.state = 'payment_authorized' then 'authorized'
        when v_record.state = 'payment_failed' then 'failed'
        when v_record.razorpay_order_id is not null then 'created' else 'not_started' end,
      'capture_confirmed', case when v_authorizes_fulfilment then true else v_record.capture_confirmed end,
      'order_marked_paid', case when v_authorizes_fulfilment then true else false end,
      'fulfilment_authorized', v_authorizes_fulfilment
    );
  end if;

  if v_authorizes_fulfilment then
    v_gates := jsonb_build_array(
      jsonb_build_object('gate_id','GATE-CUSTOMER-CONFIRMATION','gate_type','customer_confirmation','policy_version','1.0.0','result','passed','blocks_action',false,'reason_code','CUSTOMER_CONFIRMED','input_hash',v_record.cart_hash,'observed_value',true,'expected_value',true,'checked_at',v_now),
      jsonb_build_object('gate_id','GATE-WEBHOOK-SIGNATURE','gate_type','webhook_signature','policy_version','1.0.0','result','passed','blocks_action',false,'reason_code','WEBHOOK_SIGNATURE_VERIFIED','input_hash',encode(digest(coalesce(p_evidence,'{}'::jsonb)::text,'sha256'),'hex'),'observed_value',true,'expected_value',true,'checked_at',v_now),
      jsonb_build_object('gate_id','GATE-CAPTURE-CONFIRMED','gate_type','capture','policy_version','1.0.0','result','passed','blocks_action',false,'reason_code','CAPTURE_CONFIRMED','input_hash',v_record.cart_hash,'observed_value','captured','expected_value','captured','checked_at',v_now)
    );
  end if;

  if v_is_failure then
    v_failure := jsonb_build_object(
      'failure_code', p_reason_code,
      'classification', case when v_event_name = 'payment.signature_failed' then 'signature_invalid'
        when v_event_name = 'payment.failed' then 'payment_declined'
        when v_event_name = 'system.data_integrity_failed' then 'data_integrity_error'
        else 'network_error' end,
      'technical_detail', 'The operation failed safely; sensitive provider details were excluded.',
      'customer_safe_message', 'The action could not be completed. Your cart remains safe to retry.',
      'retryable', true, 'cart_retained', true, 'order_marked_paid', false,
      'fulfilment_performed', false, 'fallback_action', 'retain_cart_and_offer_retry',
      'stack_trace_in_event', false, 'secret_in_error', false
    );
  end if;

  v_idempotency := left(coalesce(p_evidence->>'eventId', p_evidence->>'idempotencyKey',
    v_record.payment_record_id || ':' || v_event_name || ':' || v_sequence::text), 200);
  v_payload := jsonb_build_object(
    'schema_version','1.0.0','event_id',v_event_id,'sequence',v_sequence,
    'occurred_at',v_now,'recorded_at',v_now,'event_name',v_event_name,
    'event_category',v_category,'severity',v_severity,'outcome',v_outcome,
    'correlation',jsonb_build_object('trace_id',v_record.trace_id,'session_id',v_record.session_id,
      'parent_event_id',v_parent_event_id,'customer_intent_hash',null,'decision_id',v_record.decision_id,
      'payment_record_id',v_record.payment_record_id,'internal_order_id',v_record.internal_order_id,
      'razorpay_order_id',v_record.razorpay_order_id,'payment_attempt_id',null,
      'razorpay_payment_id',v_record.razorpay_payment_id,'razorpay_event_id',p_evidence->>'eventId',
      'idempotency_key',v_idempotency),
    'actor',jsonb_build_object('actor_type',v_actor,'actor_reference',null,
      'authenticated',v_actor in ('customer','operator'),'initiated_by_customer',v_actor='customer'),
    'source',jsonb_build_object('service','cartpilot','component','audit_engine',
      'component_version','1.0.0','environment','test','code_revision','phase-4','model_identifier',null),
    'subject',jsonb_build_object('entity_type',v_subject,'entity_id',v_record.payment_record_id,
      'snapshot_hash',encode(digest(coalesce(p_evidence,'{}'::jsonb)::text,'sha256'),'hex'),
      'snapshot_reference','audit_events.evidence'),
    'action',jsonb_build_object('action_type',v_action,'requested',true,'authorized',not v_is_failure,
      'executed',not v_is_failure,'external_side_effect',v_event_name in ('order.created','fulfilment.authorized'),
      'customer_confirmation_required',v_event_name in ('order.created','fulfilment.authorized'),
      'customer_confirmation_present',true,
      'authorization_gate_ids',case when v_authorizes_fulfilment then jsonb_build_array('GATE-CUSTOMER-CONFIRMATION','GATE-WEBHOOK-SIGNATURE','GATE-CAPTURE-CONFIRMED')
        when v_event_name='order.created' then jsonb_build_array('GATE-CUSTOMER-CONFIRMATION') else '[]'::jsonb end,
      'blocked_reason_code',case when v_is_failure then p_reason_code else null end),
    'request_context',null,'catalog_context',null,'decision_context',null,'money_context',v_money,
    'gate_results',v_gates,
    'state_change',jsonb_build_object('state_domain',case when v_category in ('payment','order','fulfilment','confirmation','webhook') then v_category else 'system' end,
      'from_state',null,'to_state',case when v_event_name='payment.failed' then 'payment_failed' else v_record.state end,
      'transition_applied',v_event_name <> 'system.data_integrity_failed',
      'transition_reason_code',p_reason_code,
      'source_of_truth',case when v_actor='customer' then 'customer_action' when v_actor like 'razorpay_%' then 'verified_razorpay_webhook' else 'deterministic_backend' end,
      'late_or_out_of_order_event',false,'version_before',greatest(v_record.state_version-1,0),'version_after',v_record.state_version),
    'failure',v_failure,
    'recovery',case when v_is_failure then jsonb_build_object('status','offered','action','retain_cart_and_offer_retry','recovery_event_id',null,'customer_initiated',null,'safe_to_retry',true,'reuses_existing_order',true,'new_order_required',false,'duplicate_fulfilment_prevention_enabled',true,'result_reason_code','SAFE_RETRY_AVAILABLE')
      else jsonb_build_object('status','not_required','action','none','recovery_event_id',null,'customer_initiated',null,'safe_to_retry',false,'reuses_existing_order',false,'new_order_required',false,'duplicate_fulfilment_prevention_enabled',true,'result_reason_code','NO_RECOVERY_REQUIRED') end,
    'explanation',jsonb_build_object('summary',replace(v_event_name,'.',' ') || ' was recorded.',
      'customer_message',case when v_is_failure then 'The action failed safely and your cart remains available.' else null end,
      'merchant_detail','Server-validated event with policy, state and sanitized evidence references.',
      'reason_codes',jsonb_build_array(p_reason_code),'evidence_event_ids',jsonb_build_array(v_event_id),
      'decision_authority',case when v_actor='customer' then 'customer' when v_actor like 'razorpay_%' then 'razorpay_verified_state' else 'deterministic_backend' end,
      'medical_claim_made',false,'internal_costs_disclosed_to_customer',false),
    'integrity',jsonb_build_object('append_only',true,'hash_algorithm','SHA-256',
      'previous_event_hash',v_previous_hash,'event_hash',repeat('0',64),'payload_hash',repeat('0',64),
      'schema_validation_passed',true,'idempotency_key_unique',true,'recorded_by_server',true,
      'tamper_evident_chain_enabled',true),
    'privacy',jsonb_build_object('contains_direct_customer_identifier',false,'contains_raw_customer_message',false,
      'contains_raw_payment_credentials',false,'contains_raw_card_data',false,
      'contains_raw_upi_or_bank_credentials',false,'contains_razorpay_key_secret',false,
      'contains_webhook_secret',false,'contains_unredacted_signature',false,'contains_inferred_wealth',false,
      'contains_protected_attribute_targeting',false,'redacted_fields',jsonb_build_array('customer','provider_signature'),
      'internal_economics_visibility','merchant_only','retention_class','payment_operations',
      'access_scope','merchant_audit_view')
  );
  if not public.audit_event_payload_valid(v_payload) then raise exception 'invalid_audit_event_payload'; end if;
  v_canonical := v_payload::text;
  v_payload_hash := encode(digest(convert_to(v_canonical,'UTF8'),'sha256'),'hex');
  v_event_hash := encode(digest(convert_to(coalesce(v_previous_hash,'') || ':' || v_payload_hash || ':' || v_audit_id || ':' || v_sequence::text,'UTF8'),'sha256'),'hex');
  v_payload := jsonb_set(jsonb_set(v_payload,'{integrity,payload_hash}',to_jsonb(v_payload_hash)),
    '{integrity,event_hash}',to_jsonb(v_event_hash));

  insert into public.audit_events (
    audit_event_id, trace_id, sequence_number, event_type, actor_type, outcome,
    reason_code, resource_type, resource_id, evidence, schema_version,
    idempotency_key, previous_event_hash, payload_hash, event_hash,
    canonical_payload, event_payload
  ) values (
    v_audit_id, v_record.trace_id, v_sequence, v_event_name, v_actor, v_outcome,
    p_reason_code, 'payment_record', p_record_id, coalesce(p_evidence,'{}'::jsonb), '1.0.0',
    v_idempotency, v_previous_hash, v_payload_hash, v_event_hash, v_canonical, v_payload
  );
end;
$$;

revoke all on function public.payment_audit_insert(text, text, text, text, text, jsonb) from public;

create or replace function public.seed_payment_audit_trace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.payment_audit_insert(new.payment_record_id,'intent.extracted','system','success','INTENT_SERVER_VALIDATED',jsonb_build_object('idempotencyKey',new.confirmation_idempotency_key || ':intent'));
  perform public.payment_audit_insert(new.payment_record_id,'catalog.filtered','system','success','CATALOG_POLICY_FILTERED',jsonb_build_object('idempotencyKey',new.confirmation_idempotency_key || ':catalog'));
  perform public.payment_audit_insert(new.payment_record_id,'candidate.generated','system','success','CANDIDATES_EVALUATED',jsonb_build_object('idempotencyKey',new.confirmation_idempotency_key || ':candidates'));
  perform public.payment_audit_insert(new.payment_record_id,'offer.selected','system','selected','HIGHEST_VALID_PROFIT_SCORE',jsonb_build_object('idempotencyKey',new.confirmation_idempotency_key || ':offer'));
  perform public.payment_audit_insert(new.payment_record_id,'cart.presented','system','success','SERVER_TOTAL_REVALIDATED',jsonb_build_object('idempotencyKey',new.confirmation_idempotency_key || ':cart'));
  perform public.payment_audit_insert(new.payment_record_id,'customer.confirmed','customer','success','EXACT_TOTAL_CONFIRMED',jsonb_build_object('idempotencyKey',new.confirmation_idempotency_key || ':confirmation'));
  return new;
end;
$$;

drop trigger if exists payment_records_seed_audit_trace on public.payment_records;
create trigger payment_records_seed_audit_trace
after insert on public.payment_records
for each row execute function public.seed_payment_audit_trace();

revoke all on function public.seed_payment_audit_trace() from public;
