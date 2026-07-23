// ============ Project Type (Doctor / Student) ============
// แต่ละโครงการระบุว่าเป็น Doctor หรือ Student
// child records (payment/distribution/quotation/tracking) ไม่มี type ของตัวเอง
// — ใช้ projectId join กับ project เพื่อ filter
export type ProjectType = 'doctor' | 'student';
export type ProjectTypeFilter = 'all' | ProjectType;

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  doctor: 'Doctor',
  student: 'Student',
};

export const PROJECT_TYPE_COLORS: Record<ProjectType, { bg: string; text: string; border: string; dot: string }> = {
  doctor: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-300', dot: 'bg-sky-500' },
  student: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300', dot: 'bg-amber-500' },
};

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

// ชื่อที่แสดงในระบบ (รวม Manager + Pool money + Commission)
export type ShareId = MemberId | 'horse' | 'pool' | 'commission';

export const ALL_SHARE_NAMES: Record<ShareId, string> = {
  tangmo: 'Specialist',
  frank: 'Analyst',
  ton: 'Coordinator',
  horse: 'Manager',
  pool: 'Pool money',
  commission: 'Commission',
};

export const ALL_SHORT_NAMES: Record<ShareId, string> = {
  tangmo: 'SP',
  frank: 'AN',
  ton: 'CO',
  horse: 'MG',
  pool: 'PM',
  commission: 'CM',
};

// Commission default ของโครงการ Student
export const STUDENT_DEFAULT_COMMISSION = 1000;

// กิจกรรมมาตรฐานของโครงการวิจัย
export const STANDARD_ACTIVITIES = [
  'Proposal',
  'Analysis',
  'Result',
  'Publication Support',
  'Consult',
  'Research question',
  'Planning (Rational, Background, Research Design, Data Collection, Design CRF)',
  'Result (Analysis, Discussion, Conclusion)',
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
  type: ProjectType; // 'doctor' | 'student'
  commission?: number; // ค่า commission รายโครงการ (one-time) — default 0; Student default 1000
}

// Helper: ดึงค่า commission ของโครงการ (fallback 0)
export function getCommission(p: Pick<Project, 'commission'>): number {
  return p.commission ?? 0;
}

// ============ Income calculation helpers ============
// commission หักเฉพาะจาก 3 สมาชิกหลัก (Specialist/Analyst/Coordinator) ตามสัดส่วน raw
// Manager + Pool money ได้ raw เต็ม ไม่โดน commission

// รายได้รวมของโครงการ (sum cost ของทุก activity)
export function calcProjectTotalCost(project: Project): number {
  return project.activities.reduce((s, a) => s + a.cost, 0);
}

// รายได้ดิบของสมาชิก (ยังไม่หัก commission) — สำหรับโครงการ
export function calcMemberRawIncome(project: Project, memberId: MemberId): number {
  return project.activities.reduce((s, a) => s + (a.cost * (a.sharePercent[memberId] || 0)) / 100, 0);
}
export function calcHorseRawIncome(project: Project): number {
  return project.activities.reduce((s, a) => s + (a.cost * getHorsePercent(a)) / 100, 0);
}
export function calcPoolRawIncome(project: Project): number {
  return project.activities.reduce((s, a) => s + (a.cost * getPoolPercent(a)) / 100, 0);
}

// ผลรวม raw ของ 3 สมาชิกหลัก (Specialist + Analyst + Coordinator)
// เป็นฐานสำหรับหัก commission (Manager/Pool ไม่เกี่ยว)
export function calcMemberSumRaw(project: Project): number {
  return MEMBERS.reduce((s, m) => s + calcMemberRawIncome(project, m.id), 0);
}

// อัตราส่วนสุทธิหลังหัก commission — เฉพาะ 3 สมาชิกหลัก
// = (memberSumRaw − commission) / memberSumRaw
export function calcMemberNetRatio(project: Project): number {
  const sum = calcMemberSumRaw(project);
  const commission = getCommission(project);
  if (sum <= 0 || commission <= 0) return 1;
  return Math.max(0, (sum - commission) / sum);
}

