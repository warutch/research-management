-- ================================================================
-- Migration: เพิ่มหมวด workspace 'personal' (งานส่วนตัว)
-- เดิม constraint ยอมรับแค่ ('doctor','student') → เพิ่ม 'personal'
--
-- robust: เพิ่ม column workspace ก่อนถ้ายังไม่มี (บาง table ใน DB เก่า
-- อาจยังไม่มี column นี้) แล้วค่อยตั้ง constraint
--
-- วิธีรัน: Supabase Dashboard → SQL Editor → New query → วางแล้ว Run
-- รันซ้ำได้ (idempotent)
-- ================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects','payments','distributions','quotations','tracking_activities'
  ] loop
    -- 1) เพิ่ม column workspace ถ้ายังไม่มี
    execute format('alter table %I add column if not exists workspace text not null default ''doctor''', t);
    -- 2) ตั้ง constraint ใหม่ให้รวม 'personal'
    execute format('alter table %I drop constraint if exists %I_workspace_chk', t, t);
    execute format(
      'alter table %I add constraint %I_workspace_chk '
      || 'check (workspace in (''doctor'',''student'',''personal''))', t, t);
  end loop;
end $$;
