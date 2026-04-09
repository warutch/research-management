'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Wallet, FolderKanban, CalendarDays, FileText, Banknote, type LucideIcon,
} from 'lucide-react';
import Sidebar from './Sidebar';
import AuthGuard from './AuthGuard';
import { useStore, getProjectYear, type StatusFilter, type YearFilter } from '@/store/useStore';
import { PROJECT_TYPE_COLORS, PROJECT_TYPE_LABELS, type ProjectTypeFilter } from '@/types';
import { cn } from '@/lib/utils';
import { Filter, Search, X } from 'lucide-react';
import { useMemo } from 'react';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const stickyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Sync ความสูง sticky header → CSS var --top-bar-h เพื่อให้ Sidebar brand ใช้ match ได้
  useEffect(() => {
    if (!mounted) return;
    const el = stickyRef.current;
    if (!el) return;
    const apply = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--top-bar-h', `${Math.round(h)}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener('resize', apply);
    return () => { ro.disconnect(); window.removeEventListener('resize', apply); };
  }, [mounted, pathname]);

  // ป้องกัน hydration mismatch — render placeholder บน server, render จริงบน client เท่านั้น
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (isLoginPage) {
    return <AuthGuard>{children}</AuthGuard>;
  }

  return (
    <AuthGuard>
      <div className="min-h-screen">
        <Sidebar />
        <main className="lg:ml-64 min-h-screen flex flex-col">
          {/* Sticky wrapper — ทั้ง header + filter bar ลอยอยู่บนสุด */}
          <div ref={stickyRef} className="sticky top-0 z-30">
            <PageHeader />
            <TopFilterBar />
          </div>
          <div className="p-4 lg:p-8 pt-4 lg:pt-6 max-w-7xl w-full mx-auto">
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

// ============ Page header (หัวข้อ + gradient bar เหนือ filter) ============
const PAGE_META: Record<string, { title: string; subtitle: string; icon: LucideIcon }> = {
  '/': { title: 'Dashboard', subtitle: 'ภาพรวมระบบจัดการงานวิจัย', icon: LayoutDashboard },
  '/income': { title: 'รายได้', subtitle: 'สรุปรายได้และส่วนแบ่งของสมาชิก', icon: Wallet },
  '/projects': { title: 'โครงการ', subtitle: 'จัดการโครงการวิจัยทั้งหมด', icon: FolderKanban },
  '/tracking': { title: 'Tracking Activities', subtitle: 'ติดตามกิจกรรมและกำหนดการ', icon: CalendarDays },
  '/quotations': { title: 'ใบเสนอราคา', subtitle: 'จัดการใบเสนอราคาของโครงการ', icon: FileText },
  '/payments': { title: 'ประวัติการชำระเงิน', subtitle: 'บันทึกและตรวจสอบการชำระเงิน', icon: Banknote },
};

function PageHeader() {
  const pathname = usePathname();
  const meta = PAGE_META[pathname] || { title: 'Research Manager', subtitle: 'ระบบจัดการงานวิจัย', icon: LayoutDashboard };
  const Icon = meta.icon;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400 text-white pl-16 lg:pl-6 pr-4 lg:pr-6 py-2.5 shadow-sm">
      {/* decorative circles */}
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-10 right-24 w-20 h-20 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      <div className="relative flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center shadow-inner shrink-0">
            <Icon size={16} className="text-white" />
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="text-base lg:text-lg font-bold tracking-tight truncate">{meta.title}</h1>
            <p className="text-[10px] lg:text-xs text-white/80 truncate">{meta.subtitle}</p>
          </div>
        </div>
        <div className="text-[10px] text-white/90 bg-white/15 backdrop-blur px-2.5 py-1 rounded-full border border-white/20 whitespace-nowrap">
          as of {today}
        </div>
      </div>
    </div>
  );
}

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'ทุกสถานะ' },
  { value: 'pending', label: 'รอดำเนินการ' },
  { value: 'in_progress', label: 'กำลังดำเนินการ' },
  { value: 'completed', label: 'เสร็จสิ้น' },
];

function TopFilterBar() {
  const typeFilter = useStore((s) => s.typeFilter);
  const setTypeFilter = useStore((s) => s.setTypeFilter);
  const statusFilter = useStore((s) => s.statusFilter);
  const setStatusFilter = useStore((s) => s.setStatusFilter);
  const yearFilter = useStore((s) => s.yearFilter);
  const setYearFilter = useStore((s) => s.setYearFilter);
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const allProjects = useStore((s) => s._allProjects);

  // ปีทั้งหมดจาก 4 ตัวแรกของ projectCode (เรียงใหม่→เก่า)
  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    for (const p of allProjects) {
      const y = getProjectYear(p);
      if (y) years.add(y);
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [allProjects]);

  const typeOptions: { value: ProjectTypeFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'doctor', label: PROJECT_TYPE_LABELS.doctor },
    { value: 'student', label: PROJECT_TYPE_LABELS.student },
  ];

  const selectCls = 'px-2.5 py-1 rounded-full text-[11px] font-medium border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer';

  return (
    <div className="bg-white/95 backdrop-blur border-b border-gray-200 px-4 lg:px-6 py-1.5 flex items-center gap-1.5 flex-wrap pl-16 lg:pl-6">
      <div className="flex items-center gap-1 text-[11px] text-gray-500 mr-0.5">
        <Filter size={12} />
        <span>กรอง</span>
      </div>

      {/* Type pills */}
      {typeOptions.map((opt) => {
        const isActive = typeFilter === opt.value;
        const colors = opt.value !== 'all' ? PROJECT_TYPE_COLORS[opt.value] : null;
        return (
          <button
            key={opt.value}
            onClick={() => setTypeFilter(opt.value)}
            className={cn(
              'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all',
              isActive
                ? colors
                  ? `${colors.bg} ${colors.text} ${colors.border} shadow-sm`
                  : 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            )}
            data-testid={`filter-${opt.value}`}
          >
            {opt.label}
          </button>
        );
      })}

      <div className="w-px h-4 bg-gray-200 mx-0.5" />

      {/* Status dropdown */}
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        className={cn(selectCls, statusFilter !== 'all' && 'border-indigo-300 bg-indigo-50 text-indigo-700')}
        data-testid="filter-status"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {/* Year dropdown */}
      <select
        value={yearFilter}
        onChange={(e) => setYearFilter(e.target.value as YearFilter)}
        className={cn(selectCls, yearFilter !== 'all' && 'border-indigo-300 bg-indigo-50 text-indigo-700')}
        data-testid="filter-year"
      >
        <option value="all">ทุกปี</option>
        {yearOptions.map((y) => (
          <option key={y} value={y}>ปี {y}</option>
        ))}
      </select>

      {/* Search box */}
      <div className="relative flex-1 min-w-[180px] max-w-sm ml-auto">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ค้นหา: ชื่อ, ผู้วิจัย, ปี, ประเภท, สถานะ, สมาชิก..."
          className={cn(
            'w-full pl-7 pr-7 py-1 rounded-full text-[11px] border bg-white text-gray-700',
            'focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300',
            searchQuery ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-200 hover:border-gray-300'
          )}
          data-testid="filter-search"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
            aria-label="ล้างคำค้นหา"
          >
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