// keep alias สำหรับ backward compat (โค้ดเก่าใช้ calcNetRatio)
// — ใช้กับ 3 สมาชิกหลักเท่านั้น (Manager/Pool ไม่ใช้แล้ว)
export function calcNetRatio(project: Project): number {
  return calcMemberNetRatio(project);
}

// รายได้สุทธิ (หลังหัก commission) — สมาชิก 3 คนหลัก
export function calcMemberNetIncome(project: Project, memberId: MemberId): number {
  return calcMemberRawIncome(project, memberId) * calcMemberNetRatio(project);
}
// Manager + Pool ได้ raw เต็ม — ไม่มีการหัก
export function calcHorseNetIncome(project: Project): number {
  return calcHorseRawIncome(project);
}
export function calcPoolNetIncome(project: Project): number {
  return calcPoolRawIncome(project);
}

// ส่วนที่ถูกหักจาก commission — เฉพาะสมาชิก 3 คน
export function calcMemberCommissionShare(project: Project, memberId: MemberId): number {
  return calcMemberRawIncome(project, memberId) - calcMemberNetIncome(project, memberId);
}
// Manager + Pool: ไม่โดน commission (returns 0)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function calcHorseCommissionShare(_project: Project): number {
  return 0;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function calcPoolCommissionShare(_project: Project): number {
  return 0;
}

// ============ shouldPay helpers (commission-first allocation, members-only burden) ============
// ลำดับการกระจายเงินที่ลูกค้าจ่ายมา (เงินทุกบาท):
// 1. แบ่งตามสัดส่วน raw ของแต่ละ recipient
//    - Manager/Pool ได้ส่วนของตนเองเต็ม (ไม่โดน commission)
//    - 3 สมาชิกหลัก ได้ส่วนของตนเองเข้า "pot รวม" ก่อน
// 2. จาก pot ของ 3 สมาชิก: เอาเข้า Commission ก่อนจนเต็ม
//    ที่เหลือกระจายให้สมาชิกตามสัดส่วน raw
//
// ตัวอย่าง: project ฿25,000 (members rawSum ฿23,750), commission ฿1,000
// งวด 1 ลูกค้าจ่าย ฿12,500:
//   - Manager ได้: 12,500 × (625/25,000) = ฿312.50
//   - Pool ได้:    12,500 × (625/25,000) = ฿312.50
//   - Members' pot: 12,500 × (23,750/25,000) = ฿11,875
//     - Commission ได้: ฿1,000 (เต็มยอด)
//     - เหลือกระจายให้สมาชิก: ฿10,875 ตามสัดส่วน raw

// ส่วนที่ต้องโอนให้ Manager (proportional to raw — ไม่โดน commission)
export function calcHorseShouldPay(project: Project, clientPaid: number): number {
  const totalCost = calcProjectTotalCost(project);
  if (totalCost <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, clientPaid) / totalCost);
  return calcHorseRawIncome(project) * ratio;
}

// ส่วนที่ต้องโอนให้ Pool (proportional to raw — ไม่โดน commission)
export function calcPoolShouldPay(project: Project, clientPaid: number): number {
  const totalCost = calcProjectTotalCost(project);
  if (totalCost <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, clientPaid) / totalCost);
  return calcPoolRawIncome(project) * ratio;
}

// pot รวมของ 3 สมาชิกตอนนี้ (ก่อนหัก commission)
// = memberSumRaw × (clientPaid / totalCost)
function _calcMembersPot(project: Project, clientPaid: number): number {
  const totalCost = calcProjectTotalCost(project);
  if (totalCost <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, clientPaid) / totalCost);
  return calcMemberSumRaw(project) * ratio;
}

// ส่วนที่ต้องโอนให้ Commission — ตัดเต็มก่อนจาก pot ของ 3 สมาชิก
export function calcCommissionShouldPay(project: Project, clientPaid: number): number {
  const commission = getCommission(project);
  const membersPot = _calcMembersPot(project, clientPaid);
  return Math.min(commission, Math.max(0, membersPot));
}

