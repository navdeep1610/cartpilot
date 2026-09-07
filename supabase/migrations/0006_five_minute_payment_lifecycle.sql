-- Five-minute checkout lifecycle and one-fulfilment protection.
-- A failed Razorpay order may be retried only during its bounded grace period.
-- After that period the application confirms a fresh payment record/order.

create or replace function public.start_payment_retry(
  p_record_id text,
  p_session_id text,
  p_idempotency_key text
) returns public.payment_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record public.payment_records;
  v_before text;
begin
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:-]{16,160}$' then
    raise exception 'invalid_idempotency_key';
  end if;
  select * into v_record from public.payment_records
  where payment_record_id = p_record_id and session_id = p_session_id for update;
  if not found or v_record.razorpay_order_id is null then raise exception 'payment_record_not_found'; end if;
  if v_record.capture_confirmed or v_record.fulfilment_authorized then raise exception 'paid_order_cannot_retry'; end if;
  if v_record.last_retry_idempotency_key = p_idempotency_key then return v_record; end if;
  if v_record.state not in ('payment_failed','signature_verification_failed','cancelled') then
    raise exception 'payment_retry_not_allowed';
  end if;
  if v_record.failure_code = 'PAYMENT_TIMEOUT_5M'
     or v_record.updated_at <= now() - interval '5 minutes' then
    raise exception 'payment_retry_window_expired';
  end if;

  v_before := v_record.state;
  update public.payment_records set
    state = 'order_created', failure_code = null, razorpay_payment_id = null,
    callback_verified = false, callback_idempotency_key = null,
    last_retry_idempotency_key = p_idempotency_key,
    payment_retry_count = payment_retry_count + 1,
    state_version = state_version + 1, updated_at = now()
  where payment_record_id = p_record_id returning * into v_record;

  insert into public.payment_transitions (
    payment_record_id, from_state, to_state, trigger, source, applied, reason_code
  ) values (p_record_id, v_before, 'order_created', 'customer_payment_retry',
    'customer_api', true, 'SAFE_PAYMENT_RETRY_STARTED');
  perform public.payment_audit_insert(p_record_id, 'payment.retry_started', 'customer',
    'success', 'SAFE_PAYMENT_RETRY_STARTED', jsonb_build_object(
      'idempotencyKey', p_idempotency_key, 'cartRetained', true,
      'razorpayOrderReused', true, 'retryWindowMinutes', 5,
      'fulfilmentAuthorized', false));
  return v_record;
end;
$$;

revoke all on function public.start_payment_retry(text, text, text) from public;
grant execute on function public.start_payment_retry(text, text, text) to service_role;

create or replace function public.guard_single_checkout_fulfilment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.fulfilment_authorized
     and not old.fulfilment_authorized
     and exists (
       select 1
       from public.payment_records existing
       where existing.payment_record_id <> new.payment_record_id
         and existing.decision_id = new.decision_id
         and existing.cart_hash = new.cart_hash
         and existing.fulfilment_authorized
     ) then
    new.fulfilment_authorized := false;
    new.manual_review_required := true;
    new.failure_code := 'DUPLICATE_PAYMENT_CAPTURED';
  end if;
  return new;
end;
$$;

drop trigger if exists payment_records_single_checkout_fulfilment on public.payment_records;
create trigger payment_records_single_checkout_fulfilment
before update of fulfilment_authorized on public.payment_records
for each row execute function public.guard_single_checkout_fulfilment();

create unique index if not exists payment_records_one_fulfilment_per_cart_idx
  on public.payment_records (decision_id, cart_hash)
  where fulfilment_authorized;
