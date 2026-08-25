create table if not exists public.customer_profiles (
  customer_profile_id text primary key check (customer_profile_id ~ '^CUSTOMER-[A-Z0-9-]{36}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  email text not null check (char_length(email) <= 120 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  normalized_email text not null check (normalized_email = lower(btrim(email))),
  phone text not null check (char_length(phone) <= 20),
  normalized_phone text not null check (normalized_phone ~ '^[0-9]{8,15}$'),
  delivery_address text not null check (char_length(btrim(delivery_address)) between 8 and 300),
  profile_source text not null default 'storefront_profile' check (profile_source in ('storefront_profile', 'order_backfill')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_profiles_email_idx on public.customer_profiles (normalized_email);
create index if not exists customer_profiles_phone_idx on public.customer_profiles (normalized_phone);
create index if not exists customer_profiles_updated_idx on public.customer_profiles (updated_at desc);

alter table public.customer_profiles enable row level security;
revoke all on public.customer_profiles from anon, authenticated;

with latest_order_customer as (
  select distinct on (lower(btrim(payment_records.confirmed_cart->'customer'->>'email')))
    payment_records.confirmed_cart->'customer'->>'name' as name,
    lower(btrim(payment_records.confirmed_cart->'customer'->>'email')) as email,
    payment_records.confirmed_cart->'customer'->>'phone' as phone,
    regexp_replace(payment_records.confirmed_cart->'customer'->>'phone', '[^0-9]', '', 'g') as phone_digits,
    payment_records.confirmed_cart->'customer'->>'deliveryAddress' as delivery_address,
    payment_records.created_at
  from public.payment_records
  where jsonb_typeof(payment_records.confirmed_cart->'customer') = 'object'
    and char_length(btrim(coalesce(payment_records.confirmed_cart->'customer'->>'name', ''))) between 2 and 80
    and lower(btrim(coalesce(payment_records.confirmed_cart->'customer'->>'email', ''))) ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and char_length(regexp_replace(coalesce(payment_records.confirmed_cart->'customer'->>'phone', ''), '[^0-9]', '', 'g')) between 8 and 15
    and char_length(btrim(coalesce(payment_records.confirmed_cart->'customer'->>'deliveryAddress', ''))) between 8 and 300
  order by lower(btrim(payment_records.confirmed_cart->'customer'->>'email')), payment_records.created_at desc
)
insert into public.customer_profiles (
  customer_profile_id, name, email, normalized_email, phone, normalized_phone,
  delivery_address, profile_source, created_at, updated_at
)
select
  'CUSTOMER-' || upper(gen_random_uuid()::text),
  latest_order_customer.name,
  latest_order_customer.email,
  latest_order_customer.email,
  latest_order_customer.phone,
  latest_order_customer.phone_digits,
  latest_order_customer.delivery_address,
  'order_backfill',
  latest_order_customer.created_at,
  latest_order_customer.created_at
from latest_order_customer
where not exists (
  select 1 from public.customer_profiles
  where customer_profiles.normalized_email = latest_order_customer.email
);