// ส่วนที่ต้องโอนให้สมาชิก (หลังหัก commission จาก members' pot)
export function calcMemberShouldPay(project: Project, memberId: MemberId, clientPaid: number): number {
  const memberSum = calcMemberSumRaw(project);
  if (memberSum <= 0) return 0;
  const membersPot = _calcMembersPot(project, clientPaid);
  const commissionTaken = calcCommissionShouldPay(project, clientPaid);
  const afterCommission = Math.max(0, membersPot - commissionTaken);
  return calcMemberRawIncome(project, memberId) * (afterCommission / memberSum);
}

// ============ Rounded shares (จำนวนเต็มบาท, Coordinator ดูดเศษ) ============
// คำนวณยอดโอนเป็นจำนวนเต็มบาทเสมอ — Coordinator (ton) จะดูดเศษทั้งหมด
// ทำให้รวมตรงกับยอดที่ลูกค้าจ่าย ไม่มี ฿0.50 รั่ว
//
// ลำดับการปัด:
// 1. Manager + Pool: round(raw × cappedPaid / totalCost)
// 2. Commission: round(min(commission, exactMembersPot))
// 3. Specialist + Analyst: round(remainingForMembers × theirRaw / memberSumRaw)
// 4. Coordinator: remainingForMembers − Specialist − Analyst (absorb เศษ)

export interface RoundedShares {
  members: Record<MemberId, number>;
  horse: number;
  pool: number;
  commission: number;
  total: number; // = sum ของทั้งหมด (= cappedPaid)
}

export function calcRoundedShares(project: Project, clientPaid: number): RoundedShares {
  const totalCost = calcProjectTotalCost(project);
  const cappedPaid = Math.min(totalCost, Math.max(0, clientPaid));

  if (totalCost <= 0) {
    return { members: { tangmo: 0, frank: 0, ton: 0 }, horse: 0, pool: 0, commission: 0, total: 0 };
  }

  // 1. Manager + Pool: raw proportional, rounded
  const horse = Math.round((calcHorseRawIncome(project) * cappedPaid) / totalCost);
  const pool = Math.round((calcPoolRawIncome(project) * cappedPaid) / totalCost);

  // 2. Commission: ตัดจาก members' pot ก่อน (จำนวนเต็ม)
  const commissionAmount = getCommission(project);
  const memberSumRaw = calcMemberSumRaw(project);
  const exactMembersPot = (memberSumRaw * cappedPaid) / totalCost;
  const commission = Math.round(Math.min(commissionAmount, exactMembersPot));

  // 3. ที่เหลือสำหรับ 3 สมาชิก = cappedPaid - horse - pool - commission
  const remainingForMembers = Math.max(0, cappedPaid - horse - pool - commission);

  // 4. Specialist + Analyst rounded, Coordinator (ton) absorb เศษ
  const tangmoRaw = calcMemberRawIncome(project, 'tangmo');
  const frankRaw = calcMemberRawIncome(project, 'frank');
  const tangmo = memberSumRaw > 0 ? Math.round((remainingForMembers * tangmoRaw) / memberSumRaw) : 0;
  const frank = memberSumRaw > 0 ? Math.round((remainingForMembers * frankRaw) / memberSumRaw) : 0;
  const ton = Math.max(0, remainingForMembers - tangmo - frank);

  return { members: { tangmo, frank, ton }, horse, pool, commission, total: cappedPaid };
}

// Convenience: yodtem expected NET ของแต่ละ recipient เมื่อโครงการจ่ายครบ (rounded)
export function calcRoundedExpected(project: Project): RoundedShares {
  return calcRoundedShares(project, calcProjectTotalCost(project));
}

