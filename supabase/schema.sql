-- ================================================================
-- Research Management System - Supabase Schema
-- รัน script นี้ใน Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ================================================================

-- ================================================================
-- 1. Tables
-- ================================================================

-- Projects (activities + installments เก็บเป็น JSONB)
create table if not exists projects (
  id uuid primary key,
  project_code text,
  name text not null,
  client text default '',
  budget numeric default 0,
  start_date text default '',
  end_date text default '',
  status text default 'pending',
  activities jsonb default '[]'::jsonb,
  installments jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- Payments (รับเงินจากลูกค้า)
create table if not exists payments (
  id uuid primary key,
  project_id uuid references projects(id) on delete cascade,
  installment_id text default '',
  amount numeric default 0,
  paid_date text default '',
  slip_url text default '',
  note text default '',
  created_at timestamptz default now()
);

-- Distributions (โอนเงินให้สมาชิก)
create table if not exists distributions (
  id uuid primary key,
  project_id uuid references projects(id) on delete cascade,
  recipient_id text default '',  -- tangmo|frank|ton|horse|pool
  amount numeric default 0,
  paid_date text default '',
  slip_url text default '',
  note text default '',
  created_at timestamptz default now()
);

-- Quotations (items เก็บเป็น JSONB)
create table if not exists quotations (
  id uuid primary key,
  quotation_number text default '',
  project_id text default '',
  client_name text default '',
  client_address text default '',
  client_phone text default '',
  items jsonb default '[]'::jsonb,
  date text default '',
  valid_until text default '',
  notes text default '',
  discount numeric default 0,
  created_at timestamptz default now()
);

-- ================================================================
-- 2. Row Level Security (RLS)
-- เปิด RLS แล้วอนุญาตเฉพาะ authenticated user
-- ================================================================

alter table projects enable row level security;
alter table payments enable row level security;
alter table distributions enable row level security;
alter table quotations enable row level security;

-- Drop existing policies (ถ้ามี) ก่อนสร้างใหม่
drop policy if exists "Allow authenticated all" on projects;
drop policy if exists "Allow authenticated all" on payments;
drop policy if exists "Allow authenticated all" on distributions;
drop policy if exists "Allow authenticated all" on quotations;

-- ทุก authenticated user เข้าถึงได้ (read + write)
create policy "Allow authenticated all" on projects
  for all to authenticated using (true) with check (true);

create policy "Allow authenticated all" on payments
  for all to authenticated using (true) with check (true);

create policy "Allow authenticated all" on distributions
  for all to authenticated using (true) with check (true);

create policy "Allow authenticated all" on quotations
  for all to authenticated using (true) with check (true);

-- ================================================================
-- เสร็จแล้ว! ไปสร้าง user accounts ที่ Authentication → Users
-- ================================================================
