import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  Project, Quotation, Activity, MemberId, PaymentInstallment, PaymentRecord,
  DistributionRecord, TrackingActivity, PoolTransaction, HORSE_PERCENT, POOL_PERCENT,
  ProjectType, ProjectTypeFilter, ProjectStatus, MEMBERS, PROJECT_TYPE_LABELS,
} from '@/types';

export type StatusFilter = 'all' | ProjectStatus;
export type YearFilter = 'all' | string; // ปี ค.ศ. 4 หลัก เช่น "2026" หรือ "all"

// สำหรับ search matching
const STATUS_LABELS_TH: Record<ProjectStatus, string> = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  completed: 'เสร็จสิ้น',
};
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import {
  projectToDb, projectFromDb,
  paymentToDb, paymentFromDb,
  distributionToDb, distributionFromDb,
  quotationToDb, quotationFromDb,
  trackingActivityToDb, trackingActivityFromDb,
  poolTxToDb, poolTxFromDb,
  PAYMENT_LIST_COLUMNS, DISTRIBUTION_LIST_COLUMNS, POOL_TX_LIST_COLUMNS,
  markWorkspaceColumnMissing, isWorkspaceMissingError,
  markCommissionColumnMissing, isCommissionMissingError,
  isTableMissingError,
} from '@/lib/supabaseSync';
import { toast } from '@/components/Toast';

// ============================================================
// Type filter (All / Doctor / Student)
// - type อยู่บน Project เท่านั้น
// - Payment/Distribution/Quotation/Tracking filter ผ่าน projectId
// - pages อ่าน state.projects/payments/etc. แบบเดิม — store recompute ให้เอง
// ============================================================

interface AppState {
  // Filters
  typeFilter: ProjectTypeFilter;
  statusFilter: StatusFilter;
  yearFilter: YearFilter;
  searchQuery: string;
  setTypeFilter: (f: ProjectTypeFilter) => void;
  setStatusFilter: (f: StatusFilter) => void;
  setYearFilter: (f: YearFilter) => void;
  setSearchQuery: (q: string) => void;
  resetFilters: () => void;

  // โหมดแก้ไข (global) — ปกติซ่อนปุ่มแก้ไข/ลบทุกหน้า กดเปิดเมื่อต้องการแก้/ลบ
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  toggleEditMode: () => void;

  // Raw (ไม่ filter) — ใช้ภายใน
  _allProjects: Project[];
  _allQuotations: Quotation[];
  _allPayments: PaymentRecord[];
  _allDistributions: DistributionRecord[];
  _allTrackingActivities: TrackingActivity[];

  // Filtered view (UI เรียกใช้)
  projects: Project[];
  quotations: Quotation[];
  payments: PaymentRecord[];
  distributions: DistributionRecord[];
  trackingActivities: TrackingActivity[];
  poolTransactions: PoolTransaction[]; // ไม่ผูกโครงการ — ไม่ต้อง filter
  dataLoaded: boolean;

  loadAllData: () => Promise<void>;
  reloadAllData: () => Promise<void>; // force re-fetch (ใช้เวลาข้อมูลไม่ครบ)
  // Lazy-fetch slip payload สำหรับ record ที่ยังไม่ได้โหลด slip
  // return array ของ slip URLs (base64) หรือ [] ถ้าไม่มี
  fetchSlipsFor: (kind: 'payment' | 'distribution' | 'pool_tx', id: string) => Promise<string[]>;
  resetStore: () => void;

  // Projects
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'activities' | 'installments'> & { activities?: Activity[]; installments?: PaymentInstallment[] }) => string;
  updateProject: (id: string, data: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // Activities
  addActivity: (projectId: string, activity: Omit<Activity, 'id'>) => void;
  updateActivity: (projectId: string, activityId: string, data: Partial<Activity>) => void;
  deleteActivity: (projectId: string, activityId: string) => void;

  // Installments
  addInstallment: (projectId: string, installment: Omit<PaymentInstallment, 'id'>) => void;
  updateInstallment: (projectId: string, installmentId: string, data: Partial<PaymentInstallment>) => void;
  deleteInstallment: (projectId: string, installmentId: string) => void;

  // Payments
  addPayment: (payment: Omit<PaymentRecord, 'id' | 'createdAt'>) => string;
  updatePayment: (id: string, data: Partial<PaymentRecord>) => void;
  deletePayment: (id: string) => void;

  // Distributions
  addDistribution: (distribution: Omit<DistributionRecord, 'id' | 'createdAt'>) => string;
  updateDistribution: (id: string, data: Partial<DistributionRecord>) => void;
  deleteDistribution: (id: string) => void;

  // Quotations
  addQuotation: (quotation: Omit<Quotation, 'id' | 'createdAt'>) => string;
  updateQuotation: (id: string, data: Partial<Quotation>) => void;
  deleteQuotation: (id: string) => void;

  // Tracking Activities
  addTrackingActivity: (activity: Omit<TrackingActivity, 'id' | 'createdAt'>) => string;
  updateTrackingActivity: (id: string, data: Partial<TrackingActivity>) => void;
  deleteTrackingActivity: (id: string) => void;

  // Pool Transactions (เงินกองกลาง)
  addPoolTransaction: (tx: Omit<PoolTransaction, 'id' | 'createdAt'>) => string;
  updatePoolTransaction: (id: string, data: Partial<PoolTransaction>) => void;
  deletePoolTransaction: (id: string) => void;

  // Migration helper
  migrateFromLocalStorage: () => Promise<{ projects: number; payments: number; distributions: number; quotations: number }>;
}

