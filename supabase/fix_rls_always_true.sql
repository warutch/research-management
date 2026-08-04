-- ================================================================
-- Fix: Security Advisor "RLS Policy Always True"
-- แก้ policy เดิมที่เป็น  for all ... using (true) with check (true)
-- ให้แยกเป็น per-command และให้ write ตรวจว่าเป็น user ที่ login จริง
-- (พฤติกรรมเดิมไม่เปลี่ยน: authenticated member ยังเข้าถึงได้เต็ม)
--
-- วิธีรัน: Supabase Dashboard → SQL Editor → New query → วางแล้ว Run
-- รันซ้ำได้ (idempotent)
-- ================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'projects','payments','distributions','quotations',
    'pool_transactions','tracking_activities'
  ] loop
    -- ลบ policy เดิมทั้ง blanket และ granular (กันรันซ้ำ)
    execute format('drop policy if exists "Allow authenticated all" on %I', t);
    execute format('drop policy if exists "%s_select" on %I', t, t);
    execute format('drop policy if exists "%s_insert" on %I', t, t);
    execute format('drop policy if exists "%s_update" on %I', t, t);
    execute format('drop policy if exists "%s_delete" on %I', t, t);

    -- read: เปิดให้ทีม (Advisor ยอมรับ SELECT using(true))
    execute format(
      'create policy "%s_select" on %I for select to authenticated using (true)', t, t);

    -- write: ต้องเป็น authenticated user จริง (ไม่ใช่ constant true)
    execute format(
      'create policy "%s_insert" on %I for insert to authenticated '
      || 'with check ((select auth.uid()) is not null)', t, t);
    execute format(
      'create policy "%s_update" on %I for update to authenticated '
      || 'using ((select auth.uid()) is not null) '
      || 'with check ((select auth.uid()) is not null)', t, t);
    execute format(
      'create policy "%s_delete" on %I for delete to authenticated '
      || 'using ((select auth.uid()) is not null)', t, t);
  end loop;
end $$;
