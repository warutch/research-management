export type MemberId = 'tangmo' | 'frank' | 'ton';

export interface Member {
  id: MemberId;
  name: string;
  shortName: string;
  role: string;
  color: string;
}

export const MEMBERS: Member[] = [
  { id: 'tangmo', name: 'อ.แตงโม', shortName: 'ตม', role: 'ตรวจสอบ Content / เขียนโครงร่างวิจัย', color: '#8b5cf6' },
  { id: 'frank', name: 'แฟรงค์', shortName: 'ฟ', role: 'วิเคราะห์ผลการวิจัย', color: '#3b82f6' },
  { id: 'ton', name: 'ต้น', shortName: 'ต', role: 'ประสานงานโครงการ', color: '#10b981' },
];

// ชื่อที่แสดงในระบบ (รวม ผู้จัดการ กองกลาง)
export type ShareId = MemberId | 'horse' | 'pool';

export const ALL_SHARE_NAMES: Record<ShareId, string> = {
  tangmo: 'อ.แตงโม',
  frank: 'แฟรงค์',
  ton: 'ต้น',
  horse: 'ผู้จัดการ',
  pool: 'กองกลาง',
};

export const ALL_SHORT_NAMES: Record<ShareId, string> = {
  tangmo: 'ตม',
  frank: 'ฟ',
  ton: 'ต',
  horse: 'ผจก',
  pool: 'กก',
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

export interface Activity {
  id: string;
  name: string;
  cost: number;
  sharePercent: Record<MemberId, number>; // เฉพาะ 3 คนหลัก (ม้า 2.5% + กองกลาง 2.5% หักอัตโนมัติ)
  status: ProjectStatus;
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
  slipUrl: string; // base64 data URL of uploaded slip image
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
  slipUrl: string;
  note: string;
  createdAt: string;
}

// ค่าคงที่ หัก ม้า + กองกลาง
export const HORSE_PERCENT = 2.5;
export const POOL_PERCENT = 2.5;
export const DEDUCTION_PERCENT = HORSE_PERCENT + POOL_PERCENT; // 5% รวม
