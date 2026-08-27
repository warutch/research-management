-- ================================================================
-- Migration: เพิ่ม column 'discount' (ส่วนลด %) ให้ตาราง projects
-- ใช้เก็บส่วนลดรายโครงการ เพื่อดึงไปใส่ในใบเสนอราคาอัตโนมัติ
--
-- วิธีรัน: Supabase Dashboard → SQL Editor → New query → วางแล้ว Run
-- รันซ้ำได้ (idempotent)
-- ================================================================

alter table projects add column if not exists discount numeric not null default 0;
