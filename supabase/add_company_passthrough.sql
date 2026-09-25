-- ================================================================
-- Migration: โหมด "ผ่านบริษัท" — เงินผ่านบริษัทตัวกลาง หัก VAT + หัก ณ ที่จ่าย
-- + ค่าดำเนินการบริษัท ก่อนนำมาแบ่งให้ทีม
--
-- วิธีรัน: Supabase Dashboard → SQL Editor → New query → วางแล้ว Run
-- รันซ้ำได้ (idempotent)
-- ================================================================

alter table projects add column if not exists company_pass_through boolean not null default false;
alter table projects add column if not exists vat_rate numeric not null default 7;
alter table projects add column if not exists wht_rate numeric not null default 3;
alter table projects add column if not exists company_fee_rate numeric not null default 10;