// Helpers
export function calcMemberActivityIncome(activity: Activity, memberId: MemberId): number {
  return (activity.cost * (activity.sharePercent[memberId] || 0)) / 100;
}

export function calcHorseIncome(activity: Activity): number {
  return (activity.cost * HORSE_PERCENT) / 100;
}

export function calcPoolIncome(activity: Activity): number {
  return (activity.cost * POOL_PERCENT) / 100;
}

// ============================================================
// Filtering
// ============================================================

type FilterableState = Pick<AppState,
  '_allProjects' | '_allQuotations' | '_allPayments' | '_allDistributions' | '_allTrackingActivities'
  | 'typeFilter' | 'statusFilter' | 'yearFilter' | 'searchQuery'
>;

// ดึงปี ค.ศ. จาก 4 ตัวแรกของ projectCode
export function getProjectYear(p: Project): string | null {
  const code = p.projectCode || '';
  const m = code.match(/^(\d{4})/);
  return m ? m[1] : null;
}

// ปีล่าสุดจาก list projects (หรือ null ถ้าไม่มีปีเลย)
export function getLatestYear(projects: Project[]): string | null {
  let latest: string | null = null;
  for (const p of projects) {
    const y = getProjectYear(p);
    if (y && (!latest || y > latest)) latest = y;
  }
  return latest;
}

