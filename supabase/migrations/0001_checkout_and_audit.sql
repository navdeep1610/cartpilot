create extension if not exists pgcrypto;

create table if not exists public.offer_decisions (
  decision_record_id uuid primary key default gen_random_uuid(),
  decision_id text not null,
  session_id text not null,
  catalog_version text not null,
  policy_version text not null,
  selected_candidate_id text not null,
  customer_total_paise integer not null check (customer_total_paise > 0),
  cart_hash text not null check (cart_hash ~ '^[a-f0-9]{64}$'),
  decision_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (decision_id, session_id, cart_hash)
);

create table if not exists public.payment_records (
  payment_record_id text primary key check (payment_record_id ~ '^PAYREC-[A-Z0-9-]{8,80}$'),
  internal_order_id text not null unique check (internal_order_id ~ '^ORD-[A-Z0-9-]{8,80}$'),
  decision_id text not null,
  session_id text not null,
  cart_hash text not null check (cart_hash ~ '^[a-f0-9]{64}$'),
  confirmed_cart jsonb not null,
  amount_paise integer not null check (amount_paise >= 100),
  currency text not null default 'INR' check (currency = 'INR'),
  mode text not null default 'test' check (mode = 'test'),
  state text not null default 'customer_confirmed' check (state in (
    'customer_confirmed', 'order_creation_pending', 'order_created', 'order_creation_unknown',
    'checkout_opened', 'callback_verified', 'signature_verification_failed',
    'payment_authorized', 'payment_captured', 'payment_failed', 'cancelled'
  )),
  razorpay_order_id text unique,
  razorpay_order_status text,
  razorpay_payment_id text,
  order_receipt text unique,
  callback_verified boolean not null default false,
  capture_confirmed boolean not null default false,
  capture_confirmation_source text,
  fulfilment_authorized boolean not null default false,
  failure_code text,
  order_creation_claimed_at timestamptz,
  customer_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not fulfilment_authorized or (state = 'payment_captured' and capture_confirmed))
);

create index if not exists payment_records_session_idx on public.payment_records (session_id, created_at desc);

create table if not exists public.webhook_events (
  event_id text primary key,
  event_type text not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  verified boolean not null,
  processing_status text not null check (processing_status in ('received', 'applied', 'ignored', 'failed')),
  payment_record_id text references public.payment_records(payment_record_id),
  failure_code text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.payment_transitions (
  transition_id uuid primary key default gen_random_uuid(),
  payment_record_id text not null references public.payment_records(payment_record_id),
  from_state text,
  to_state text not null,
  trigger text not null,
  source text not null,
  applied boolean not null,
  reason_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  audit_event_id text primary key check (audit_event_id ~ '^AUD-[A-Z0-9-]{8,80}$'),
  trace_id text not null,
  sequence_number integer not null check (sequence_number > 0),
  event_type text not null,
  actor_type text not null,
  outcome text not null,
  reason_code text,
  resource_type text not null,
  resource_id text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (trace_id, sequence_number)
);

alter table public.offer_decisions enable row level security;
alter table public.payment_records enable row level security;
alter table public.webhook_events enable row level security;
alter table public.payment_transitions enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.offer_decisions from anon, authenticated;
revoke all on public.payment_records from anon, authenticated;
revoke all on public.webhook_events from anon, authenticated;
revoke all on public.payment_transitions from anon, authenticated;
revoke all on public.audit_events from anon, authenticated;

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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment_record public.payment_records;
  v_payment_record_id text := 'PAYREC-' || upper(gen_random_uuid()::text);
  v_internal_order_id text := 'ORD-' || upper(gen_random_uuid()::text);
  v_audit_event_id text := 'AUD-' || upper(gen_random_uuid()::text);
begin
  if length(p_session_id) < 16 or p_amount_paise < 100 or p_cart_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_checkout_confirmation';
  end if;

  insert into public.offer_decisions (
    decision_id, session_id, catalog_version, policy_version, selected_candidate_id,
    customer_total_paise, cart_hash, decision_payload
  ) values (
    p_decision_id, p_session_id, p_catalog_version, p_policy_version, p_selected_candidate_id,
    p_amount_paise, p_cart_hash, p_decision_payload
  ) on conflict (decision_id, session_id, cart_hash) do nothing;

  select * into v_payment_record
  from public.payment_records
  where decision_id = p_decision_id and session_id = p_session_id and cart_hash = p_cart_hash
  order by created_at desc limit 1;

  if found then
    return v_payment_record;
  end if;

  insert into public.payment_records (
    payment_record_id, internal_order_id, decision_id, session_id, cart_hash,
    confirmed_cart, amount_paise, currency, mode, state
  ) values (
    v_payment_record_id, v_internal_order_id, p_decision_id, p_session_id, p_cart_hash,
    p_confirmed_cart, p_amount_paise, 'INR', 'test', 'customer_confirmed'
  ) returning * into v_payment_record;

  insert into public.payment_transitions (
    payment_record_id, from_state, to_state, trigger, source, applied, reason_code
  ) values (
    v_payment_record_id, null, 'customer_confirmed', 'customer_confirmation', 'customer_api', true,
    'EXACT_TOTAL_CONFIRMED'
  );

  insert into public.audit_events (
    audit_event_id, trace_id, sequence_number, event_type, actor_type, outcome,
    reason_code, resource_type, resource_id, evidence
  ) values (
    v_audit_event_id, v_payment_record_id, 1, 'checkout.customer_confirmed', 'customer', 'success',
    'EXACT_TOTAL_CONFIRMED', 'payment_record', v_payment_record_id,
    jsonb_build_object('decision_id', p_decision_id, 'amount_paise', p_amount_paise, 'cart_hash', p_cart_hash)
  );

  return v_payment_record;
end;
$$;

revoke all on function public.confirm_checkout(text, text, text, text, text, integer, text, jsonb, jsonb) from public;
grant execute on function public.confirm_checkout(text, text, text, text, text, integer, text, jsonb, jsonb) to service_role;
