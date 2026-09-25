-- ============================================================
-- Audit trail (P3): เพิ่มคอลัมน์ updated_at ที่อัปเดตอัตโนมัติทุกครั้งที่แก้ไข
-- รันซ้ำได้ปลอดภัย (idempotent)
-- ============================================================

-- ฟังก์ชัน trigger กลาง — ตั้ง updated_at = now() ก่อน UPDATE ทุกครั้ง
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

-- เพิ่มคอลัมน์ + trigger ให้ทุกตาราง
do $$
declare
  t text;
  tables text[] := array['projects', 'payments', 'distributions', 'quotations', 'tracking_activities', 'pool_transactions'];
begin
  foreach t in array tables loop
    -- ข้ามตารางที่ยังไม่มี (เผื่อ pool_transactions/tracking_activities ยังไม่ได้สร้าง)
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
      execute format('drop trigger if exists trg_set_updated_at on public.%I', t);
      execute format('create trigger trg_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    end if;
  end loop;
end $$;
