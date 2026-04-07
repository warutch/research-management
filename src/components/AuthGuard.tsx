'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useStore } from '@/store/useStore';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const loadAllData = useStore((s) => s.loadAllData);
  const dataLoaded = useStore((s) => s.dataLoaded);

  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (loading) return;
    if (!isSupabaseConfigured) {
      // No supabase configured → redirect to login (which will show config message)
      if (!isLoginPage) router.push('/login');
      return;
    }
    if (!user && !isLoginPage) {
      router.push('/login');
    } else if (user && !dataLoaded) {
      loadAllData();
    }
  }, [user, loading, isLoginPage, router, loadAllData, dataLoaded]);

  // Login page renders independently
  if (isLoginPage) return <>{children}</>;

  // Loading auth state or fetching data
  if (loading || !isSupabaseConfigured || !user || !dataLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">{loading ? 'กำลังตรวจสอบ...' : !user ? 'กำลังนำไปหน้าเข้าสู่ระบบ...' : 'กำลังโหลดข้อมูล...'}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
