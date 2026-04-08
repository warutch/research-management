import { create } from 'zustand';
import { Project, Quotation, Activity, MemberId, PaymentInstallment, PaymentRecord, DistributionRecord, TrackingActivity, HORSE_PERCENT, POOL_PERCENT } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/lib/supabase';
import {
  projectToDb, projectFromDb,
  paymentToDb, paymentFromDb,
  distributionToDb, distributionFromDb,
  quotationToDb, quotationFromDb,
  trackingActivityToDb, trackingActivityFromDb,
} from '@/lib/supabaseSync';

interface AppState {
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

// Helper: log Supabase errors (extract all properties)
function logErr(action: string, error: unknown) {
  if (!error) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = error as any;

  // Extract all enumerable + own properties
  const errorInfo: Record<string, unknown> = {};
  if (e instanceof Error) {
    errorInfo.name = e.name;
    errorInfo.message = e.message;
    errorInfo.stack = e.stack;
  }
  // Supabase PostgrestError fields
  if (e?.message) errorInfo.message = e.message;
  if (e?.code) errorInfo.code = e.code;
  if (e?.details) errorInfo.details = e.details;
  if (e?.hint) errorInfo.hint = e.hint;
  if (e?.status) errorInfo.status = e.status;
  if (e?.statusText) errorInfo.statusText = e.statusText;

  // Get all own property keys
  try {
    const keys = Object.getOwnPropertyNames(e);
    keys.forEach((k) => {
      if (!(k in errorInfo)) errorInfo[k] = e[k];
    });
  } catch {}

  console.error(`[Supabase] ${action} error:`);
  console.error('  Type:', typeof e, e?.constructor?.name);
  console.error('  Info:', errorInfo);
  console.error('  Raw:', e);
  console.error('  JSON:', JSON.stringify(e, Object.getOwnPropertyNames(e || {})));
}

export const useStore = create<AppState>()((set, get) => ({
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

      set({
        projects: (projectsRes.data || []).map(projectFromDb),
        payments: (paymentsRes.data || []).map(paymentFromDb),
        distributions: (distributionsRes.data || []).map(distributionFromDb),
        quotations: (quotationsRes.data || []).map(quotationFromDb),
        trackingActivities: (trackingRes.data || []).map(trackingActivityFromDb),
        dataLoaded: true,
      });
    } catch (e) {
      console.error('[Supabase] loadAllData failed:', e);
      set({ dataLoaded: true });
    }
  },

  resetStore: () => {
    set({ projects: [], quotations: [], payments: [], distributions: [], trackingActivities: [], dataLoaded: false });
  },

  // ============ Projects ============
  addProject: (projectData) => {
    const id = uuidv4();
    const project: Project = { ...projectData, id, activities: [], installments: [], createdAt: new Date().toISOString() };
    set((state) => ({ projects: [project, ...state.projects] }));
    supabase.from('projects').insert(projectToDb(project)).then(({ error }) => logErr('addProject', error));
    return id;
  },

  updateProject: (id, data) => {
    set((state) => ({ projects: state.projects.map((p) => (p.id === id ? { ...p, ...data } : p)) }));
    const updated = get().projects.find((p) => p.id === id);
    if (updated) supabase.from('projects').update(projectToDb(updated)).eq('id', id).then(({ error }) => logErr('updateProject', error));
  },

  deleteProject: (id) => {
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      quotations: state.quotations.filter((q) => q.projectId !== id),
      payments: state.payments.filter((p) => p.projectId !== id),
      distributions: state.distributions.filter((d) => d.projectId !== id),
    }));
    supabase.from('projects').delete().eq('id', id).then(({ error }) => logErr('deleteProject', error));
    // Cascade ทำใน DB อยู่แล้ว (ON DELETE CASCADE) สำหรับ payments + distributions
  },

  // ============ Activities (อยู่ใน project.activities เป็น JSONB) ============
  addActivity: (projectId, activityData) => {
    const id = uuidv4();
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, activities: [...p.activities, { ...activityData, id }] } : p
      ),
    }));
    const updated = get().projects.find((p) => p.id === projectId);
    if (updated) supabase.from('projects').update({ activities: updated.activities }).eq('id', projectId).then(({ error }) => logErr('addActivity', error));
  },

  updateActivity: (projectId, activityId, data) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? { ...p, activities: p.activities.map((a) => (a.id === activityId ? { ...a, ...data } : a)) }
          : p
      ),
    }));
    const updated = get().projects.find((p) => p.id === projectId);
    if (updated) supabase.from('projects').update({ activities: updated.activities }).eq('id', projectId).then(({ error }) => logErr('updateActivity', error));
  },

  deleteActivity: (projectId, activityId) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, activities: p.activities.filter((a) => a.id !== activityId) } : p
      ),
    }));
    const updated = get().projects.find((p) => p.id === projectId);
    if (updated) supabase.from('projects').update({ activities: updated.activities }).eq('id', projectId).then(({ error }) => logErr('deleteActivity', error));
  },

  // ============ Installments (JSONB) ============
  addInstallment: (projectId, installmentData) => {
    const id = uuidv4();
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, installments: [...p.installments, { ...installmentData, id }] } : p
      ),
    }));
    const updated = get().projects.find((p) => p.id === projectId);
    if (updated) supabase.from('projects').update({ installments: updated.installments }).eq('id', projectId).then(({ error }) => logErr('addInstallment', error));
  },

  updateInstallment: (projectId, installmentId, data) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? { ...p, installments: p.installments.map((inst) => (inst.id === installmentId ? { ...inst, ...data } : inst)) }
          : p
      ),
    }));
    const updated = get().projects.find((p) => p.id === projectId);
    if (updated) supabase.from('projects').update({ installments: updated.installments }).eq('id', projectId).then(({ error }) => logErr('updateInstallment', error));
  },

  deleteInstallment: (projectId, installmentId) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, installments: p.installments.filter((inst) => inst.id !== installmentId) } : p
      ),
    }));
    const updated = get().projects.find((p) => p.id === projectId);
    if (updated) supabase.from('projects').update({ installments: updated.installments }).eq('id', projectId).then(({ error }) => logErr('deleteInstallment', error));
  },

  // ============ Payments ============
  addPayment: (paymentData) => {
    const id = uuidv4();
    const payment: PaymentRecord = { ...paymentData, id, createdAt: new Date().toISOString() };
    set((state) => ({ payments: [...state.payments, payment] }));
    supabase.from('payments').insert(paymentToDb(payment)).then(({ error }) => logErr('addPayment', error));
    return id;
  },

  updatePayment: (id, data) => {
    set((state) => ({ payments: state.payments.map((p) => (p.id === id ? { ...p, ...data } : p)) }));
    const updated = get().payments.find((p) => p.id === id);
    if (updated) supabase.from('payments').update(paymentToDb(updated)).eq('id', id).then(({ error }) => logErr('updatePayment', error));
  },

  deletePayment: (id) => {
    set((state) => ({ payments: state.payments.filter((p) => p.id !== id) }));
    supabase.from('payments').delete().eq('id', id).then(({ error }) => logErr('deletePayment', error));
  },

  // ============ Distributions ============
  addDistribution: (distData) => {
    const id = uuidv4();
    const dist: DistributionRecord = { ...distData, id, createdAt: new Date().toISOString() };
    set((state) => ({ distributions: [...state.distributions, dist] }));
    supabase.from('distributions').insert(distributionToDb(dist)).then(({ error }) => logErr('addDistribution', error));
    return id;
  },

  updateDistribution: (id, data) => {
    set((state) => ({ distributions: state.distributions.map((d) => (d.id === id ? { ...d, ...data } : d)) }));
    const updated = get().distributions.find((d) => d.id === id);
    if (updated) supabase.from('distributions').update(distributionToDb(updated)).eq('id', id).then(({ error }) => logErr('updateDistribution', error));
  },

  deleteDistribution: (id) => {
    set((state) => ({ distributions: state.distributions.filter((d) => d.id !== id) }));
    supabase.from('distributions').delete().eq('id', id).then(({ error }) => logErr('deleteDistribution', error));
  },

  // ============ Quotations ============
  addQuotation: (quotationData) => {
    const id = uuidv4();
    const quotation: Quotation = { ...quotationData, id, createdAt: new Date().toISOString() };
    set((state) => ({ quotations: [quotation, ...state.quotations] }));
    supabase.from('quotations').insert(quotationToDb(quotation)).then(({ error }) => logErr('addQuotation', error));
    return id;
  },

  updateQuotation: (id, data) => {
    set((state) => ({ quotations: state.quotations.map((q) => (q.id === id ? { ...q, ...data } : q)) }));
    const updated = get().quotations.find((q) => q.id === id);
    if (updated) supabase.from('quotations').update(quotationToDb(updated)).eq('id', id).then(({ error }) => logErr('updateQuotation', error));
  },

  deleteQuotation: (id) => {
    set((state) => ({ quotations: state.quotations.filter((q) => q.id !== id) }));
    supabase.from('quotations').delete().eq('id', id).then(({ error }) => logErr('deleteQuotation', error));
  },

  // ============ Tracking Activities ============
  addTrackingActivity: (activityData) => {
    const id = uuidv4();
    const activity: TrackingActivity = { ...activityData, id, createdAt: new Date().toISOString() };
    set((state) => ({ trackingActivities: [...state.trackingActivities, activity] }));
    supabase.from('tracking_activities').insert(trackingActivityToDb(activity)).then(({ error }) => logErr('addTrackingActivity', error));
    return id;
  },

  updateTrackingActivity: (id, data) => {
    set((state) => ({
      trackingActivities: state.trackingActivities.map((t) => (t.id === id ? { ...t, ...data } : t)),
    }));
    const updated = get().trackingActivities.find((t) => t.id === id);
    if (updated) supabase.from('tracking_activities').update(trackingActivityToDb(updated)).eq('id', id).then(({ error }) => logErr('updateTrackingActivity', error));
  },

  deleteTrackingActivity: (id) => {
    set((state) => ({ trackingActivities: state.trackingActivities.filter((t) => t.id !== id) }));
    supabase.from('tracking_activities').delete().eq('id', id).then(({ error }) => logErr('deleteTrackingActivity', error));
  },

  // ============ Migration: LocalStorage → Supabase ============
  migrateFromLocalStorage: async () => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('research-management-storage') : null;
    if (!stored) return { projects: 0, payments: 0, distributions: 0, quotations: 0 };

    try {
      const data = JSON.parse(stored);
      const state = data.state || data;
      const oldProjects: Project[] = state.projects || [];
      const oldPayments: PaymentRecord[] = state.payments || [];
      const oldDistributions: DistributionRecord[] = state.distributions || [];
      const oldQuotations: Quotation[] = state.quotations || [];

      // Upload projects (with activities + installments JSONB inside)
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

      // Reload data
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
