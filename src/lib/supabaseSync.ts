import { Project, Quotation, PaymentRecord, DistributionRecord, TrackingActivity, TrackingPriority, TrackingStatus, MemberId, ProjectType } from '@/types';

// DB column ชื่อ `workspace` (จาก migration) → TS field ชื่อ `type`
const DEFAULT_PROJECT_TYPE: ProjectType = 'doctor';
function normalizeProjectType(value: unknown): ProjectType {
  return value === 'student' ? 'student' : DEFAULT_PROJECT_TYPE;
}

// ถ้า DB ยังไม่มี column 'workspace' (user ยังไม่ได้รัน migration)
// จะตั้ง flag นี้ให้เลิกส่งฟิลด์นั้นไป เพื่อไม่ให้ error ซ้ำ
let workspaceColumnMissing = false;
export function markWorkspaceColumnMissing() {
  if (!workspaceColumnMissing) {
    workspaceColumnMissing = true;
    console.warn(
      '[supabaseSync] DB projects.workspace column not found — ปิดการ sync type field\n' +
      'กรุณารัน migration section 3 ใน supabase/schema.sql เพื่อเปิดใช้ Doctor/Student type'
    );
  }
}
export function isWorkspaceMissingError(e: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = e as any;
  const msg: string = (err?.message || '') + ' ' + (err?.details || '') + ' ' + (err?.hint || '');
  return /workspace/i.test(msg) && (err?.code === 'PGRST204' || /column/i.test(msg));
}

// ================================================================
// Helpers แปลงข้อมูลระหว่าง camelCase (TypeScript) ↔ snake_case (DB)
// ================================================================

// --- Project ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function projectToDb(p: Project): any {
  const base = {
    id: p.id,
    project_code: p.projectCode,
    name: p.name,
    client: p.client,
    budget: p.budget,
    start_date: p.startDate,
    end_date: p.endDate,
    status: p.status,
    activities: p.activities,
    installments: p.installments,
    created_at: p.createdAt,
  };
  // ส่ง workspace เฉพาะถ้า DB มี column นี้ (ไม่งั้น PGRST204)
  if (!workspaceColumnMissing) {
    return { ...base, workspace: p.type };
  }
  return base;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function projectFromDb(row: any): Project {
  return {
    id: row.id,
    projectCode: row.project_code || '',
    name: row.name,
    client: row.client || '',
    budget: Number(row.budget) || 0,
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    status: row.status || 'pending',
    activities: row.activities || [],
    installments: row.installments || [],
    createdAt: row.created_at || new Date().toISOString(),
    type: normalizeProjectType(row.workspace),
  };
}

// --- Payment ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function paymentToDb(p: PaymentRecord): any {
  return {
    id: p.id,
    project_id: p.projectId,
    installment_id: p.installmentId,
    amount: p.amount,
    paid_date: p.paidDate,
    slip_url: p.slipUrl,
    slip_urls: p.slipUrls || [],
    note: p.note,
    created_at: p.createdAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function paymentFromDb(row: any): PaymentRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    installmentId: row.installment_id || '',
    amount: Number(row.amount) || 0,
    paidDate: row.paid_date || '',
    slipUrl: row.slip_url || '',
    slipUrls: row.slip_urls || [],
    note: row.note || '',
    createdAt: row.created_at || new Date().toISOString(),
  };
}

// --- Distribution ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function distributionToDb(d: DistributionRecord): any {
  return {
    id: d.id,
    project_id: d.projectId,
    recipient_id: d.recipientId,
    amount: d.amount,
    paid_date: d.paidDate,
    slip_url: d.slipUrl,
    slip_urls: d.slipUrls || [],
    note: d.note,
    created_at: d.createdAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function distributionFromDb(row: any): DistributionRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    recipientId: row.recipient_id,
    amount: Number(row.amount) || 0,
    paidDate: row.paid_date || '',
    slipUrl: row.slip_url || '',
    slipUrls: row.slip_urls || [],
    note: row.note || '',
    createdAt: row.created_at || new Date().toISOString(),
  };
}

// --- Quotation ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function quotationToDb(q: Quotation): any {
  return {
    id: q.id,
    quotation_number: q.quotationNumber,
    project_id: q.projectId,
    client_name: q.clientName,
    client_address: q.clientAddress,
    client_phone: q.clientPhone,
    items: q.items,
    date: q.date,
    valid_until: q.validUntil,
    notes: q.notes,
    discount: q.discount,
    created_at: q.createdAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function quotationFromDb(row: any): Quotation {
  return {
    id: row.id,
    quotationNumber: row.quotation_number || '',
    projectId: row.project_id || '',
    clientName: row.client_name || '',
    clientAddress: row.client_address || '',
    clientPhone: row.client_phone || '',
    items: row.items || [],
    date: row.date || '',
    validUntil: row.valid_until || '',
    notes: row.notes || '',
    discount: Number(row.discount) || 0,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

// --- Tracking Activity ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function trackingActivityToDb(t: TrackingActivity): any {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    project_id: t.projectId,
    assignee_id: t.assigneeId,
    start_date: t.startDate,
    deadline: t.deadline,
    status: t.status,
    priority: t.priority,
    created_at: t.createdAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function trackingActivityFromDb(row: any): TrackingActivity {
  return {
    id: row.id,
    title: row.title || '',
    description: row.description || '',
    projectId: row.project_id || '',
    assigneeId: (row.assignee_id || '') as MemberId | '',
    startDate: row.start_date || '',
    deadline: row.deadline || '',
    status: (row.status || 'todo') as TrackingStatus,
    priority: (row.priority || 'medium') as TrackingPriority,
    createdAt: row.created_at || new Date().toISOString(),
  };
}
