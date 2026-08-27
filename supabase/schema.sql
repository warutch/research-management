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
  slip_url text default '',  -- backwards compat (deprecated)
  slip_urls jsonb default '[]'::jsonb,  -- รองรับหลายไฟล์
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
  slip_url text default '',  -- backwards compat (deprecated)
  slip_urls jsonb default '[]'::jsonb,  -- รองรับหลายไฟล์
  note text default '',
  created_at timestamptz default now()
);

-- Migration: เพิ่ม slip_urls column ถ้ามี table อยู่แล้ว
alter table payments add column if not exists slip_urls jsonb default '[]'::jsonb;
alter table distributions add column if not exists slip_urls jsonb default '[]'::jsonb;

-- Tracking Activities (Calendar tasks)
create table if not exists tracking_activities (
  id uuid primary key,
  title text not null,
  description text default '',
  project_id text default '',
  assignee_id text default '',
  start_date text default '',
  deadline text default '',
  status text default 'todo',
  priority text default 'medium',
  created_at timestamptz default now()
);

alter table tracking_activities enable row level security;
drop policy if exists "Allow authenticated all" on tracking_activities;
drop policy if exists "tracking_activities_select" on tracking_activities;
drop policy if exists "tracking_activities_insert" on tracking_activities;
drop policy if exists "tracking_activities_update" on tracking_activities;
drop policy if exists "tracking_activities_delete" on tracking_activities;
create policy "tracking_activities_select" on tracking_activities for select to authenticated using (true);
create policy "tracking_activities_insert" on tracking_activities for insert to authenticated with check ((select auth.uid()) is not null);
create policy "tracking_activities_update" on tracking_activities for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "tracking_activities_delete" on tracking_activities for delete to authenticated using ((select auth.uid()) is not null);

-- Pool money transactions (เงินกองกลาง)
-- balance = Σ(pool_transactions type=in) + Σ(distributions where recipient='pool') − Σ(pool_transactions type=out)
create table if not exists pool_transactions (
  id uuid primary key,
  type text not null,           -- opening_balance | transfer_in | spending | to_member | to_other | other_in | other_out
  amount numeric not null default 0,
  date text default '',
  source text default '',       -- สำหรับ transfer_in
  category text default '',     -- สำหรับ spending
  recipient_member_id text default '',  -- สำหรับ to_member (tangmo|frank|ton)
  recipient_name text default '',       -- สำหรับ to_other
  description text default '',
  slip_urls jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table pool_transactions enable row level security;
drop policy if exists "Allow authenticated all" on pool_transactions;
drop policy if exists "pool_transactions_select" on pool_transactions;
drop policy if exists "pool_transactions_insert" on pool_transactions;
drop policy if exists "pool_transactions_update" on pool_transactions;
drop policy if exists "pool_transactions_delete" on pool_transactions;
create policy "pool_transactions_select" on pool_transactions for select to authenticated using (true);
create policy "pool_transactions_insert" on pool_transactions for insert to authenticated with check ((select auth.uid()) is not null);
create policy "pool_transactions_update" on pool_transactions for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "pool_transactions_delete" on pool_transactions for delete to authenticated using ((select auth.uid()) is not null);

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
-- ทั้ง policy เดิม (blanket) และ policy granular ชุดใหม่ เพื่อให้รันซ้ำได้
do $$
declare
  t text;
begin
  foreach t in array array['projects','payments','distributions','quotations'] loop
    execute format('drop policy if exists "Allow authenticated all" on %I', t);
    execute format('drop policy if exists "%s_select" on %I', t, t);
    execute format('drop policy if exists "%s_insert" on %I', t, t);
    execute format('drop policy if exists "%s_update" on %I', t, t);
    execute format('drop policy if exists "%s_delete" on %I', t, t);
  end loop;
end $$;

-- ทุก authenticated user เข้าถึงได้ (read + write)
-- แยกเป็น per-command policy: อ่านเปิดให้ทีม, เขียนต้องเป็น user ที่ login จริง
-- (ใช้ (select auth.uid()) is not null แทน true เพื่อไม่ให้เป็น constant-true
--  ซึ่งเป็นสาเหตุของ Security Advisor "RLS Policy Always True")

-- projects
create policy "projects_select" on projects for select to authenticated using (true);
create policy "projects_insert" on projects for insert to authenticated with check ((select auth.uid()) is not null);
create policy "projects_update" on projects for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "projects_delete" on projects for delete to authenticated using ((select auth.uid()) is not null);

-- payments
create policy "payments_select" on payments for select to authenticated using (true);
create policy "payments_insert" on payments for insert to authenticated with check ((select auth.uid()) is not null);
create policy "payments_update" on payments for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "payments_delete" on payments for delete to authenticated using ((select auth.uid()) is not null);

-- distributions
create policy "distributions_select" on distributions for select to authenticated using (true);
create policy "distributions_insert" on distributions for insert to authenticated with check ((select auth.uid()) is not null);
create policy "distributions_update" on distributions for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "distributions_delete" on distributions for delete to authenticated using ((select auth.uid()) is not null);

-- quotations
create policy "quotations_select" on quotations for select to authenticated using (true);
create policy "quotations_insert" on quotations for insert to authenticated with check ((select auth.uid()) is not null);
create policy "quotations_update" on quotations for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);
create policy "quotations_delete" on quotations for delete to authenticated using ((select auth.uid()) is not null);