// Delta สำหรับ per-installment table — ที่ recipient ควรได้ "เฉพาะงวดนี้"
// = (rounded share เมื่อ cumulative paid = afterCumulative) − (rounded share เมื่อ cumulative paid = beforeCumulative)
export function calcRoundedSharesDelta(project: Project, beforeCumulative: number, afterCumulative: number): RoundedShares {
  const before = calcRoundedShares(project, beforeCumulative);
  const after = calcRoundedShares(project, afterCumulative);
  return {
    members: {
      tangmo: after.members.tangmo - before.members.tangmo,
      frank: after.members.frank - before.members.frank,
      ton: after.members.ton - before.members.ton,
    },
    horse: after.horse - before.horse,
    pool: after.pool - before.pool,
    commission: after.commission - before.commission,
    total: after.total - before.total,
  };
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

export type RecipientId = MemberId | 'horse' | 'pool' | 'commission';

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

// ============ Pool money (เงินกองกลาง) ============
// รายการรับ-จ่ายเงิน pool ที่บันทึกด้วยตนเอง
// balance ปัจจุบัน = Σ inflows − Σ outflows
//   inflows = pool_transactions (type=in) + distributions (recipient='pool')
//   outflows = pool_transactions (type=out)

export type PoolTxType =
  | 'opening_balance'   // 🏦 ยอดยกมาครั้งแรก (in)
  | 'transfer_in'       // 📥 ยกยอดเข้าจากบัญชีอื่น (in)
  | 'spending'          // 🛒 ค่าใช้จ่ายกิจกรรม (out)
  | 'to_member'         // 👤 โอนให้สมาชิก (out)
  | 'to_other'          // 👥 โอนให้บุคคลอื่น (out)
  | 'other_in'          // 📝 อื่นๆ รับเข้า (in)
  | 'other_out';        // 📝 อื่นๆ จ่ายออก (out)

export const POOL_TX_LABELS: Record<PoolTxType, string> = {
  opening_balance: 'ยอดยกมา',
  transfer_in: 'ยกยอดเข้า',
  spending: 'ค่าใช้จ่าย',
  to_member: 'โอนให้สมาชิก',
  to_other: 'โอนให้บุคคลอื่น',
  other_in: 'อื่นๆ (รับเข้า)',
  other_out: 'อื่นๆ (จ่ายออก)',
};

export const POOL_TX_ICONS: Record<PoolTxType, string> = {
  opening_balance: '🏦',
  transfer_in: '📥',
  spending: '🛒',
  to_member: '👤',
  to_other: '👥',
  other_in: '📝',
  other_out: '📝',
};

// ทิศทางเงิน: in = บวก, out = ลบ
export function getPoolTxDirection(type: PoolTxType): 'in' | 'out' {
  return type === 'opening_balance' || type === 'transfer_in' || type === 'other_in' ? 'in' : 'out';
}

export interface PoolTransaction {
  id: string;
  type: PoolTxType;
  amount: number;               // เป็นบวกเสมอ (sign มาจาก type)
  date: string;                 // yyyy-mm-dd
  source?: string;              // สำหรับ transfer_in: จากบัญชี/แหล่งไหน
  category?: string;            // สำหรับ spending: office/tools/travel/etc.
  recipientMemberId?: MemberId; // สำหรับ to_member
  recipientName?: string;       // สำหรับ to_other (ชื่อคนรับ)
  description: string;          // รายละเอียด
  slipUrls?: string[];          // base64 slip images
  createdAt: string;
}

// คำนวณ balance ของ pool money จาก transactions + distributions ที่ไปที่ recipient='pool'
export function calcPoolBalance(
  poolTransactions: PoolTransaction[],
  distributions: DistributionRecord[],
): number {
  const fromTxIn = poolTransactions
    .filter((t) => getPoolTxDirection(t.type) === 'in')
    .reduce((s, t) => s + t.amount, 0);
  const fromTxOut = poolTransactions
    .filter((t) => getPoolTxDirection(t.type) === 'out')
    .reduce((s, t) => s + t.amount, 0);
  const fromDistributions = distributions
    .filter((d) => d.recipientId === 'pool')
    .reduce((s, d) => s + d.amount, 0);
  return fromTxIn + fromDistributions - fromTxOut;
}

// คำนวณ signed amount (+/-) ของ transaction
export function getPoolTxSignedAmount(tx: PoolTransaction): number {
  return getPoolTxDirection(tx.type) === 'in' ? tx.amount : -tx.amount;
}

