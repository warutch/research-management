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
} from 'lucide-react';
import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { useAuth, signOut } from '@/lib/auth';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/income', label: 'รายได้', icon: Wallet },
  { href: '/projects', label: 'โครงการ', icon: FolderKanban },
  { href: '/quotations', label: 'ใบเสนอราคา', icon: FileText },
  { href: '/payments', label: 'ประวัติการชำระเงิน', icon: Banknote },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { projects, quotations, payments, distributions, migrateFromLocalStorage } = useStore();
  const { user } = useAuth();

  const handleExport = () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      projects,
      quotations,
      payments,
      distributions,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `research-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
          'fixed top-0 left-0 z-40 h-full w-64 bg-white border-r border-gray-200 transition-transform duration-200 flex flex-col',
          'lg:translate-x-0 lg:static lg:z-auto',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-md">
            <FlaskConical size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-sm">Research Manager</h1>
            <p className="text-xs text-gray-500">ระบบจัดการงานวิจัย</p>
          </div>
        </div>

        <nav className="px-3 py-4 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
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
          <button onClick={handleExport} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors w-full">
            <Download size={15} /> Export JSON
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
