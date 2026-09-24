import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// ================================================================
// Pre-clean stale auth token BEFORE creating client
// ================================================================
// Supabase client auto-refresh loop throws "Invalid Refresh Token: Refresh
// Token Not Found" when localStorage has an auth entry missing/expired
// refresh_token. Clean it pre-emptively so the client starts fresh.
if (typeof window !== 'undefined' && isSupabaseConfigured) {
  try {
    // เก็บ key ที่ต้องลบไว้ก่อน แล้วค่อยลบ (กัน index เลื่อนตอนวนลูป)
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        // ลบเฉพาะเมื่อ "ไม่มี refresh_token" เท่านั้น (token ที่ refresh ไม่ได้)
        // ห้ามใช้ expires_at (นั่นคืออายุ access-token ~1ชม. ไม่ใช่ refresh-token)
        // — session ที่ทิ้งไว้นานยัง refresh ได้ ถ้ายังมี refresh_token
        if (!parsed?.refresh_token) toRemove.push(key);
      } catch {
        toRemove.push(key); // parse ไม่ได้ = เสีย ลบทิ้ง
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // localStorage อาจไม่พร้อม / private mode
  }
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

// Fallback: ถ้า refresh loop ยัง throw → listen event แล้ว signOut เคลียร์ state
if (typeof window !== 'undefined' && isSupabaseConfigured) {
  supabase.auth.getSession().catch(async (err) => {
    if (err?.message?.includes('Refresh Token')) {
      await supabase.auth.signOut().catch(() => {});
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    // refresh สำเร็จ / ออกจากระบบ → OK
    if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') return;
    // user session กลายเป็น null หลัง initial → sign out เคลียร์ token ที่เหลือ
    if (event === 'INITIAL_SESSION' && !session) {
      // ไม่ต้องทำอะไร — ยังไม่มี session ปกติ
    }
  });
}
