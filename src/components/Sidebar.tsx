'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FolderKanban,
  Wallet,
  FileText,
  Menu,
  X,
  FlaskConical,
  Download,
  Upload,
  Banknote,
  LogOut,
  Cloud,
  User as UserIcon,
  CalendarDays,
  PiggyBank,
  RefreshCw,
} from 'lucide-react';
import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { useAuth, signOut } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/Toast';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/income', label: 'รายได้', icon: Wallet },
  { href: '/projects', label: 'โครงการ', icon: FolderKanban },
  { href: '/tracking', label: 'Tracking Activities', icon: CalendarDays },
  { href: '/quotations', label: 'ใบเสนอราคา', icon: FileText },
  { href: '/payments', label: 'ประวัติการชำระเงิน', icon: Banknote },
  { href: '/pool', label: 'เงินกองกลาง', icon: PiggyBank },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { projects, quotations, migrateFromLocalStorage, reloadAllData } = useStore();
  const [reloading, setReloading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { user } = useAuth();

  const handleBrandClick = () => {
    // Reset filters เป็น default + กลับ Dashboard
    useStore.getState().resetFilters();
    setMobileOpen(false);
    router.push('/');
  };

  // Export JSON แบบครบ — fetch เป็น chunks เล็กๆ เพื่อกัน Postgres statement_timeout
  // เดิม select * ครั้งเดียว → base64 slip payload ใหญ่มาก timeout หลัง 8 วิ
  // ตอนนี้: paginate ด้วย .range() ครั้งละ 20 rows → แต่ละ query ไม่ค้าง
  const fetchAllPaginated = async (
    table: string,
    pageSize: number,
    onProgress?: (loaded: number) => void,
  ): Promise<Record<string, unknown>[]> => {
    const all: Record<string, unknown>[] = [];
    let from = 0;
    // safety cap: 10,000 records max (ป้องกัน infinite loop ถ้ามี bug)
    while (from < 10000) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`${table} (offset ${from}): ${error.message}`);
      if (!data || data.length === 0) break;
      all.push(...(data as Record<string, unknown>[]));
      onProgress?.(all.length);
      if (data.length < pageSize) break; // last page
      from += pageSize;
    }
    return all;
  };

  const handleExport = async () => {
    setExporting(true);
    const t = toast.info('กำลังเตรียม backup — โหลด payments...', { duration: 0 });
    try {
      // ทำทีละ table (ไม่ parallel) เพื่อไม่ให้ Supabase overload
      // chunk size 20 — เผื่อ slip PNG ก้อนใหญ่ (~500KB × 20 = 10MB ต่อ query, ปลอดภัยใต้ 8 วิ)
      const payments = await fetchAllPaginated('payments', 20, (n) => {
        toast.dismiss(t);
        toast.info(`กำลังโหลด payments... (${n} รายการ)`, { duration: 0 });
      });
      toast.dismiss(t);
      const t2 = toast.info(`payments เสร็จ ${payments.length} รายการ — กำลังโหลด distributions...`, { duration: 0 });

      const distributions = await fetchAllPaginated('distributions', 20, (n) => {
        toast.dismiss(t2);
        toast.info(`กำลังโหลด distributions... (${n} รายการ)`, { duration: 0 });
      });
      toast.dismiss(t2);
      const t3 = toast.info(`distributions เสร็จ ${distributions.length} รายการ — กำลังโหลด pool...`, { duration: 0 });

      // pool_transactions — ตัดปัญหา table missing (แล้ว fallback เป็น array ว่าง)
      let poolTransactions: Record<string, unknown>[] = [];
      try {
        poolTransactions = await fetchAllPaginated('pool_transactions', 20);
      } catch (poolErr) {
        console.warn('[export] pool_transactions unavailable:', poolErr);
      }
      toast.dismiss(t3);

      const data = {
        version: 2,
        exportedAt: new Date().toISOString(),
        projects,
        quotations,
        payments,
        distributions,
        poolTransactions,
      };
      const jsonStr = JSON.stringify(data, null, 2);
      const sizeMB = (new Blob([jsonStr]).size / 1024 / 1024).toFixed(2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `research-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `ดาวน์โหลด backup แล้ว (${sizeMB} MB) — ` +
        `${payments.length} payments, ${distributions.length} distributions, ${poolTransactions.length} pool`,
        { duration: 6000 },
      );
    } catch (e) {
      toast.error(
        `Backup ล้มเหลว: ${(e as { message?: string })?.message || 'unknown'}\n` +
        `ลองใหม่อีกครั้ง — ถ้ายัง timeout แจ้งได้ (ผมจะลด chunk size)`,
        { duration: 10000 },
      );
    } finally {
      setExporting(false);
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (!data.projects || !data.quotations) {
          alert('ไฟล์ไม่ถูกต้อง: ต้องมี projects และ quotations');
          return;
        }
        if (!confirm(`นำเข้าข้อมูล ${data.projects.length} โครงการ, ${data.quotations.length} ใบเสนอราคา, ${(data.payments || []).length} รายการชำระเงิน, ${(data.distributions || []).length} รายการแบ่งเงิน?\n\nข้อมูลเดิมจะถูกแทนที่ทั้งหมด`)) return;

        const storageData = {
          state: { projects: data.projects, quotations: data.quotations, payments: data.payments || [], distributions: data.distributions || [] },
          version: 0,
        };
        localStorage.setItem('research-management-storage', JSON.stringify(storageData));
        window.location.reload();
      } catch {
        alert('ไม่สามารถอ่านไฟล์ได้ กรุณาเลือกไฟล์ JSON ที่ถูกต้อง');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleMigrate = async () => {
    if (!confirm('นำเข้าข้อมูลจาก LocalStorage ไปเก็บที่ Cloud (Supabase)?\n\nข้อมูลเดิมใน Cloud จะถูก merge กับข้อมูลใหม่')) return;
    try {
      const result = await migrateFromLocalStorage();
      alert(`นำเข้าสำเร็จ!\n• โครงการ: ${result.projects}\n• ชำระเงิน: ${result.payments}\n• โอนเงินสมาชิก: ${result.distributions}\n• ใบเสนอราคา: ${result.quotations}`);
    } catch (e) {
      alert(`เกิดข้อผิดพลาด: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handleLogout = async () => {
    if (!confirm('ออกจากระบบ?')) return;
    try {
      await signOut();
      useStore.getState().resetStore();
      router.push('/login');
    } catch (e) {
      alert(`Logout failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white shadow-md rounded-lg p-2"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-screen w-64 bg-white border-r border-gray-200 transition-transform duration-200 flex flex-col',
          'lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <button
          onClick={handleBrandClick}
          /* ความสูง sync อัตโนมัติจาก AppShell → --top-bar-h (PageHeader + TopFilterBar) */
          style={{ height: 'var(--top-bar-h, 90px)' }}
          className="flex items-center gap-3 px-5 border-b border-gray-200 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 hover:from-indigo-100 hover:via-purple-100 hover:to-pink-100 transition-all text-left w-full group shrink-0"
          title="กลับหน้า Dashboard และล้างตัวกรอง"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all shrink-0">
            <FlaskConical size={24} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-gray-900 text-base leading-tight">Research Manager</h1>
            <p className="text-xs text-gray-500 mt-0.5">ระบบจัดการงานวิจัย</p>
          </div>
        </button>

        <nav className="px-3 py-4 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-indigo-50 to-indigo-100 text-indigo-700 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:translate-x-0.5'
                )}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Data tools */}
        <div className="px-3 py-3 border-t border-gray-200 space-y-1">
          <button
            onClick={async () => { setReloading(true); try { await reloadAllData(); } finally { setReloading(false); } }}
            disabled={reloading}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors w-full disabled:opacity-50"
            title="โหลดข้อมูลใหม่จาก Supabase — ใช้เวลาข้อมูลดูแปลก/ไม่ครบ"
          >
            <RefreshCw size={15} className={reloading ? 'animate-spin' : ''} /> {reloading ? 'กำลังโหลด...' : 'Reload ข้อมูล'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors w-full disabled:opacity-50"
            title="Export JSON (รวม slip images) — อาจใช้เวลาสักครู่ถ้ามี slip เยอะ"
          >
            <Download size={15} /> {exporting ? 'กำลังเตรียม backup...' : 'Export JSON'}
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors w-full">
            <Upload size={15} /> Import JSON
          </button>
          <button onClick={handleMigrate} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors w-full">
            <Cloud size={15} /> ย้ายข้อมูลขึ้น Cloud
          </button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </div>

        {/* User + Logout */}
        {user && (
          <div className="px-3 py-3 border-t border-gray-200 bg-gray-50/50">
            <div className="flex items-center gap-2 px-3 py-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                <UserIcon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{user.email}</p>
                <p className="text-xs text-gray-400">เข้าสู่ระบบแล้ว</p>
              </div>
            </div>
            <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors w-full">
              <LogOut size={16} /> ออกจากระบบ
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
