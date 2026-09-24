-- ================================================================
-- Migration: เพิ่ม column 'expenses' (ค่าดำเนินการโครงการ) ให้ตาราง projects
-- เก็บเป็น JSONB list ของ { id, name, amount, paidBy }
-- ใช้หักออกจากรายได้ก่อนแบ่ง แล้วจ่ายคืนผู้ที่ออกเงิน
--
-- วิธีรัน: Supabase Dashboard → SQL Editor → New query → วางแล้ว Run
-- รันซ้ำได้ (idempotent)
-- ================================================================

alter table projects add column if not exists expenses jsonb default '[]'::jsonb;