-- ================================================================
-- 3. Workspace column (Doctor / Student mode)
-- รันได้ทั้ง fresh install และ migrate ของเดิม (idempotent)
-- ข้อมูลเก่าทั้งหมดจะถูก default เป็น 'doctor' — ถ้ามี student data
-- ต้อง UPDATE เอง เช่น:
--   update projects set workspace='student' where id in ('xxx', 'yyy');
-- ================================================================

alter table projects add column if not exists workspace text not null default 'doctor';
alter table payments add column if not exists workspace text not null default 'doctor';
alter table distributions add column if not exists workspace text not null default 'doctor';
alter table quotations add column if not exists workspace text not null default 'doctor';
alter table tracking_activities add column if not exists workspace text not null default 'doctor';

-- บังคับให้ workspace เป็น 'doctor' หรือ 'student' เท่านั้น
-- (drop ก่อน เผื่อรันซ้ำ)
alter table projects drop constraint if exists projects_workspace_chk;
alter table projects add constraint projects_workspace_chk check (workspace in ('doctor','student','personal'));

alter table payments drop constraint if exists payments_workspace_chk;
alter table payments add constraint payments_workspace_chk check (workspace in ('doctor','student','personal'));

alter table distributions drop constraint if exists distributions_workspace_chk;
alter table distributions add constraint distributions_workspace_chk check (workspace in ('doctor','student','personal'));

alter table quotations drop constraint if exists quotations_workspace_chk;
alter table quotations add constraint quotations_workspace_chk check (workspace in ('doctor','student','personal'));

alter table tracking_activities drop constraint if exists tracking_activities_workspace_chk;
alter table tracking_activities add constraint tracking_activities_workspace_chk check (workspace in ('doctor','student','personal'));

create index if not exists idx_projects_workspace on projects(workspace);
create index if not exists idx_payments_workspace on payments(workspace);
create index if not exists idx_distributions_workspace on distributions(workspace);
create index if not exists idx_quotations_workspace on quotations(workspace);
create index if not exists idx_tracking_activities_workspace on tracking_activities(workspace);

-- ================================================================
-- 4. Migration: Commission (รายโครงการ — Student default 1000)
-- ================================================================
alter table projects add column if not exists commission numeric not null default 0;

-- ส่วนลด % รายโครงการ — ใช้ต่อในใบเสนอราคา
alter table projects add column if not exists discount numeric not null default 0;

-- ================================================================
-- 5. Migration: has_slip generated column
-- แก้ปัญหา "statement timeout" — เดิม select * ต้องดึง slip_urls (base64 images MB-scale)
-- has_slip เป็น boolean คำนวณอัตโนมัติจาก slip_url/slip_urls → cheap to load
-- App จะ SELECT ทุก column ยกเว้น slip_url+slip_urls (ใช้ has_slip เช็คว่ามี slip ไหม)
-- เมื่อผู้ใช้กด "ดู slip" → fetch เฉพาะ record นั้นทีหลัง
-- ================================================================
alter table payments add column if not exists has_slip boolean
  generated always as (
    (coalesce(slip_url, '') != '')
    or (coalesce(jsonb_array_length(slip_urls), 0) > 0)
  ) stored;

alter table distributions add column if not exists has_slip boolean
  generated always as (
    (coalesce(slip_url, '') != '')
    or (coalesce(jsonb_array_length(slip_urls), 0) > 0)
  ) stored;

alter table pool_transactions add column if not exists has_slip boolean
  generated always as (
    (coalesce(jsonb_array_length(slip_urls), 0) > 0)
  ) stored;

-- ================================================================
-- 6. Performance indexes
-- เดิมไม่มี index บน foreign key columns → Postgres seq-scan ทุกครั้งที่ query
-- ผลลัพธ์: หน้า projects/payments ช้าลงมากเมื่อ data โต
-- ================================================================
-- Payments — join กับ projects/installments เป็นหลัก
create index if not exists idx_payments_project_id on payments(project_id);
create index if not exists idx_payments_installment_id on payments(installment_id);
create index if not exists idx_payments_paid_date on payments(paid_date desc);

-- Distributions — join กับ projects, filter ตาม recipient
create index if not exists idx_distributions_project_id on distributions(project_id);
create index if not exists idx_distributions_recipient_id on distributions(recipient_id);
create index if not exists idx_distributions_paid_date on distributions(paid_date desc);

-- Projects — sort ตาม created_at desc เป็น default
create index if not exists idx_projects_created_at on projects(created_at desc);
create index if not exists idx_projects_status on projects(status);

-- Quotations — sort ตาม date
create index if not exists idx_quotations_date on quotations(date desc);

-- Pool transactions — sort ตาม date
create index if not exists idx_pool_transactions_date on pool_transactions(date desc);
create index if not exists idx_pool_transactions_type on pool_transactions(type);

-- Tracking activities — filter/sort ตาม start_date / deadline
create index if not exists idx_tracking_activities_start_date on tracking_activities(start_date desc);
create index if not exists idx_tracking_activities_deadline on tracking_activities(deadline desc);

-- ================================================================
-- เสร็จแล้ว! ไปสร้าง user accounts ที่ Authentication → Users
-- ================================================================
