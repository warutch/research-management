import { create } from 'zustand';
import {
  Project, Quotation, Activity, MemberId, PaymentInstallment, PaymentRecord,
  DistributionRecord, TrackingActivity, HORSE_PERCENT, POOL_PERCENT,
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
  markWorkspaceColumnMissing, isWorkspaceMissingError,
} from '@/lib/supabaseSync';

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
  dataLoaded: boolean;

  loadAllData: () => Promise<void>;
  resetStore: () => void;

  // Projects
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'activities' | 'installments'>) => string;
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

// Logger
function logErr(action: string, error: unknown) {
  if (!error) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = error as any;
  const errorInfo: Record<string, unknown> = {};
  if (e instanceof Error) {
    errorInfo.name = e.name;
    errorInfo.message = e.message;
    errorInfo.stack = e.stack;
  }
  if (e?.message) errorInfo.message = e.message;
  if (e?.code) errorInfo.code = e.code;
  if (e?.details) errorInfo.details = e.details;
  if (e?.hint) errorInfo.hint = e.hint;
  if (e?.status) errorInfo.status = e.status;
  if (e?.statusText) errorInfo.statusText = e.statusText;
  try {
    const keys = Object.getOwnPropertyNames(e);
    keys.forEach((k) => { if (!(k in errorInfo)) errorInfo[k] = e[k]; });
  } catch {}
  console.error(`[Supabase] ${action} error:`);
  console.error('  Type:', typeof e, e?.constructor?.name);
  console.error('  Info:', errorInfo);
  console.error('  Raw:', e);
  console.error('  JSON:', JSON.stringify(e, Object.getOwnPropertyNames(e || {})));
}

export const useStore = create<AppState>()((set, get) => ({
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
  dataLoaded: false,

  loadAllData: async () => {
    try {
      const [projectsRes, paymentsRes, distributionsRes, quotationsRes, trackingRes] = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('payments').select('*'),
        supabase.from('distributions').select('*'),
        supabase.from('quotations').select('*'),
        supabase.from('tracking_activities').select('*'),
      ]);

      logErr('load projects', projectsRes.error);
      logErr('load payments', paymentsRes.error);
      logErr('load distributions', distributionsRes.error);
      logErr('load quotations', quotationsRes.error);
      logErr('load tracking', trackingRes.error);

      const _allProjects = (projectsRes.data || []).map(projectFromDb);
      const _allPayments = (paymentsRes.data || []).map(paymentFromDb);
      const _allDistributions = (distributionsRes.data || []).map(distributionFromDb);
      const _allQuotations = (quotationsRes.data || []).map(quotationFromDb);
      const _allTrackingActivities = (trackingRes.data || []).map(trackingActivityFromDb);

      set((state) => {
        // ครั้งแรกที่โหลด — set yearFilter เป็นปีล่าสุดอัตโนมัติ (default)
        let yearFilter = state.yearFilter;
        if (!state.dataLoaded && yearFilter === 'all') {
          const latest = getLatestYear(_allProjects);
          if (latest) yearFilter = latest;
        }
        return {
          _allProjects, _allPayments, _allDistributions, _allQuotations, _allTrackingActivities,
          yearFilter,
          ...recomputeFiltered({
            _allProjects, _allPayments, _allDistributions, _allQuotations, _allTrackingActivities,
            typeFilter: state.typeFilter,
            statusFilter: state.statusFilter,
            yearFilter,
            searchQuery: state.searchQuery,
          }),
          dataLoaded: true,
        };
      });
    } catch (e) {
      console.error('[Supabase] loadAllData failed:', e);
      set({ dataLoaded: true });
    }
  },

  resetStore: () => {
    set({
      _allProjects: [], _allQuotations: [], _allPayments: [], _allDistributions: [], _allTrackingActivities: [],
      projects: [], quotations: [], payments: [], distributions: [], trackingActivities: [],
      dataLoaded: false,
    });
  },

  // ============ Projects ============
  addProject: (projectData) => {
    const id = uuidv4();
    const project: Project = {
      ...projectData, id, activities: [], installments: [],
      createdAt: new Date().toISOString(),
    };
    set((state) => {
      const _allProjects = [project, ...state._allProjects];
      return { _allProjects, ...recomputeFiltered({ ...state, _allProjects }) };
    });
    supabase.from('projects').insert(projectToDb(project)).then(({ error }) => {
      if (error && isWorkspaceMissingError(error)) {
        markWorkspaceColumnMissing();
        supabase.from('projects').insert(projectToDb(project)).then(({ error: e2 }) => logErr('addProject (retry)', e2));
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
        supabase.from('projects').update(projectToDb(updated)).eq('id', id).then(({ error: e2 }) => logErr('updateProject (retry)', e2));
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
}));