// ตรวจว่า project ตรงกับ search query ไหม
// ครอบคลุม: ชื่อโครงการ, ผู้วิจัย, ปี, ประเภท (Doctor/Student), สถานะ, รหัสโครงการ, สมาชิก (ที่มี share > 0)
function matchesSearch(p: Project, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase().trim();
  if (!needle) return true;

  const haystacks: string[] = [
    p.name,
    p.client,
    p.projectCode,
    getProjectYear(p) || '',
    PROJECT_TYPE_LABELS[p.type] || '',
    p.type, // 'doctor' / 'student'
    STATUS_LABELS_TH[p.status] || '',
    p.status,
  ];

  // สมาชิก: MemberId ใดที่มี sharePercent > 0 ในกิจกรรมใดๆ → ใส่ทั้ง name + shortName
  const activeMembers = new Set<MemberId>();
  for (const a of p.activities || []) {
    (Object.keys(a.sharePercent) as MemberId[]).forEach((mid) => {
      if ((a.sharePercent[mid] || 0) > 0) activeMembers.add(mid);
    });
  }
  for (const m of MEMBERS) {
    if (activeMembers.has(m.id)) {
      haystacks.push(m.name, m.shortName, m.id);
    }
  }

  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

function recomputeFiltered(state: FilterableState) {
  const { typeFilter, statusFilter, yearFilter, searchQuery } = state;
  const q = (searchQuery || '').trim();
  const allFiltersOff = typeFilter === 'all' && statusFilter === 'all' && yearFilter === 'all' && !q;
  if (allFiltersOff) {
    return {
      projects: state._allProjects,
      quotations: state._allQuotations,
      payments: state._allPayments,
      distributions: state._allDistributions,
      trackingActivities: state._allTrackingActivities,
    };
  }
  const visibleProjects = state._allProjects.filter((p) => {
    if (typeFilter !== 'all' && p.type !== typeFilter) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (yearFilter !== 'all' && getProjectYear(p) !== yearFilter) return false;
    if (q && !matchesSearch(p, q)) return false;
    return true;
  });
  const visibleIds = new Set(visibleProjects.map((p) => p.id));
  return {
    projects: visibleProjects,
    quotations: state._allQuotations.filter((q) => visibleIds.has(q.projectId)),
    payments: state._allPayments.filter((p) => visibleIds.has(p.projectId)),
    distributions: state._allDistributions.filter((d) => visibleIds.has(d.projectId)),
    // tracking activity ที่ไม่ผูก project → แสดงเสมอ
    trackingActivities: state._allTrackingActivities.filter((t) => !t.projectId || visibleIds.has(t.projectId)),
  };
}

// Logger — รวมทุก detail ไว้ในบรรทัดเดียวเพื่อให้ Next.js dev overlay แสดงได้ครบ
// (overlay จะเห็นเฉพาะ arguments ของ console.error ครั้งแรก, ครั้งต่อไปเห็นเฉพาะใน browser DevTools console)
function logErr(action: string, error: unknown) {
  if (!error) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = error as any;
  const errorInfo: Record<string, unknown> = {};
  const collect = (key: string) => {
    if (e?.[key] != null && !(key in errorInfo)) errorInfo[key] = e[key];
  };
  if (e instanceof Error) {
    errorInfo.name = e.name;
    errorInfo.message = e.message;
    errorInfo.stack = e.stack;
  }
  ['message', 'code', 'details', 'hint', 'status', 'statusText', 'name'].forEach(collect);
  // เก็บ properties อื่นๆ (รวม non-enumerable ผ่าน getOwnPropertyNames + for..in สำหรับ inherited/getters)
  try {
    const seen = new Set(Object.keys(errorInfo));
    Object.getOwnPropertyNames(e).forEach((k) => {
      if (!seen.has(k) && typeof e[k] !== 'function') { errorInfo[k] = e[k]; seen.add(k); }
    });
    for (const k in e) {
      if (!seen.has(k) && typeof e[k] !== 'function') { errorInfo[k] = e[k]; seen.add(k); }
    }
  } catch {}

  // สรุปข้อมูลเป็น string สั้นๆ สำหรับ overlay
  const isEmpty = Object.keys(errorInfo).length === 0 || (Object.keys(errorInfo).length === 1 && !errorInfo.message);
  const summary = isEmpty
    ? '(empty error — likely RLS blocked / session expired / network abort / CORS. Check DevTools → Network tab สำหรับ HTTP response จริง)'
    : (errorInfo.message || errorInfo.code || errorInfo.details || JSON.stringify(errorInfo));

  // First console.error: ใส่ทุกอย่างในบรรทัดเดียว (Next.js overlay จะเห็น)
  console.error(`[Supabase] ${action} error:`, summary, { info: errorInfo, raw: e, type: `${typeof e}/${e?.constructor?.name || '?'}` });
}

// ============================================================
// Persist middleware: cache raw data + filters ใน localStorage
// เพื่อให้ refresh หน้าเห็นข้อมูลทันที (SWR pattern: paint cache → fetch fresh พื้นหลัง)
// ============================================================
// - partialize: persist เฉพาะ raw arrays + filters (ไม่รวม derived views + dataLoaded)
// - onRehydrate: recompute filter views + trigger loadAllData() พื้นหลัง
// - version: bump ถ้าเปลี่ยน data shape → cache เก่าถูก reset อัตโนมัติ
// ขนาด: ~500KB-1MB (loadAllData ตัด slip payload ออกอยู่แล้ว) — ใต้ 5MB limit ของ localStorage
export const useStore = create<AppState>()(persist(
  (set, get) => ({
  // Filters
  typeFilter: 'all',
  statusFilter: 'all',
  yearFilter: 'all',
  searchQuery: '',
  setTypeFilter: (f) => {
    set((state) => ({ typeFilter: f, ...recomputeFiltered({ ...state, typeFilter: f }) }));
  },
  setStatusFilter: (f) => {
    set((state) => ({ statusFilter: f, ...recomputeFiltered({ ...state, statusFilter: f }) }));
  },
  setYearFilter: (f) => {
    set((state) => ({ yearFilter: f, ...recomputeFiltered({ ...state, yearFilter: f }) }));
  },
  setSearchQuery: (q) => {
    set((state) => ({ searchQuery: q, ...recomputeFiltered({ ...state, searchQuery: q }) }));
  },
  resetFilters: () => {
    set((state) => {
      const latest = getLatestYear(state._allProjects);
      const next = {
        typeFilter: 'all' as ProjectTypeFilter,
        statusFilter: 'all' as StatusFilter,
        yearFilter: (latest || 'all') as YearFilter,
        searchQuery: '',
      };
      return { ...next, ...recomputeFiltered({ ...state, ...next }) };
    });
  },

  // โหมดแก้ไข (global)
  editMode: false,
  setEditMode: (v) => set({ editMode: v }),
  toggleEditMode: () => set((state) => ({ editMode: !state.editMode })),

  // Data
  _allProjects: [],
  _allQuotations: [],
  _allPayments: [],
  _allDistributions: [],
  _allTrackingActivities: [],
  projects: [],
  quotations: [],
  payments: [],
  distributions: [],
  trackingActivities: [],
  poolTransactions: [],
  dataLoaded: false,

  loadAllData: async () => {
    // Two-phase loading:
    //   Phase 1 (critical) — projects+payments+distributions → mark dataLoaded=true ทันที
    //                        หน้า /projects, /income, /payments พร้อม render
    //   Phase 2 (background) — quotations+tracking+pool_transactions โหลดต่อไม่ block UI
    //                          หน้า /quotations, /tracking, /pool ยังเห็น spinner เฉพาะที่จำเป็น
    //
    // เดิมใช้ Promise.all รวมทั้ง 6 tables → หน้าไหนก็ต้องรอ tables ที่ไม่เกี่ยวข้อง
    // เช่น /projects ต้องรอ quotations (JSONB items ใหญ่) + pool + tracking โหลดเสร็จก่อน paint

    // ใช้ explicit column list (ไม่รวม slip_url + slip_urls) เพื่อลด payload
    // has_slip เป็น generated column บอกว่ามี slip ไหม — slip payload lazy-load เมื่อกด view
    // Fallback: ถ้า has_slip column ยังไม่มี (user ยังไม่ได้รัน migration) → retry โดยตัด has_slip ออก
    const isHasSlipMissing = (err: unknown): boolean => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      const msg = ((e?.message || '') + ' ' + (e?.details || '') + ' ' + (e?.hint || '')).toLowerCase();
      return /has_slip/.test(msg) && /(does not exist|column)/.test(msg);
    };
    const fetchWithFallback = async (table: string, cols: string, order?: { col: string; asc: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = supabase.from(table).select(cols) as any;
      if (order) q = q.order(order.col, { ascending: order.asc });
      let res = await q;
      if (res.error && isHasSlipMissing(res.error)) {
        const fallbackCols = cols.split(',').filter((c) => c.trim() !== 'has_slip').join(',');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q2 = supabase.from(table).select(fallbackCols) as any;
        if (order) q2 = q2.order(order.col, { ascending: order.asc });
        res = await q2;
      }
      return res;
    };

    // ============ Phase 1: Critical tables ============
    try {
      const [projectsRes, paymentsRes, distributionsRes] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        fetchWithFallback('payments', PAYMENT_LIST_COLUMNS),
        fetchWithFallback('distributions', DISTRIBUTION_LIST_COLUMNS),
      ]);

      logErr('load projects', projectsRes.error);
      logErr('load payments', paymentsRes.error);
      logErr('load distributions', distributionsRes.error);

      const criticalErrors: string[] = [];
      if (projectsRes.error) criticalErrors.push(`projects: ${projectsRes.error.message || 'unknown'}`);
      if (paymentsRes.error) criticalErrors.push(`payments: ${paymentsRes.error.message || 'unknown'}`);
      if (distributionsRes.error) criticalErrors.push(`distributions: ${distributionsRes.error.message || 'unknown'}`);

      if (criticalErrors.length > 0) {
        toast.error(
          `❌ โหลดข้อมูลไม่ครบ:\n${criticalErrors.map((e) => `• ${e}`).join('\n')}\n\nกดปุ่ม "Reload" ใน sidebar เพื่อลองใหม่`,
          { duration: 0 },
        );
        return; // ไม่ mark dataLoaded → user เห็น spinner + toast
      }

      const _allProjects = (projectsRes.data || []).map(projectFromDb);
      const _allPayments = (paymentsRes.data || []).map(paymentFromDb);
      const _allDistributions = (distributionsRes.data || []).map(distributionFromDb);

      set((state) => {
        // ครั้งแรกที่โหลด — set yearFilter เป็นปีล่าสุดอัตโนมัติ (default)
        let yearFilter = state.yearFilter;
        if (!state.dataLoaded && yearFilter === 'all') {
          const latest = getLatestYear(_allProjects);
          if (latest) yearFilter = latest;
        }
        return {
          _allProjects, _allPayments, _allDistributions,
          // quotations/tracking ค้าง state เดิม (empty array ครั้งแรก) — Phase 2 จะเติมให้
          yearFilter,
          ...recomputeFiltered({
            _allProjects, _allPayments, _allDistributions,
            _allQuotations: state._allQuotations,
            _allTrackingActivities: state._allTrackingActivities,
            typeFilter: state.typeFilter,
            statusFilter: state.statusFilter,
            yearFilter,
            searchQuery: state.searchQuery,
          }),
          dataLoaded: true, // ← unblock UI ตรงนี้ Phase 2 ยังไม่เสร็จก็ paint ได้
        };
      });
    } catch (e) {
      console.error('[Supabase] loadAllData Phase 1 failed:', e);
      toast.error(`❌ โหลดข้อมูลล้มเหลว: ${(e as { message?: string })?.message || 'unknown'}\nกดปุ่ม "Reload" ใน sidebar`, { duration: 0 });
      return;
    }

    // ============ Phase 2: Background tables (fire-and-forget) ============
    // ไม่ await — ให้ Phase 1 return ก่อน UI paint แล้วเติม data เหล่านี้พื้นหลัง
    (async () => {
      try {
        const [quotationsRes, trackingRes, poolRes] = await Promise.all([
          supabase.from('quotations').select('*'),
          supabase.from('tracking_activities').select('*'),
          fetchWithFallback('pool_transactions', POOL_TX_LIST_COLUMNS, { col: 'date', asc: false }),
        ]);

        logErr('load quotations', quotationsRes.error);
        logErr('load tracking', trackingRes.error);
        logErr('load pool', poolRes.error);

        // quotations error → เตือน แต่ไม่ block
        if (quotationsRes.error && !isTableMissingError(quotationsRes.error, 'quotations')) {
          toast.error(`โหลด Quotations ไม่สำเร็จ: ${quotationsRes.error.message || 'unknown'}`);
        }
        if (poolRes.error && isTableMissingError(poolRes.error, 'pool_transactions')) {
          toast.warning(
            '⚠️ ยังไม่ได้สร้าง table "pool_transactions" ใน Supabase\n' +
            'ไปที่ Supabase Dashboard → SQL Editor → รัน supabase/schema.sql',
            { duration: 12000 },
          );
        } else if (poolRes.error) {
          toast.error(`โหลด Pool money ไม่สำเร็จ: ${poolRes.error.message || 'unknown'}`);
        }
        if (trackingRes.error && !isTableMissingError(trackingRes.error, 'tracking_activities')) {
          toast.error(`โหลด Tracking ไม่สำเร็จ: ${trackingRes.error.message || 'unknown'}`);
        }

        const _allQuotations = (quotationsRes.data || []).map(quotationFromDb);
        const _allTrackingActivities = (trackingRes.data || []).map(trackingActivityFromDb);
        const poolTransactions = (poolRes.data || []).map(poolTxFromDb);

        set((state) => ({
          _allQuotations, _allTrackingActivities, poolTransactions,
          ...recomputeFiltered({
            _allProjects: state._allProjects,
            _allPayments: state._allPayments,
            _allDistributions: state._allDistributions,
            _allQuotations, _allTrackingActivities,
            typeFilter: state.typeFilter,
            statusFilter: state.statusFilter,
            yearFilter: state.yearFilter,
            searchQuery: state.searchQuery,
          }),
        }));
      } catch (e) {
        console.error('[Supabase] loadAllData Phase 2 failed:', e);
        toast.error(`โหลดข้อมูลเสริม (quotations/pool/tracking) ล้มเหลว: ${(e as { message?: string })?.message || 'unknown'}`);
      }
    })();
  },

  // Manual re-fetch — reset dataLoaded + trigger loadAllData
  // ใช้เวลาข้อมูลดูแปลก / โหลดไม่ครบ
  reloadAllData: () => {
    set({ dataLoaded: false });
    return get().loadAllData();
  },

  // Lazy-load slip payload สำหรับ record เดียว
  // → fetch จาก Supabase → update state → return array ของ slip URLs
  fetchSlipsFor: async (kind, id) => {
    const table = kind === 'payment' ? 'payments' : kind === 'distribution' ? 'distributions' : 'pool_transactions';
    const cols = kind === 'pool_tx' ? 'id,slip_urls' : 'id,slip_url,slip_urls';
    const { data, error } = await supabase.from(table).select(cols).eq('id', id).maybeSingle();
    if (error) {
      logErr(`fetchSlipsFor(${kind}/${id})`, error);
      toast.error(`โหลด slip ไม่สำเร็จ: ${(error as { message?: string })?.message || 'unknown'}`);
      return [];
    }
    if (!data) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;
    const slipUrls: string[] = Array.isArray(row.slip_urls) ? row.slip_urls : [];
    const slipUrl: string = row.slip_url || '';
    const combined = slipUrls.length > 0 ? slipUrls : (slipUrl ? [slipUrl] : []);

    // Merge เข้า state → subsequent access ไม่ต้อง fetch ซ้ำ
    if (kind === 'payment') {
      set((state) => ({
        _allPayments: state._allPayments.map((p) =>
          p.id === id ? { ...p, slipUrl, slipUrls } : p
        ),
        payments: state.payments.map((p) =>
          p.id === id ? { ...p, slipUrl, slipUrls } : p
        ),
      }));
    } else if (kind === 'distribution') {
      set((state) => ({
        _allDistributions: state._allDistributions.map((d) =>
          d.id === id ? { ...d, slipUrl, slipUrls } : d
        ),
        distributions: state.distributions.map((d) =>
          d.id === id ? { ...d, slipUrl, slipUrls } : d
        ),
      }));
    } else {
      set((state) => ({
        poolTransactions: state.poolTransactions.map((t) =>
          t.id === id ? { ...t, slipUrls } : t
        ),
      }));
    }
    return combined;
  },

  resetStore: () => {
    set({
      _allProjects: [], _allQuotations: [], _allPayments: [], _allDistributions: [], _allTrackingActivities: [],
      projects: [], quotations: [], payments: [], distributions: [], trackingActivities: [],
      poolTransactions: [],
      dataLoaded: false,
    });
  },

  // ============ Projects ============
  addProject: (projectData) => {
    const id = uuidv4();
    const project: Project = {
      ...projectData, id,
      activities: projectData.activities || [],
      installments: projectData.installments || [],
      createdAt: new Date().toISOString(),
    };
    set((state) => {
      const _allProjects = [project, ...state._allProjects];
      return { _allProjects, ...recomputeFiltered({ ...state, _allProjects }) };
    });
    supabase.from('projects').insert(projectToDb(project)).then(({ error }) => {
      if (error && isWorkspaceMissingError(error)) {
        markWorkspaceColumnMissing();
        supabase.from('projects').insert(projectToDb(project)).then(({ error: e2 }) => logErr('addProject (retry workspace)', e2));
        return;
      }
      if (error && isCommissionMissingError(error)) {
        markCommissionColumnMissing();
        supabase.from('projects').insert(projectToDb(project)).then(({ error: e2 }) => logErr('addProject (retry commission)', e2));
        return;
      }
      logErr('addProject', error);
    });
    return id;
  },

  updateProject: (id, data) => {
    set((state) => {
      const _allProjects = state._allProjects.map((p) => (p.id === id ? { ...p, ...data } : p));
      return { _allProjects, ...recomputeFiltered({ ...state, _allProjects }) };
    });
    const updated = get()._allProjects.find((p) => p.id === id);
    if (!updated) return;
    supabase.from('projects').update(projectToDb(updated)).eq('id', id).then(({ error }) => {
      if (error && isWorkspaceMissingError(error)) {
        markWorkspaceColumnMissing();
        supabase.from('projects').update(projectToDb(updated)).eq('id', id).then(({ error: e2 }) => logErr('updateProject (retry workspace)', e2));
        return;
      }
      if (error && isCommissionMissingError(error)) {
        markCommissionColumnMissing();
        supabase.from('projects').update(projectToDb(updated)).eq('id', id).then(({ error: e2 }) => logErr('updateProject (retry commission)', e2));
        return;
      }
      logErr('updateProject', error);
    });
  },

  deleteProject: (id) => {
    set((state) => {
      const _allProjects = state._allProjects.filter((p) => p.id !== id);
      const _allQuotations = state._allQuotations.filter((q) => q.projectId !== id);
      const _allPayments = state._allPayments.filter((p) => p.projectId !== id);
      const _allDistributions = state._allDistributions.filter((d) => d.projectId !== id);
      return {
        _allProjects, _allQuotations, _allPayments, _allDistributions,
        ...recomputeFiltered({ ...state, _allProjects, _allQuotations, _allPayments, _allDistributions }),
      };
    });
    supabase.from('projects').delete().eq('id', id).then(({ error }) => logErr('deleteProject', error));
  },

  // ============ Activities (JSONB inside project) ============
  addActivity: (projectId, activityData) => {
    const id = uuidv4();
    set((state) => {
      const _allProjects = state._allProjects.map((p) =>
        p.id === projectId ? { ...p, activities: [...p.activities, { ...activityData, id }] } : p
      );
      return { _allProjects, ...recomputeFiltered({ ...state, _allProjects }) };
    });
    const updated = get()._allProjects.find((p) => p.id === projectId);
    if (updated) supabase.from('projects').update({ activities: updated.activities }).eq('id', projectId).then(({ error }) => logErr('addActivity', error));
  },

  updateActivity: (projectId, activityId, data) => {
    set((state) => {
      const _allProjects = state._allProjects.map((p) =>
        p.id === projectId
          ? { ...p, activities: p.activities.map((a) => (a.id === activityId ? { ...a, ...data } : a)) }
          : p
      );
      return { _allProjects, ...recomputeFiltered({ ...state, _allProjects }) };
    });
    const updated = get()._allProjects.find((p) => p.id === projectId);
    if (updated) supabase.from('projects').update({ activities: updated.activities }).eq('id', projectId).then(({ error }) => logErr('updateActivity', error));
  },

  deleteActivity: (projectId, activityId) => {
    set((state) => {
      const _allProjects = state._allProjects.map((p) =>
        p.id === projectId ? { ...p, activities: p.activities.filter((a) => a.id !== activityId) } : p
      );
      return { _allProjects, ...recomputeFiltered({ ...state, _allProjects }) };
    });
    const updated = get()._allProjects.find((p) => p.id === projectId);
    if (updated) supabase.from('projects').update({ activities: updated.activities }).eq('id', projectId).then(({ error }) => logErr('deleteActivity', error));
  },

  // ============ Installments (JSONB) ============
  addInstallment: (projectId, installmentData) => {
    const id = uuidv4();
    set((state) => {
      const _allProjects = state._allProjects.map((p) =>
        p.id === projectId ? { ...p, installments: [...p.installments, { ...installmentData, id }] } : p
      );
      return { _allProjects, ...recomputeFiltered({ ...state, _allProjects }) };
    });
    const updated = get()._allProjects.find((p) => p.id === projectId);
    if (updated) supabase.from('projects').update({ installments: updated.installments }).eq('id', projectId).then(({ error }) => logErr('addInstallment', error));
  },

  updateInstallment: (projectId, installmentId, data) => {
    set((state) => {
      const _allProjects = state._allProjects.map((p) =>
        p.id === projectId
          ? { ...p, installments: p.installments.map((inst) => (inst.id === installmentId ? { ...inst, ...data } : inst)) }
          : p
      );
      return { _allProjects, ...recomputeFiltered({ ...state, _allProjects }) };
    });
    const updated = get()._allProjects.find((p) => p.id === projectId);
    if (updated) supabase.from('projects').update({ installments: updated.installments }).eq('id', projectId).then(({ error }) => logErr('updateInstallment', error));
  },

  deleteInstallment: (projectId, installmentId) => {
    set((state) => {
      const _allProjects = state._allProjects.map((p) =>
        p.id === projectId ? { ...p, installments: p.installments.filter((inst) => inst.id !== installmentId) } : p
      );
      return { _allProjects, ...recomputeFiltered({ ...state, _allProjects }) };
    });
    const updated = get()._allProjects.find((p) => p.id === projectId);
    if (updated) supabase.from('projects').update({ installments: updated.installments }).eq('id', projectId).then(({ error }) => logErr('deleteInstallment', error));
  },

  // ============ Payments ============
  addPayment: (paymentData) => {
    const id = uuidv4();
    const payment: PaymentRecord = { ...paymentData, id, createdAt: new Date().toISOString() };
    set((state) => {
      const _allPayments = [...state._allPayments, payment];
      return { _allPayments, ...recomputeFiltered({ ...state, _allPayments }) };
    });
    supabase.from('payments').insert(paymentToDb(payment)).then(({ error }) => logErr('addPayment', error));
    return id;
  },

  updatePayment: (id, data) => {
    set((state) => {
      const _allPayments = state._allPayments.map((p) => (p.id === id ? { ...p, ...data } : p));
      return { _allPayments, ...recomputeFiltered({ ...state, _allPayments }) };
    });
    const updated = get()._allPayments.find((p) => p.id === id);
    if (updated) supabase.from('payments').update(paymentToDb(updated)).eq('id', id).then(({ error }) => logErr('updatePayment', error));
  },

  deletePayment: (id) => {
    set((state) => {
      const _allPayments = state._allPayments.filter((p) => p.id !== id);
      return { _allPayments, ...recomputeFiltered({ ...state, _allPayments }) };
    });
    supabase.from('payments').delete().eq('id', id).then(({ error }) => logErr('deletePayment', error));
  },

  // ============ Distributions ============
  addDistribution: (distData) => {
    const id = uuidv4();
    const dist: DistributionRecord = { ...distData, id, createdAt: new Date().toISOString() };
    set((state) => {
      const _allDistributions = [...state._allDistributions, dist];
      return { _allDistributions, ...recomputeFiltered({ ...state, _allDistributions }) };
    });
    supabase.from('distributions').insert(distributionToDb(dist)).then(({ error }) => logErr('addDistribution', error));
    return id;
  },

  updateDistribution: (id, data) => {
    set((state) => {
      const _allDistributions = state._allDistributions.map((d) => (d.id === id ? { ...d, ...data } : d));
      return { _allDistributions, ...recomputeFiltered({ ...state, _allDistributions }) };
    });
    const updated = get()._allDistributions.find((d) => d.id === id);
    if (updated) supabase.from('distributions').update(distributionToDb(updated)).eq('id', id).then(({ error }) => logErr('updateDistribution', error));
  },

  deleteDistribution: (id) => {
    set((state) => {
      const _allDistributions = state._allDistributions.filter((d) => d.id !== id);
      return { _allDistributions, ...recomputeFiltered({ ...state, _allDistributions }) };
    });
    supabase.from('distributions').delete().eq('id', id).then(({ error }) => logErr('deleteDistribution', error));
  },

  // ============ Quotations ============
  addQuotation: (quotationData) => {
    const id = uuidv4();
    const quotation: Quotation = { ...quotationData, id, createdAt: new Date().toISOString() };
    set((state) => {
      const _allQuotations = [quotation, ...state._allQuotations];
      return { _allQuotations, ...recomputeFiltered({ ...state, _allQuotations }) };
    });
    supabase.from('quotations').insert(quotationToDb(quotation)).then(({ error }) => logErr('addQuotation', error));
    return id;
  },

  updateQuotation: (id, data) => {
    set((state) => {
      const _allQuotations = state._allQuotations.map((q) => (q.id === id ? { ...q, ...data } : q));
      return { _allQuotations, ...recomputeFiltered({ ...state, _allQuotations }) };
    });
    const updated = get()._allQuotations.find((q) => q.id === id);
    if (updated) supabase.from('quotations').update(quotationToDb(updated)).eq('id', id).then(({ error }) => logErr('updateQuotation', error));
  },

  deleteQuotation: (id) => {
    set((state) => {
      const _allQuotations = state._allQuotations.filter((q) => q.id !== id);
      return { _allQuotations, ...recomputeFiltered({ ...state, _allQuotations }) };
    });
    supabase.from('quotations').delete().eq('id', id).then(({ error }) => logErr('deleteQuotation', error));
  },

  // ============ Tracking Activities ============
  addTrackingActivity: (activityData) => {
    const id = uuidv4();
    const activity: TrackingActivity = { ...activityData, id, createdAt: new Date().toISOString() };
    set((state) => {
      const _allTrackingActivities = [...state._allTrackingActivities, activity];
      return { _allTrackingActivities, ...recomputeFiltered({ ...state, _allTrackingActivities }) };
    });
    supabase.from('tracking_activities').insert(trackingActivityToDb(activity)).then(({ error }) => logErr('addTrackingActivity', error));
    return id;
  },

  updateTrackingActivity: (id, data) => {
    set((state) => {
      const _allTrackingActivities = state._allTrackingActivities.map((t) => (t.id === id ? { ...t, ...data } : t));
      return { _allTrackingActivities, ...recomputeFiltered({ ...state, _allTrackingActivities }) };
    });
    const updated = get()._allTrackingActivities.find((t) => t.id === id);
    if (updated) supabase.from('tracking_activities').update(trackingActivityToDb(updated)).eq('id', id).then(({ error }) => logErr('updateTrackingActivity', error));
  },

  deleteTrackingActivity: (id) => {
    set((state) => {
      const _allTrackingActivities = state._allTrackingActivities.filter((t) => t.id !== id);
      return { _allTrackingActivities, ...recomputeFiltered({ ...state, _allTrackingActivities }) };
    });
    supabase.from('tracking_activities').delete().eq('id', id).then(({ error }) => logErr('deleteTrackingActivity', error));
  },

  // ============ Pool Transactions (เงินกองกลาง — ไม่ผูกโครงการ) ============
  addPoolTransaction: (txData) => {
    const id = uuidv4();
    const tx: PoolTransaction = { ...txData, id, createdAt: new Date().toISOString() };
    // Optimistic update
    set((state) => ({ poolTransactions: [tx, ...state.poolTransactions] }));
    supabase.from('pool_transactions').insert(poolTxToDb(tx)).then(({ error }) => {
      if (!error) return;
      logErr('addPoolTransaction', error);
      // Rollback state
      set((state) => ({ poolTransactions: state.poolTransactions.filter((t) => t.id !== id) }));
      // Detect table missing → helpful hint
      if (isTableMissingError(error, 'pool_transactions')) {
        toast.error(
          '⚠️ ยังไม่ได้สร้าง table pool_transactions ใน Supabase\n' +
          'ไปที่ Supabase Dashboard → SQL Editor → รัน schema.sql (ส่วน pool_transactions)',
          { duration: 10000 },
        );
      } else {
        toast.error(`บันทึกไม่สำเร็จ: ${(error as { message?: string })?.message || 'unknown error'}`);
      }
    });
    return id;
  },

  updatePoolTransaction: (id, data) => {
    // เก็บ snapshot ก่อนแก้ (สำหรับ rollback)
    const prev = get().poolTransactions.find((t) => t.id === id);
    set((state) => ({
      poolTransactions: state.poolTransactions.map((t) => (t.id === id ? { ...t, ...data } : t)),
    }));
    const updated = get().poolTransactions.find((t) => t.id === id);
    if (!updated) return;
    supabase.from('pool_transactions').update(poolTxToDb(updated)).eq('id', id).then(({ error }) => {
      if (!error) return;
      logErr('updatePoolTransaction', error);
      // Rollback
      if (prev) {
        set((state) => ({ poolTransactions: state.poolTransactions.map((t) => (t.id === id ? prev : t)) }));
      }
      if (isTableMissingError(error, 'pool_transactions')) {
        toast.error('⚠️ ยังไม่ได้สร้าง table pool_transactions ใน Supabase — โปรดรัน schema.sql', { duration: 10000 });
      } else {
        toast.error(`แก้ไขไม่สำเร็จ: ${(error as { message?: string })?.message || 'unknown error'}`);
      }
    });
  },

  deletePoolTransaction: (id) => {
    // เก็บ snapshot ก่อนลบ (สำหรับ rollback)
    const prev = get().poolTransactions.find((t) => t.id === id);
    set((state) => ({ poolTransactions: state.poolTransactions.filter((t) => t.id !== id) }));
    supabase.from('pool_transactions').delete().eq('id', id).then(({ error }) => {
      if (!error) return;
      logErr('deletePoolTransaction', error);
      // Rollback (คืน record ที่ลบไว้)
      if (prev) {
        set((state) => ({ poolTransactions: [prev, ...state.poolTransactions] }));
      }
      if (isTableMissingError(error, 'pool_transactions')) {
        toast.error('⚠️ ยังไม่ได้สร้าง table pool_transactions ใน Supabase — โปรดรัน schema.sql', { duration: 10000 });
      } else {
        toast.error(`ลบไม่สำเร็จ: ${(error as { message?: string })?.message || 'unknown error'}`);
      }
    });
  },

  // ============ Migration: LocalStorage → Supabase ============
  migrateFromLocalStorage: async () => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('research-management-storage') : null;
    if (!stored) return { projects: 0, payments: 0, distributions: 0, quotations: 0 };

    try {
      const data = JSON.parse(stored);
      const state = data.state || data;
      const oldProjects: Project[] = (state.projects || []).map((p: Project) => ({ ...p, type: (p.type ?? 'doctor') as ProjectType }));
      const oldPayments: PaymentRecord[] = state.payments || [];
      const oldDistributions: DistributionRecord[] = state.distributions || [];
      const oldQuotations: Quotation[] = state.quotations || [];

      if (oldProjects.length > 0) {
        const { error } = await supabase.from('projects').upsert(oldProjects.map(projectToDb));
        if (error) throw new Error(`Projects: ${error.message}`);
      }
      if (oldPayments.length > 0) {
        const { error } = await supabase.from('payments').upsert(oldPayments.map(paymentToDb));
        if (error) throw new Error(`Payments: ${error.message}`);
      }
      if (oldDistributions.length > 0) {
        const { error } = await supabase.from('distributions').upsert(oldDistributions.map(distributionToDb));
        if (error) throw new Error(`Distributions: ${error.message}`);
      }
      if (oldQuotations.length > 0) {
        const { error } = await supabase.from('quotations').upsert(oldQuotations.map(quotationToDb));
        if (error) throw new Error(`Quotations: ${error.message}`);
      }

      await get().loadAllData();

      return {
        projects: oldProjects.length,
        payments: oldPayments.length,
        distributions: oldDistributions.length,
        quotations: oldQuotations.length,
      };
    } catch (e) {
      console.error('[Migrate] failed:', e);
      throw e;
    }
  },
}), {
  name: 'research-mgmt-cache-v1',
  version: 1,
  storage: createJSONStorage(() => localStorage),
  // Persist เฉพาะ raw data + filters — ไม่รวม derived views (recompute เอง) และ dataLoaded (บังคับ refetch)
  partialize: (state) => ({
    _allProjects: state._allProjects,
    _allPayments: state._allPayments,
    _allDistributions: state._allDistributions,
    _allQuotations: state._allQuotations,
    _allTrackingActivities: state._allTrackingActivities,
    poolTransactions: state.poolTransactions,
    typeFilter: state.typeFilter,
    statusFilter: state.statusFilter,
    yearFilter: state.yearFilter,
  }),
  // หลัง rehydrate จาก localStorage — recompute filter views + kick off background refresh
  onRehydrateStorage: () => (state, error) => {
    if (error) {
      console.warn('[persist] rehydrate error:', error);
      return;
    }
    if (!state) return;
    // Recompute derived views (filters อาจไม่ตรงกับข้อมูล cached)
    Object.assign(state, recomputeFiltered({
      _allProjects: state._allProjects,
      _allPayments: state._allPayments,
      _allDistributions: state._allDistributions,
      _allQuotations: state._allQuotations,
      _allTrackingActivities: state._allTrackingActivities,
      typeFilter: state.typeFilter,
      statusFilter: state.statusFilter,
      yearFilter: state.yearFilter,
      searchQuery: state.searchQuery,
    }));
    // ถ้ามี cache อยู่ → mark dataLoaded=true ให้ UI paint ทันที
    // แล้ว trigger loadAllData() พื้นหลังเพื่อ refresh (SWR)
    if (state._allProjects.length > 0) {
      state.dataLoaded = true;
      // defer to next tick — ให้ store init เสร็จก่อน
      setTimeout(() => {
        state.loadAllData?.().catch((e) => console.warn('[persist] background refresh failed:', e));
      }, 0);
    }
  },
}));
