export type MemberId = 'tangmo' | 'frank' | 'ton';

export interface Member {
  id: MemberId;
  name: string;
  shortName: string;
  role: string;
  color: string;
}

export const MEMBERS: Member[] = [
  { id: 'tangmo', name: 'Specialist', shortName: 'SP', role: 'ตรวจสอบ Content / เขียนโครงร่างวิจัย', color: '#8b5cf6' },
  { id: 'frank', name: 'Analyst', shortName: 'AN', role: 'วิเคราะห์ผลการวิจัย', color: '#3b82f6' },
  { id: 'ton', name: 'Coordinator', shortName: 'CO', role: 'ประสานงานโครงการ', color: '#10b981' },
];

// ชื่อที่แสดงในระบบ (รวม Manager + Pool money)
export type ShareId = MemberId | 'horse' | 'pool';

export const ALL_SHARE_NAMES: Record<ShareId, string> = {
  tangmo: 'Specialist',
  frank: 'Analyst',
  ton: 'Coordinator',
  horse: 'Manager',
  pool: 'Pool money',
};

export const ALL_SHORT_NAMES: Record<ShareId, string> = {
  tangmo: 'SP',
  frank: 'AN',
  ton: 'CO',
  horse: 'MG',
  pool: 'PM',
};

// กิจกรรมมาตรฐานของโครงการวิจัย
export const STANDARD_ACTIVITIES = [
  'Proposal',
  'Analysis',
  'Result',
  'Publication Support',
  'Consult',
] as const;

export type ProjectStatus = 'pending' | 'in_progress' | 'completed';

// ค่าเริ่มต้น % หัก ผู้จัดการ + กองกลาง (แก้ไขได้รายกิจกรรม)
export const HORSE_PERCENT = 2.5;
export const POOL_PERCENT = 2.5;
export const DEDUCTION_PERCENT = HORSE_PERCENT + POOL_PERCENT;

export interface Activity {
  id: string;
  name: string;
  cost: number;
  sharePercent: Record<MemberId, number>; // เฉพาะ 3 คนหลัก
  horsePercent?: number; // % ผู้จัดการ (default 2.5)
  poolPercent?: number;  // % กองกลาง (default 2.5)
  status: ProjectStatus;
}

// Helper: ดึง horse % จาก activity (fallback default)
export function getHorsePercent(a: Activity): number {
  return a.horsePercent ?? HORSE_PERCENT;
}
export function getPoolPercent(a: Activity): number {
  return a.poolPercent ?? POOL_PERCENT;
}

export type PaymentStatus = 'pending' | 'paid';

export interface PaymentInstallment {
  id: string;
  installmentNumber: number; // ลำดับงวด 1, 2, 3, ...
  name: string; // เช่น "งวดที่ 1 ส่ง Draft มัดจำ 50%"
  amount: number;
  status: PaymentStatus;
  paidDate: string;
}

export interface Project {
  id: string;
  projectCode: string; // รหัสโครงการ เช่น 20260223
  name: string;
  client: string; // ผู้วิจัย
  budget: number;
  startDate: string;
  endDate: string;
  status: ProjectStatus;
  activities: Activity[];
  installments: PaymentInstallment[];
  createdAt: string;
}

export interface QuotationItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  projectId: string;
  clientName: string;
  clientAddress: string;
  clientPhone: string;
  items: QuotationItem[];
  date: string;
  validUntil: string;
  notes: string;
  discount: number;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  projectId: string;
  installmentId: string; // link to which installment
  amount: number;
  paidDate: string;
  slipUrl: string; // backwards compat: slip แรก (deprecated)
  slipUrls?: string[]; // base64 data URLs ของ slip ทั้งหมด
  note: string;
  createdAt: string;
}

export type RecipientId = MemberId | 'horse' | 'pool';

export interface DistributionRecord {
  id: string;
  projectId: string;
  recipientId: RecipientId; // tangmo, frank, ton, horse, pool
  amount: number;
  paidDate: string;
  slipUrl: string; // backwards compat (deprecated)
  slipUrls?: string[]; // base64 data URLs ของ slip ทั้งหมด
  note: string;
  createdAt: string;
}

// ============ Tracking Activities ============
export type TrackingPriority = 'low' | 'medium' | 'high';
export type TrackingStatus = 'todo' | 'in_progress' | 'done';

export interface TrackingActivity {
  id: string;
  title: string;
  description: string;
  projectId: string; // '' = ไม่ผูกกับโครงการ
  assigneeId: MemberId | ''; // '' = ไม่ระบุผู้รับผิดชอบ
  startDate: string;
  deadline: string;
  status: TrackingStatus;
  priority: TrackingPriority;
  createdAt: string;
}

export const PRIORITY_LABELS: Record<TrackingPriority, string> = {
  low: 'ต่ำ',
  medium: 'ปานกลาง',
  high: 'สูง',
};

export const PRIORITY_COLORS: Record<TrackingPriority, string> = {
  low: 'bg-green-100 text-green-700 border-green-300',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  high: 'bg-red-100 text-red-700 border-red-300',
};

export const TRACKING_STATUS_LABELS: Record<TrackingStatus, string> = {
  todo: 'รอทำ',
  in_progress: 'กำลังทำ',
  done: 'เสร็จแล้ว',
};

export const TRACKING_STATUS_COLORS: Record<TrackingStatus, string> = {
  todo: 'bg-gray-100 text-gray-700 border-gray-300',
  in_progress: 'bg-blue-100 text-blue-700 border-blue-300',
  done: 'bg-green-100 text-green-700 border-green-300',
};

export const TRACKING_STATUS_DOTS: Record<TrackingStatus, string> = {
  todo: 'bg-gray-400',
  in_progress: 'bg-blue-500',
  done: 'bg-green-500',
};

// Helper: รวม slipUrl เก่า + slipUrls ใหม่ → array
export function getSlips(record: { slipUrl?: string; slipUrls?: string[] }): string[] {
  const arr: string[] = [];
  if (record.slipUrls && record.slipUrls.length > 0) arr.push(...record.slipUrls);
  else if (record.slipUrl) arr.push(record.slipUrl);
  return arr.filter(Boolean);
}

