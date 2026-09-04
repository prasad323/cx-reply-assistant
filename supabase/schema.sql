-- =========================================================
-- CX Reply Assistant — schema + mock/seed data
-- Run this whole file in the Supabase SQL Editor.
-- =========================================================

create extension if not exists "pgcrypto";

-- ---------- BRANDS ----------
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- ---------- KNOWLEDGE BASE ----------
create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  policy_type text not null check (policy_type in ('return', 'refund', 'shipping', 'cancellation')),
  content text not null,
  created_at timestamptz default now()
);

-- ---------- CUSTOMERS ----------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  name text not null,
  email text,
  created_at timestamptz default now()
);

-- ---------- ORDERS ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  brand_id uuid references brands(id) on delete cascade,
  order_number text not null,
  product_name text not null,
  delivered_at timestamptz,
  created_at timestamptz default now()
);

-- ---------- CONVERSATIONS ----------
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  created_at timestamptz default now()
);

-- ---------- MESSAGES ----------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  sender text not null check (sender in ('customer', 'agent')),
  content text not null,
  created_at timestamptz default now()
);

-- ---------- REPLY LOGS (Core Requirement #5: Data & Logging) ----------
create table if not exists reply_logs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  customer_message text not null,
  retrieved_context jsonb,             -- KB snippets that were retrieved
  ai_generated_response text,
  agent_edited_response text,
  final_response text,
  status text default 'generated' check (status in ('generated', 'approved')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row Level Security (kept open here for assessment/demo purposes —
-- see architecture doc for the real multi-tenant policy design)
alter table brands enable row level security;
alter table knowledge_base enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table reply_logs enable row level security;

create policy "public read (demo only)" on brands for select using (true);
create policy "public read (demo only)" on knowledge_base for select using (true);
create policy "public read (demo only)" on customers for select using (true);
create policy "public read (demo only)" on orders for select using (true);
create policy "public read (demo only)" on conversations for select using (true);
create policy "public read (demo only)" on messages for select using (true);
create policy "public read (demo only)" on reply_logs for select using (true);
create policy "service role write" on reply_logs for insert with check (true);
create policy "service role update" on reply_logs for update using (true);

-- =========================================================
-- SEED / MOCK DATA — matches the assessment's example scenario
-- =========================================================

do $$
declare
  v_brand_id uuid;
  v_customer_id uuid;
  v_order_id uuid;
  v_conversation_id uuid;
begin
  insert into brands (name) values ('HydroBottle Co.') returning id into v_brand_id;

  insert into knowledge_base (brand_id, policy_type, content) values
    (v_brand_id, 'return',
     'Customers may return unused, unopened items within 30 days of delivery for a full refund. Damaged or defective items can be reported within 14 days of delivery for a replacement or refund, no return shipping required — just photos of the damage.'),
    (v_brand_id, 'refund',
     'Refunds are only permitted within 7 days of delivery for change-of-mind returns. For damaged or defective products, refunds can be issued within 14 days of delivery once the customer provides photos showing the damage. Refunds are processed to the original payment method within 5-7 business days after approval.'),
    (v_brand_id, 'shipping',
     'Standard shipping takes 3-5 business days. Express shipping takes 1-2 business days. Shipping is free on orders over ₹999.'),
    (v_brand_id, 'cancellation',
     'Orders can be cancelled free of charge within 1 hour of placing the order. After that, if the order has not yet shipped, a cancellation request can be submitted and is subject to approval.');

  insert into customers (brand_id, name, email)
    values (v_brand_id, 'Priya Sharma', 'priya.sharma@example.com')
    returning id into v_customer_id;

  insert into orders (customer_id, brand_id, order_number, product_name, delivered_at)
    values (v_customer_id, v_brand_id, 'HB-10293', 'HydroBottle Steel 1L', now() - interval '3 days')
    returning id into v_order_id;

  insert into conversations (brand_id, customer_id, order_id)
    values (v_brand_id, v_customer_id, v_order_id)
    returning id into v_conversation_id;

  insert into messages (conversation_id, sender, content, created_at) values
    (v_conversation_id, 'customer', 'Hi, I just received my order.', now() - interval '10 minutes'),
    (v_conversation_id, 'agent', 'Hi Priya! Great, thanks for letting us know. Is everything looking good?', now() - interval '9 minutes'),
    (v_conversation_id, 'customer', 'My order was delivered but the bottle is broken. What can I do?', now() - interval '2 minutes');
end $$;
