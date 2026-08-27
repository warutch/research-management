'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { MEMBERS, Project, Activity, MemberId, ProjectStatus, STANDARD_ACTIVITIES, HORSE_PERCENT, POOL_PERCENT, PaymentInstallment, PaymentRecord, DistributionRecord, RecipientId, ALL_SHARE_NAMES, ALL_SHORT_NAMES, getSlips, recordHasSlip, getHorsePercent, getPoolPercent, ProjectType, PROJECT_TYPE_LABELS, PROJECT_TYPE_COLORS, STUDENT_DEFAULT_COMMISSION, getCommission, calcMemberRawIncome, calcHorseRawIncome, calcPoolRawIncome, calcNetRatio, calcRoundedShares, calcRoundedExpected, calcRoundedSharesDelta } from '@/types';
import { formatCurrency, formatDate, getStatusColor } from '@/lib/utils';
import { Plus, Pencil, Trash2, X, Save, CreditCard, Check, Calculator, Image, Banknote, ClipboardList, Landmark, Receipt, Users, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useHydrated } from '@/lib/useHydrated';
import SlipUploader from '@/components/SlipUploader';
import { toast } from '@/components/Toast';
import { v4 as uuidv4 } from 'uuid';

type ProjectForm = Omit<Project, 'id' | 'createdAt' | 'activities' | 'installments'>;

function generateProjectCode(existingProjects: Project[]): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const todayProjects = existingProjects.filter((p) => p.projectCode?.startsWith(dateStr));
  const seq = String(todayProjects.length + 1).padStart(2, '0');
  return `${dateStr}${seq}`;
}

const emptyActivity = (): Omit<Activity, 'id'> => ({
  name: '', cost: 0, sharePercent: { tangmo: 0, frank: 0, ton: 0 }, horsePercent: HORSE_PERCENT, poolPercent: POOL_PERCENT, status: 'pending',
});

const emptyInstallment = (): Omit<PaymentInstallment, 'id'> => ({
  installmentNumber: 1, name: '', amount: 0, status: 'pending', paidDate: '',
});

// Default activities + installments แยกตามประเภทโครงการ
type DefaultActivity = { name: string; cost: number; sharePercent: { tangmo: number; frank: number; ton: number } };

const DEFAULT_ACTIVITIES_BY_TYPE: Record<ProjectType, DefaultActivity[]> = {
  doctor: [
    { name: 'Proposal', cost: 20000, sharePercent: { tangmo: 80, frank: 0, ton: 15 } },
    { name: 'Analysis', cost: 20000, sharePercent: { tangmo: 0, frank: 80, ton: 15 } },
    { name: 'Result', cost: 10000, sharePercent: { tangmo: 80, frank: 0, ton: 15 } },
    { name: 'Publication Support', cost: 15000, sharePercent: { tangmo: 55, frank: 20, ton: 20 } },
  ],
  student: [
    { name: 'Research question', cost: 5000, sharePercent: { tangmo: 65, frank: 20, ton: 10 } },
    { name: 'Planning (Rational, Background, Research Design, Data Collection, Design CRF)', cost: 10000, sharePercent: { tangmo: 65, frank: 20, ton: 10 } },
    { name: 'Result (Analysis, Discussion, Conclusion)', cost: 10000, sharePercent: { tangmo: 35, frank: 45, ton: 15 } },
  ],
  // Personal: งานส่วนตัว — เริ่มจากว่าง ผู้ใช้เพิ่มกิจกรรม/งวดเงินเอง
  personal: [],
};

function buildDefaultInstallments(type: ProjectType, acts: DefaultActivity[]): { num: number; name: string; amount: number }[] {
  const totalAll = acts.reduce((s, a) => s + a.cost, 0);
  if (type === 'personal') {
    // Personal: ไม่มี preset งวดเงิน — เพิ่มเองภายหลัง
    return [];
  }
  if (type === 'student') {
    // Student: 2 งวด งวดละ 50% ของยอดรวม
    return [
      { num: 1, name: 'งวดที่ 1 ส่ง draft มัดจำ 50%', amount: totalAll * 0.5 },
      { num: 2, name: 'งวดที่ 2 ส่งบทความฉบับสมบูรณ์', amount: totalAll * 0.5 },
    ];
  }
  // Doctor: เดิม — 3 งวด
  const totalPAR = acts.filter((a) => ['Proposal', 'Analysis', 'Result'].includes(a.name)).reduce((s, a) => s + a.cost, 0);
  const totalPub = acts.filter((a) => a.name === 'Publication Support').reduce((s, a) => s + a.cost, 0);
  return [
    { num: 1, name: 'งวดที่ 1 ส่ง draft มัดจำ 50%', amount: totalAll * 0.5 },
    { num: 2, name: 'งวดที่ 2 ส่งบทความฉบับสมบูรณ์', amount: totalPAR * 0.5 },
    { num: 3, name: 'งวดที่ 3 ส่ง Submit วารสาร', amount: totalPub * 0.5 },
  ];
}

// Memoized list row — re-render เฉพาะเมื่อ project/isSelected/paid เปลี่ยน
// เดิม: filter/search 1 ตัวอักษร → re-render ทุก tab (50+ buttons)
// ตอนนี้: มีเฉพาะ row ที่ selection state เปลี่ยน (2 rows) re-render
const statusDotClass = (status: string) =>
  status === 'completed' ? 'bg-green-500' : status === 'in_progress' ? 'bg-blue-500' : 'bg-yellow-500';

const STATUS_BADGE: Record<string, { dot: string; cls: string; label: string }> = {
  pending: { dot: 'bg-yellow-500', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200', label: 'รอดำเนินการ' },
  in_progress: { dot: 'bg-blue-500', cls: 'bg-blue-50 text-blue-700 border-blue-200', label: 'กำลังดำเนินการ' },
  completed: { dot: 'bg-green-500', cls: 'bg-green-50 text-green-700 border-green-200', label: 'เสร็จสิ้น' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] || STATUS_BADGE.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// Dropdown เลือกโครงการ — sticky ไว้ข้างบน, มี search ในตัว, ปิดเมื่อคลิกนอก/กด Esc
function ProjectDropdown({
  projects, selectedId, paidByProject, onSelect, onAdd,
}: {
  projects: Project[];
  selectedId: string | null;
  paidByProject: Record<string, number>;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const selected = projects.find((p) => p.id === selectedId) || null;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? projects.filter((p) => `${p.name} ${p.projectCode || ''} ${p.client || ''}`.toLowerCase().includes(q))
    : projects;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-left shadow-sm hover:border-gray-300 transition-colors"
      >
        {selected ? (
          <>
            <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass(selected.status)}`} />
            <span className="font-mono text-[11px] text-gray-400 shrink-0">{selected.projectCode}</span>
            <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-800">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-sm text-gray-400">เลือกโครงการ...</span>
        )}
        <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded-lg">
              <Search size={14} className="text-gray-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาโครงการ..."
                className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="เคลียร์คำค้นหา"
                  className="shrink-0 p-0.5 rounded text-red-500 hover:text-red-600 hover:bg-red-50"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[340px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-gray-400">ไม่พบโครงการ</p>
            ) : filtered.map((p) => {
              const acts = p.activities || [];
              const progress = acts.length > 0 ? Math.round(acts.filter((a) => a.status === 'completed').length / acts.length * 100) : 0;
              const totalInst = (p.installments || []).reduce((s, i) => s + i.amount, 0);
              const outstanding = totalInst - (paidByProject[p.id] || 0);
              const isSel = p.id === selectedId;
              return (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p.id); setOpen(false); setQuery(''); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left ${isSel ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 self-start ${statusDotClass(p.status)}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-[13px] font-medium text-gray-800">{p.name}</span>
                    <span className="block truncate text-[11px] text-gray-400">
                      <span className="font-mono">{p.projectCode}</span>
                      {p.client ? <span className="text-gray-500"> · {p.client}</span> : null}
                    </span>
                  </span>
                  {isSel ? (
                    <Check size={15} className="shrink-0 text-indigo-600" />
                  ) : outstanding > 0 ? (
                    <span className="shrink-0 text-[11px] font-semibold text-red-500">ค้าง ฿{outstanding.toLocaleString()}</span>
                  ) : (
                    <span className="shrink-0 text-[11px] font-medium tabular-nums text-gray-400">{progress}%</span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => { setOpen(false); onAdd(); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 text-indigo-600 hover:bg-indigo-50 text-sm font-medium"
          >
            <Plus size={15} /> เพิ่มโครงการ
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  const hydrated = useHydrated();
  const {
    projects, addProject, updateProject, deleteProject,
    addActivity, updateActivity, deleteActivity, moveActivity,
    addInstallment, updateInstallment, deleteInstallment,
    payments, addPayment, updatePayment, deletePayment,
    distributions, addDistribution, deleteDistribution,
    fetchSlipsFor, editMode,
  } = useStore();
  const [loadingSlipId, setLoadingSlipId] = useState<string | null>(null);

  const handleViewSlipRecord = async (kind: 'payment' | 'distribution', recordId: string, currentSlips: string[]) => {
    if (currentSlips.length > 0) {
      setViewSlips(currentSlips);
      setViewSlipIndex(0);
      return;
    }
    setLoadingSlipId(recordId);
    try {
      const slips = await fetchSlipsFor(kind, recordId);
      if (slips.length === 0) {
        toast.info('ไม่มี slip แนบไว้');
      } else {
        setViewSlips(slips);
        setViewSlipIndex(0);
      }
    } finally {
      setLoadingSlipId(null);
    }
  };

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [projects]
  );

  // ยอดรับเงินรวมต่อโครงการ — ใช้โชว์ "เงินค้าง" บนการ์ด
  const paidByProject = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of payments) m[p.projectId] = (m[p.projectId] || 0) + p.amount;
    return m;
  }, [payments]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>({ projectCode: '', name: '', client: '', budget: 0, startDate: '', endDate: '', status: 'pending', type: 'doctor', commission: 0, discount: 0 });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(sortedProjects[0]?.id || null);
  const [activeTab, setActiveTab] = useState<'activities' | 'installments' | 'payments' | 'distribution'>('activities');

  // ให้ selection ตามตัวกรองเสมอ — ถ้าโครงการที่เลือกถูกกรองออก (หรือยังไม่ได้เลือก)
  // ให้เด้งไปโครงการแรกที่มองเห็น เพื่อให้ตัวกรองด้านบนมีผลกับรายละเอียดที่โชว์
  useEffect(() => {
    if (sortedProjects.length === 0) return;
    if (!selectedProjectId || !sortedProjects.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(sortedProjects[0].id);
    }
  }, [selectedProjectId, sortedProjects]);

  // รับ ?id=<projectId> จาก query param → auto select project
  const searchParams = useSearchParams();
  useEffect(() => {
    const idFromUrl = searchParams.get('id');
    if (idFromUrl && sortedProjects.some((p) => p.id === idFromUrl)) {
      setSelectedProjectId(idFromUrl);
    }
  }, [searchParams, sortedProjects]);

  const [activityForm, setActivityForm] = useState(emptyActivity());
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [showActivityForm, setShowActivityForm] = useState<string | null>(null);

  const [installmentForm, setInstallmentForm] = useState(emptyInstallment());
  const [editingInstallmentId, setEditingInstallmentId] = useState<string | null>(null);
  const [showInstallmentForm, setShowInstallmentForm] = useState<string | null>(null);

  const [paymentForm, setPaymentForm] = useState<Omit<PaymentRecord, 'id' | 'createdAt'>>({ projectId: '', installmentId: '', amount: 0, paidDate: '', slipUrl: '', slipUrls: [], note: '' });
  const [showPaymentForm, setShowPaymentForm] = useState<string | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [viewSlipUrl, setViewSlipUrl] = useState<string | null>(null);
  // For viewing multiple slips with navigation
  const [viewSlips, setViewSlips] = useState<string[] | null>(null);
  const [viewSlipIndex, setViewSlipIndex] = useState(0);

  // Distribution form
  const [showDistForm, setShowDistForm] = useState<string | null>(null);
  const [distForm, setDistForm] = useState({ projectId: '', recipientId: '' as RecipientId | '', amount: 0, paidDate: new Date().toISOString().split('T')[0], slipUrl: '', slipUrls: [] as string[], note: '' });

  const handleSaveDistribution = (projectId: string) => {
    if (!distForm.recipientId) { toast.error('กรุณาเลือกผู้รับเงิน'); return; }
    if (!distForm.amount || distForm.amount <= 0) { toast.error('กรุณาระบุจำนวนเงิน'); return; }
    addDistribution({ ...distForm, projectId, recipientId: distForm.recipientId as RecipientId });
    setDistForm({ projectId: '', recipientId: '', amount: 0, paidDate: new Date().toISOString().split('T')[0], slipUrl: '', slipUrls: [], note: '' });
    setShowDistForm(null);
  };

  const openNewProjectForm = () => {
    setForm({ projectCode: generateProjectCode(projects), name: '', client: '', budget: 0, startDate: '', endDate: '', status: 'pending', type: 'doctor', commission: 0, discount: 0 });
    setEditingId(null);
    setShowForm(true);
  };

  const handleSaveProject = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      updateProject(editingId, form);
    } else {
      // Build full project (activities + installments) เพื่อ INSERT ครั้งเดียว
      // กัน race condition กับ Supabase UPDATE หลังจาก INSERT
      const defaultActs = DEFAULT_ACTIVITIES_BY_TYPE[form.type];
      const activities: Activity[] = defaultActs.map((act) => ({
        ...act,
        id: uuidv4(),
        horsePercent: HORSE_PERCENT,
        poolPercent: POOL_PERCENT,
        status: 'pending' as ProjectStatus,
      }));
      const defaultInstallments = buildDefaultInstallments(form.type, defaultActs);
      const installments: PaymentInstallment[] = defaultInstallments.map((inst) => ({
        id: uuidv4(),
        installmentNumber: inst.num,
        name: inst.name,
        amount: inst.amount,
        status: 'pending',
        paidDate: '',
      }));
      const projectId = addProject({ ...form, activities, installments });
      setSelectedProjectId(projectId);
      setActiveTab('activities');
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleEditProject = (project: Project) => {
    setForm({ projectCode: project.projectCode, name: project.name, client: project.client, budget: project.budget, startDate: project.startDate, endDate: project.endDate, status: project.status, type: project.type, commission: project.commission ?? 0, discount: project.discount ?? 0 });
    setEditingId(project.id);
    setShowForm(true);
  };

  const handleSaveActivity = (projectId: string) => {
    if (!activityForm.name.trim()) return;
    const totalShare = Object.values(activityForm.sharePercent).reduce((a, b) => a + b, 0);
    const horseP = activityForm.horsePercent ?? HORSE_PERCENT;
    const poolP = activityForm.poolPercent ?? POOL_PERCENT;
    if (totalShare + horseP + poolP > 100) {
      toast.error(`ส่วนแบ่งรวมเกิน 100% — ผู้ก่อตั้ง ${totalShare}% + Manager ${horseP}% + Pool ${poolP}% = ${totalShare + horseP + poolP}%`);
      return;
    }
    if (editingActivityId) updateActivity(projectId, editingActivityId, activityForm);
    else addActivity(projectId, activityForm);
    setActivityForm(emptyActivity()); setShowActivityForm(null); setEditingActivityId(null);
  };

  const handleEditActivity = (projectId: string, activity: Activity) => {
    setActivityForm({
      name: activity.name,
      cost: activity.cost,
      sharePercent: { ...activity.sharePercent },
      horsePercent: activity.horsePercent ?? HORSE_PERCENT,
      poolPercent: activity.poolPercent ?? POOL_PERCENT,
      status: activity.status,
    });
    setEditingActivityId(activity.id); setShowActivityForm(projectId);
  };

  const handleSaveInstallment = (projectId: string) => {
    if (!installmentForm.name.trim()) return;
    if (editingInstallmentId) updateInstallment(projectId, editingInstallmentId, installmentForm);
    else addInstallment(projectId, installmentForm);
    setInstallmentForm(emptyInstallment()); setShowInstallmentForm(null); setEditingInstallmentId(null);
  };

  const handleEditInstallment = (projectId: string, inst: PaymentInstallment) => {
    setInstallmentForm({ installmentNumber: inst.installmentNumber, name: inst.name, amount: inst.amount, status: inst.status, paidDate: inst.paidDate });
    setEditingInstallmentId(inst.id); setShowInstallmentForm(projectId);
  };

  const handleAutoFillInstallments = (project: Project) => {
    const acts = project.activities;
    const totalAll = acts.reduce((s, a) => s + a.cost, 0);
    const projectType: ProjectType = project.type || 'doctor';
    let autoAmounts: Record<number, { amount: number; label: string }>;
    if (projectType === 'student') {
      autoAmounts = {
        1: { amount: totalAll * 0.5, label: `งวดที่ 1: ค่าใช้จ่ายทั้งหมด × 50% = ${formatCurrency(totalAll * 0.5)}` },
        2: { amount: totalAll * 0.5, label: `งวดที่ 2: ค่าใช้จ่ายทั้งหมด × 50% = ${formatCurrency(totalAll * 0.5)}` },
      };
    } else {
      const totalPAR = acts.filter((a) => ['Proposal', 'Analysis', 'Result'].includes(a.name)).reduce((s, a) => s + a.cost, 0);
      const totalPub = acts.filter((a) => a.name === 'Publication Support').reduce((s, a) => s + a.cost, 0);
      autoAmounts = {
        1: { amount: totalAll * 0.5, label: `งวดที่ 1: ค่าใช้จ่ายทั้งหมด × 50% = ${formatCurrency(totalAll * 0.5)}` },
        2: { amount: totalPAR * 0.5, label: `งวดที่ 2: (Proposal+Analysis+Result) × 50% = ${formatCurrency(totalPAR * 0.5)}` },
        3: { amount: totalPub * 0.5, label: `งวดที่ 3: Publication Support × 50% = ${formatCurrency(totalPub * 0.5)}` },
      };
    }
    const installments = project.installments || [];
    const toUpdate = installments.filter((inst) => autoAmounts[inst.installmentNumber]);
    if (toUpdate.length === 0) { toast.warning('ไม่พบงวดที่ตรงกับสูตรอัตโนมัติ'); return; }
    const summary = toUpdate.map((inst) => autoAmounts[inst.installmentNumber].label).join('\n');
    if (!confirm(`คำนวณเงินงวดอัตโนมัติ (${PROJECT_TYPE_LABELS[projectType]}):\n\n${summary}\n\nต้องการดำเนินการ?`)) return;
    toUpdate.forEach((inst) => {
      updateInstallment(project.id, inst.id, { amount: autoAmounts[inst.installmentNumber].amount });
    });
  };

  // คำนวณยอดที่จ่ายแล้วของงวดเงิน
  const getInstallmentPaid = (installmentId: string, excludePaymentId?: string) => {
    return payments
      .filter((p) => p.installmentId === installmentId && p.id !== excludePaymentId)
      .reduce((s, p) => s + p.amount, 0);
  };

  // ตรวจว่างวดเงินชำระครบแล้วหรือยัง
  const isInstallmentFullyPaid = (inst: PaymentInstallment) => {
    if (inst.amount <= 0) return false;
    const totalPaid = getInstallmentPaid(inst.id);
    return totalPaid >= inst.amount;
  };

  // sync สถานะงวดเงินจากยอดโอนจริง
  const syncInstallmentStatus = (projectId: string, installmentId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    const inst = project.installments.find((i) => i.id === installmentId);
    if (!inst) return;
    const totalPaid = payments.filter((p) => p.installmentId === installmentId).reduce((s, p) => s + p.amount, 0);
    const shouldBePaid = inst.amount > 0 && totalPaid >= inst.amount;
    if (shouldBePaid && inst.status !== 'paid') {
      updateInstallment(projectId, installmentId, { status: 'paid', paidDate: new Date().toISOString().split('T')[0] });
    } else if (!shouldBePaid && inst.status === 'paid') {
      updateInstallment(projectId, installmentId, { status: 'pending', paidDate: '' });
    }
  };

  const handleSavePayment = (projectId: string) => {
    if (!paymentForm.installmentId) { toast.error('กรุณาเลือกงวดเงิน'); return; }
    if (!paymentForm.amount || paymentForm.amount <= 0) { toast.error('กรุณาระบุจำนวนเงิน'); return; }

    // ตรวจสอบว่าจ่ายเกินงวดหรือไม่
    const project = projects.find((p) => p.id === projectId);
    const inst = project?.installments.find((i) => i.id === paymentForm.installmentId);
    if (inst && inst.amount > 0) {
      const alreadyPaid = getInstallmentPaid(paymentForm.installmentId, editingPaymentId || undefined);
      const wouldTotal = alreadyPaid + paymentForm.amount;
      if (wouldTotal > inst.amount) {
        const remaining = inst.amount - alreadyPaid;
        toast.error(`จำนวนเงินเกินงวด — คงเหลือ ${formatCurrency(remaining)} (จาก ${formatCurrency(inst.amount)})`);
        return;
      }
    }

    if (editingPaymentId) {
      updatePayment(editingPaymentId, paymentForm);
    } else {
      addPayment({ ...paymentForm, projectId });
    }

    // sync สถานะงวดเงิน (ใช้ setTimeout เพื่อให้ state update ก่อน)
    const instId = paymentForm.installmentId;
    setTimeout(() => syncInstallmentStatus(projectId, instId), 100);

    setPaymentForm({ projectId: '', installmentId: '', amount: 0, paidDate: '', slipUrl: '', slipUrls: [], note: '' });
    setShowPaymentForm(null);
    setEditingPaymentId(null);
  };

  const handleEditPayment = (projectId: string, payment: PaymentRecord) => {
    // ถ้ายังเป็น slipUrl เก่า → migrate เป็น slipUrls array
    const slipUrls = (payment.slipUrls && payment.slipUrls.length > 0)
      ? payment.slipUrls
      : (payment.slipUrl ? [payment.slipUrl] : []);
    setPaymentForm({ projectId: payment.projectId, installmentId: payment.installmentId, amount: payment.amount, paidDate: payment.paidDate, slipUrl: payment.slipUrl, slipUrls, note: payment.note });
    setEditingPaymentId(payment.id);
    setShowPaymentForm(projectId);
  };

  const handleActivityStatusChange = (projectId: string, activityId: string, _activityName: string, newStatus: ProjectStatus) => {
    updateActivity(projectId, activityId, { status: newStatus });

    // คำนวณ project status จากกิจกรรมหลังเปลี่ยน (simulate ค่าใหม่เลย)
    const project = projects.find((p) => p.id === projectId);
    if (!project || project.activities.length === 0) return;
    const updatedActivities = project.activities.map((a) =>
      a.id === activityId ? { ...a, status: newStatus } : a
    );
    const allCompleted = updatedActivities.every((a) => a.status === 'completed');
    const anyStarted = updatedActivities.some((a) => a.status === 'in_progress' || a.status === 'completed');
    const projectStatus: ProjectStatus = allCompleted ? 'completed' : anyStarted ? 'in_progress' : 'pending';
    if (project.status !== projectStatus) {
      updateProject(projectId, { status: projectStatus });
    }
  };

  if (!hydrated) return <div className="flex items-center justify-center h-64 text-gray-400">กำลังโหลด...</div>;

  return (
    <div className="space-y-6">
      {/* Project Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-900">{editingId ? 'แก้ไขโครงการ' : 'เพิ่มโครงการใหม่'}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); }}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">รหัสโครงการ</label>
                  <input type="text" value={form.projectCode} onChange={(e) => setForm({ ...form, projectCode: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50 font-mono" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อโครงการ *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="ชื่อโครงการวิจัย" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ผู้วิจัย / ลูกค้า</label>
                <input type="text" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="ชื่อผู้วิจัย" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">งบประมาณรวม (บาท)</label>
                <input type="number" value={form.budget || ''} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="0" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันเริ่มต้น</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด</label>
                  <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
              </div>
              <div className={editingId ? 'grid grid-cols-2 gap-4' : ''}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ประเภท (Type)</label>
                  <select
                    value={form.type}
                    onChange={(e) => {
                      const newType = e.target.value as ProjectType;
                      const newCommission = editingId
                        ? form.commission
                        : (newType === 'student' ? STUDENT_DEFAULT_COMMISSION : 0);
                      setForm({ ...form, type: newType, commission: newCommission });
                    }}
                    disabled={!!editingId}
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none ${editingId ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
                  >
                    <option value="doctor">{PROJECT_TYPE_LABELS.doctor}</option>
                    <option value="student">{PROJECT_TYPE_LABELS.student}</option>
                    <option value="personal">{PROJECT_TYPE_LABELS.personal}</option>
                  </select>
                  {!editingId && (
                    <p className="text-xs text-gray-400 mt-1">
                      {form.type === 'student'
                        ? `Student: 3 กิจกรรม + 2 งวด งวดละ 50% + Commission ฿${STUDENT_DEFAULT_COMMISSION.toLocaleString()}`
                        : form.type === 'personal'
                        ? 'Personal: งานส่วนตัว — เริ่มจากว่าง เพิ่มกิจกรรม/งวดเงินเอง'
                        : 'Doctor: 4 กิจกรรม + 3 งวด (มัดจำ/บทความ/Submit)'}
                    </p>
                  )}
                </div>
                {/* Status — แสดงเฉพาะตอนแก้ไข (โครงการใหม่ใช้ pending เริ่มต้น) */}
                {editingId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="pending">รอดำเนินการ</option>
                      <option value="in_progress">กำลังดำเนินการ</option>
                      <option value="completed">เสร็จสิ้น</option>
                    </select>
                  </div>
                )}
              </div>
              {/* Commission — แสดงเฉพาะ Student หรือกรณี edit ที่ commission > 0 */}
              {(form.type === 'student' || (editingId && (form.commission ?? 0) > 0)) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Commission (บาท)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.commission || ''}
                    onChange={(e) => setForm({ ...form, commission: Number(e.target.value) || 0 })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-400 mt-1">หักรายโครงการ (one-time) — จ่ายให้ผู้รับ &quot;Commission&quot; ในหน้าโอนตัง</p>
                </div>
              )}
              {/* Discount (%) — ส่วนลดของโครงการ ใช้ต่อในใบเสนอราคา */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ส่วนลด (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.discount || ''}
                  onChange={(e) => setForm({ ...form, discount: Number(e.target.value) || 0 })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="0"
                />
                <p className="text-xs text-gray-400 mt-1">ส่วนลดเป็น % ของยอดรวม — ดึงไปใส่ในใบเสนอราคาอัตโนมัติ</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t">
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 text-sm text-gray-600">ยกเลิก</button>
              <button onClick={handleSaveProject} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"><Save size={16} /> บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* Project selector (dropdown) + detail */}
      {sortedProjects.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 mb-2">ยังไม่มีโครงการ</p>
          <p className="text-gray-400 text-sm">กดปุ่ม &quot;เพิ่มโครงการ&quot; เพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div>
          {/* Sticky dropdown bar — เกาะใต้ header เวลา scroll */}
          <div
            className="sticky z-20 -mx-4 lg:-mx-8 px-4 lg:px-8 py-2.5 bg-white/85 backdrop-blur border-b border-gray-100"
            style={{ top: 'var(--top-bar-h, 0px)' }}
          >
            <ProjectDropdown
              projects={sortedProjects}
              selectedId={selectedProjectId}
              paidByProject={paidByProject}
              onSelect={setSelectedProjectId}
              onAdd={openNewProjectForm}
            />
          </div>

          {/* Selected project detail */}
          {selectedProjectId && (
          <div className="mt-4 min-w-0">
          {(() => {
            const project = sortedProjects.find(p => p.id === selectedProjectId);
            if (!project) return null;
            const totalCost = project.activities.reduce((s, a) => s + a.cost, 0);
            const progress = project.activities.length > 0 ? Math.round(project.activities.filter((a) => a.status === 'completed').length / project.activities.length * 100) : 0;
            const installments = project.installments || [];
            const paidAmount = payments.filter((p) => p.projectId === project.id).reduce((s, p) => s + p.amount, 0);
            const totalInstallments = installments.reduce((s, i) => s + i.amount, 0);

            const panelBorder = project.status === 'completed' ? 'border-green-400' : project.status === 'in_progress' ? 'border-blue-400' : 'border-yellow-400';

            return (
              <div className={`bg-white rounded-xl border shadow-sm ${panelBorder}`}>
                {/* Project Header */}
                <div className="p-5 border-b">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {project.projectCode && <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">{project.projectCode}</span>}
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${PROJECT_TYPE_COLORS[project.type].bg} ${PROJECT_TYPE_COLORS[project.type].text} ${PROJECT_TYPE_COLORS[project.type].border}`}>{PROJECT_TYPE_LABELS[project.type]}</span>
                        <StatusBadge status={project.status} />
                      </div>
                      <h3 className="font-semibold text-gray-900 leading-snug">{project.name}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">{project.client || 'ไม่ระบุผู้วิจัย'}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>งบ: {formatCurrency(project.budget)}</span>
                        <span>ค่าใช้จ่าย: {formatCurrency(totalCost)}</span>
                        <span>รับแล้ว: {formatCurrency(paidAmount)}/{formatCurrency(totalInstallments)}</span>
                        {editMode ? (
                          <span className="inline-flex items-center gap-1 text-rose-600">
                            ส่วนลด:
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={project.discount || ''}
                              onChange={(e) => updateProject(project.id, { discount: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                              className="w-14 border border-rose-200 rounded px-1.5 py-0.5 text-xs text-right outline-none focus:ring-1 focus:ring-rose-400"
                              placeholder="0"
                            />
                            %
                            {(project.discount ?? 0) > 0 && <span className="text-rose-400">(สุทธิ {formatCurrency(totalCost * (1 - (project.discount ?? 0) / 100))})</span>}
                          </span>
                        ) : (project.discount ?? 0) > 0 ? (
                          <span className="text-rose-600">ส่วนลด: {project.discount}% (สุทธิ {formatCurrency(totalCost * (1 - (project.discount ?? 0) / 100))})</span>
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5"><div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${progress}%` }} /></div>
                        <span className="text-xs text-gray-500">{progress}%</span>
                      </div>
                    </div>
                    {editMode && (
                    <div className="flex items-center gap-1 ml-4 shrink-0">
                      <button onClick={() => handleEditProject(project)} title="แก้ไขโครงการ" className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"><Pencil size={15} /></button>
                      <button onClick={() => { if (confirm('ต้องการลบโครงการนี้?')) { const otherId = sortedProjects.find(p => p.id !== project.id)?.id || null; deleteProject(project.id); setSelectedProjectId(otherId); } }} title="ลบโครงการ" className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50"><Trash2 size={15} /></button>
                    </div>
                    )}
                  </div>
                </div>

                {/* Sub-tabs section */}
                <div className="bg-gray-50/50">
                  <div className="flex border-b border-gray-200 overflow-x-auto">
                    {([
                      { key: 'activities' as const, icon: ClipboardList, label: 'กิจกรรม', count: project.activities.length },
                      { key: 'installments' as const, icon: Landmark, label: 'งวดเงิน', count: installments.length },
                      { key: 'payments' as const, icon: Receipt, label: 'การชำระเงิน', count: payments.filter((p) => p.projectId === project.id).length },
                      { key: 'distribution' as const, icon: Users, label: 'โอนเงินให้สมาชิก', count: distributions.filter((d) => d.projectId === project.id).length },
                    ]).map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap ${activeTab === tab.key ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                      >
                        <tab.icon size={15} />
                        {tab.label}
                        {tab.count > 0 && (
                          <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${activeTab === tab.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>{tab.count}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Activities Tab */}
                  {activeTab === 'activities' && (
                      <div className="p-5">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs text-gray-500">* หักManager + Pool money (ปรับ % รายกิจกรรมได้)</p>
                          {editMode && (
                          <button onClick={() => {
                            // Smart default: ใช้ sharePercent + horsePercent + poolPercent ของกิจกรรมล่าสุดในโครงการ
                            // (ถ้าไม่มีกิจกรรม fallback เป็น 0 ทั้งหมด)
                            const lastAct = project.activities[project.activities.length - 1];
                            const defaults: typeof activityForm = lastAct
                              ? { name: '', cost: 0, sharePercent: { ...lastAct.sharePercent }, horsePercent: getHorsePercent(lastAct), poolPercent: getPoolPercent(lastAct), status: 'pending' }
                              : emptyActivity();
                            setShowActivityForm(project.id);
                            setActivityForm(defaults);
                            setEditingActivityId(null);
                          }} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus size={14} /> เพิ่มกิจกรรม</button>
                          )}
                        </div>

                        {showActivityForm === project.id && (
                          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-pink-50 rounded-t-xl">
                                <div className="flex items-center gap-2">
                                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow">
                                    <ClipboardList size={18} className="text-white" />
                                  </div>
                                  <h2 className="font-semibold text-gray-900">{editingActivityId ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรมใหม่'}</h2>
                                </div>
                                <button onClick={() => { setShowActivityForm(null); setEditingActivityId(null); }} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-white/60">
                                  <X size={18} />
                                </button>
                              </div>
                              <div className="p-5 space-y-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อกิจกรรม *</label>
                                  <div className="flex gap-2">
                                    <select
                                      value={STANDARD_ACTIVITIES.includes(activityForm.name as typeof STANDARD_ACTIVITIES[number]) ? activityForm.name : '__custom__'}
                                      onChange={(e) => { if (e.target.value !== '__custom__') setActivityForm({ ...activityForm, name: e.target.value }); }}
                                      title="เลือกจาก template หรือพิมพ์เองในช่องข้าง ๆ"
                                      className="w-32 shrink-0 border rounded-lg px-2 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                      {STANDARD_ACTIVITIES.map((act) => <option key={act} value={act}>{act}</option>)}
                                      <option value="__custom__">อื่นๆ / พิมพ์เอง</option>
                                    </select>
                                    <input type="text" value={activityForm.name} onChange={(e) => setActivityForm({ ...activityForm, name: e.target.value })} className="flex-1 min-w-0 border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500" placeholder="พิมพ์ชื่อกิจกรรม..." />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">ค่าบริการ (บาท)</label>
                                  <input type="number" value={activityForm.cost || ''} onChange={(e) => setActivityForm({ ...activityForm, cost: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500" placeholder="0" />
                                </div>
                                <div>
                                  {(() => {
                                    const founderTotal = Object.values(activityForm.sharePercent).reduce((a, b) => a + b, 0);
                                    const horseP = activityForm.horsePercent ?? HORSE_PERCENT;
                                    const poolP = activityForm.poolPercent ?? POOL_PERCENT;
                                    const grandTotal = founderTotal + horseP + poolP;
                                    return (
                                      <label className="block text-sm font-medium text-gray-700 mb-2">
                                        ส่วนแบ่งทั้งหมด — ผู้ก่อตั้ง <strong>{founderTotal}%</strong> + Manager <strong>{horseP}%</strong> + Pool money <strong>{poolP}%</strong> = <strong className={grandTotal > 100 ? 'text-red-600' : grandTotal === 100 ? 'text-green-600' : ''}>{grandTotal}%</strong>
                                      </label>
                                    );
                                  })()}
                                  <div className="grid grid-cols-3 gap-3 mb-3">
                                    {MEMBERS.map((member) => (
                                      <div key={member.id}>
                                        <label className="block text-xs text-gray-600 mb-1 font-medium">{member.name}</label>
                                        <input type="number" min={0} max={100} step="0.1" value={activityForm.sharePercent[member.id] || ''} onChange={(e) => setActivityForm({ ...activityForm, sharePercent: { ...activityForm.sharePercent, [member.id]: Number(e.target.value) } })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500" placeholder="0" />
                                      </div>
                                    ))}
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-xs text-gray-600 mb-1 font-medium">Manager (%)</label>
                                      <input type="number" min={0} max={100} step="0.1" value={activityForm.horsePercent ?? HORSE_PERCENT} onChange={(e) => setActivityForm({ ...activityForm, horsePercent: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-amber-50" placeholder="2.5" />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-gray-600 mb-1 font-medium">Pool money (%)</label>
                                      <input type="number" min={0} max={100} step="0.1" value={activityForm.poolPercent ?? POOL_PERCENT} onChange={(e) => setActivityForm({ ...activityForm, poolPercent: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500 bg-gray-50" placeholder="2.5" />
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
                                <button onClick={() => { setShowActivityForm(null); setEditingActivityId(null); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">ยกเลิก</button>
                                <button onClick={() => handleSaveActivity(project.id)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg text-sm font-medium hover:from-purple-700 hover:to-pink-700 shadow">
                                  <Save size={16} /> บันทึก
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {project.activities.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs text-gray-500 border-b">
                                  <th className="pb-2 font-medium">กิจกรรม</th>
                                  <th className="pb-2 font-medium text-right">ค่าบริการ</th>
                                  {MEMBERS.map((m) => <th key={m.id} className="pb-2 font-medium text-center">{m.name}</th>)}
                                  <th className="pb-2 font-medium text-center">Manager</th>
                                  <th className="pb-2 font-medium text-center">Pool money</th>
                                  <th className="pb-2 font-medium text-center">สถานะ</th>
                                  <th className="pb-2 font-medium text-right">จัดการ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {project.activities.map((activity, idx) => (
                                  <tr key={activity.id} className="border-b border-gray-100 last:border-0">
                                    <td className="py-2.5 text-gray-700">{activity.name}</td>
                                    <td className="py-2.5 text-right text-gray-700">{formatCurrency(activity.cost)}</td>
                                    {MEMBERS.map((m) => (
                                      <td key={m.id} className="py-2.5 text-center">
                                        <span className="text-gray-600">{activity.sharePercent[m.id] || 0}%</span><br />
                                        <span className="text-xs text-gray-400">{formatCurrency((activity.cost * (activity.sharePercent[m.id] || 0)) / 100)}</span>
                                      </td>
                                    ))}
                                    <td className="py-2.5 text-center">
                                      <span className="text-gray-600">{getHorsePercent(activity)}%</span><br />
                                      <span className="text-xs text-gray-400">{formatCurrency((activity.cost * getHorsePercent(activity)) / 100)}</span>
                                    </td>
                                    <td className="py-2.5 text-center">
                                      <span className="text-gray-600">{getPoolPercent(activity)}%</span><br />
                                      <span className="text-xs text-gray-400">{formatCurrency((activity.cost * getPoolPercent(activity)) / 100)}</span>
                                    </td>
                                    <td className="py-2.5 text-center">
                                      <select
                                        value={activity.status}
                                        onChange={(e) => handleActivityStatusChange(project.id, activity.id, activity.name, e.target.value as ProjectStatus)}
                                        className={`text-xs rounded px-2 py-1 outline-none cursor-pointer border-0 ${getStatusColor(activity.status)}`}
                                      >
                                        <option value="pending">รอดำเนินการ</option>
                                        <option value="in_progress">กำลังดำเนินการ</option>
                                        <option value="completed">เสร็จสิ้น</option>
                                      </select>
                                    </td>
                                    <td className="py-2.5 text-right">
                                      {editMode ? (
                                        <div className="flex items-center justify-end gap-0.5">
                                          <button onClick={() => moveActivity(project.id, activity.id, 'up')} disabled={idx === 0} title="เลื่อนขึ้น" className="p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-400"><ChevronUp size={14} /></button>
                                          <button onClick={() => moveActivity(project.id, activity.id, 'down')} disabled={idx === project.activities.length - 1} title="เลื่อนลง" className="p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-gray-400"><ChevronDown size={14} /></button>
                                          <button onClick={() => handleEditActivity(project.id, activity)} title="แก้ไข" className="p-1 text-gray-400 hover:text-gray-600"><Pencil size={13} /></button>
                                          <button onClick={() => { if (confirm('ลบกิจกรรมนี้?')) deleteActivity(project.id, activity.id); }} title="ลบ" className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                                        </div>
                                      ) : (
                                        <span className="text-gray-300">—</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                                <tr className="font-medium text-gray-900 bg-gray-50">
                                  <td className="py-2.5">รวม</td>
                                  <td className="py-2.5 text-right">{formatCurrency(totalCost)}</td>
                                  {MEMBERS.map((m) => <td key={m.id} className="py-2.5 text-center text-xs">{formatCurrency(calcMemberRawIncome(project, m.id))}</td>)}
                                  <td className="py-2.5 text-center text-xs">{formatCurrency(calcHorseRawIncome(project))}</td>
                                  <td className="py-2.5 text-center text-xs">{formatCurrency(calcPoolRawIncome(project))}</td>
                                  <td /><td />
                                </tr>
                                {getCommission(project) > 0 && (() => {
                                  // ใช้ rounded shares — Coordinator ดูดเศษ
                                  const roundedExpected = calcRoundedExpected(project);
                                  return (
                                    <>
                                      <tr className="text-rose-700 bg-rose-50">
                                        <td className="py-2 text-xs">
                                          <span className="font-medium">หัก Commission</span>
                                          <span className="ml-1 text-rose-400">(จากสมาชิก 3 คน — Manager+Pool ไม่โดน)</span>
                                        </td>
                                        <td className="py-2 text-right text-xs">−{formatCurrency(getCommission(project))}</td>
                                        {MEMBERS.map((m) => {
                                          const deduction = calcMemberRawIncome(project, m.id) - roundedExpected.members[m.id];
                                          return <td key={m.id} className="py-2 text-center text-xs">−{formatCurrency(deduction)}</td>;
                                        })}
                                        <td className="py-2 text-center text-xs text-gray-400">−฿0</td>
                                        <td className="py-2 text-center text-xs text-gray-400">−฿0</td>
                                        <td /><td />
                                      </tr>
                                      <tr className="font-semibold text-gray-900 bg-indigo-50 border-t-2 border-indigo-200">
                                        <td className="py-2.5">รวมสุทธิ (หลังหัก commission)</td>
                                        <td className="py-2.5 text-right">{formatCurrency(totalCost - getCommission(project))}</td>
                                        {MEMBERS.map((m) => <td key={m.id} className="py-2.5 text-center text-xs">{formatCurrency(roundedExpected.members[m.id])}</td>)}
                                        <td className="py-2.5 text-center text-xs">{formatCurrency(roundedExpected.horse)}</td>
                                        <td className="py-2.5 text-center text-xs">{formatCurrency(roundedExpected.pool)}</td>
                                        <td /><td />
                                      </tr>
                                    </>
                                  );
                                })()}
                              </tbody>
                            </table>
                            {getCommission(project) > 0 && (
                              <div className="mt-3 flex items-center justify-between bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="font-medium text-rose-700">{ALL_SHARE_NAMES.commission}</span>
                                  <span className="text-xs text-rose-500">(หัก {Math.round((1 - calcNetRatio(project)) * 100 * 100) / 100}% จากสมาชิก 3 คนหลัก — Manager + Pool ไม่โดน)</span>
                                </div>
                                <span className="font-medium text-rose-700">{formatCurrency(getCommission(project))}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีกิจกรรม</p>
                        )}
                      </div>
                    )}

                    {/* Installments Tab */}
                    {activeTab === 'installments' && (
                      <div className="p-5">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs text-gray-500">จัดการงวดการชำระเงินของโครงการ</p>
                          <div className="flex gap-2">
                            {editMode && <button onClick={() => handleAutoFillInstallments(project)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600" title="คำนวณจำนวนเงินงวด 1-3 อัตโนมัติจากกิจกรรม"><Calculator size={14} /> คำนวณอัตโนมัติ</button>}
                            {editMode && <button onClick={() => { const nextNum = installments.length > 0 ? Math.max(...installments.map((i) => i.installmentNumber || 0)) + 1 : 1; setShowInstallmentForm(project.id); setInstallmentForm({ ...emptyInstallment(), installmentNumber: nextNum }); setEditingInstallmentId(null); }} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus size={14} /> เพิ่มงวดเงิน</button>}
                          </div>
                        </div>

                        {showInstallmentForm === project.id && (
                          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-xl">
                                <div className="flex items-center gap-2">
                                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow">
                                    <Landmark size={18} className="text-white" />
                                  </div>
                                  <h2 className="font-semibold text-gray-900">{editingInstallmentId ? 'แก้ไขงวดเงิน' : 'เพิ่มงวดเงินใหม่'}</h2>
                                </div>
                                <button onClick={() => { setShowInstallmentForm(null); setEditingInstallmentId(null); }} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-white/60">
                                  <X size={18} />
                                </button>
                              </div>
                              <div className="p-5 space-y-4">
                                <div className="grid grid-cols-4 gap-3">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">งวดที่</label>
                                    <input type="number" min={1} value={installmentForm.installmentNumber} onChange={(e) => setInstallmentForm({ ...installmentForm, installmentNumber: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                                  </div>
                                  <div className="col-span-3">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">ชื่องวด *</label>
                                    <input type="text" value={installmentForm.name} onChange={(e) => setInstallmentForm({ ...installmentForm, name: e.target.value })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="เช่น งวดที่ 1 ส่ง Draft" />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท)</label>
                                  <input type="number" value={installmentForm.amount || ''} onChange={(e) => setInstallmentForm({ ...installmentForm, amount: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                                </div>
                                <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                                  💡 สถานะและวันที่โอนจะ sync อัตโนมัติเมื่อบันทึก &quot;รายการชำระเงิน&quot; ในแท็บ &quot;รับเงิน&quot;
                                </div>
                              </div>
                              <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
                                <button onClick={() => { setShowInstallmentForm(null); setEditingInstallmentId(null); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">ยกเลิก</button>
                                <button onClick={() => handleSaveInstallment(project.id)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-indigo-700 hover:to-purple-700 shadow">
                                  <Save size={16} /> บันทึก
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {installments.length > 0 ? (
                          (() => {
                            const projectPaymentsAll = payments.filter((p) => p.projectId === project.id);
                            const totalPaidReal = projectPaymentsAll.reduce((s, p) => s + p.amount, 0);
                            return (
                              <div className="space-y-2">
                                {[...installments].sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0)).map((inst) => {
                                  const instPaid = projectPaymentsAll.filter((p) => p.installmentId === inst.id).reduce((s, p) => s + p.amount, 0);
                                  const instRemaining = inst.amount - instPaid;
                                  const instFullyPaid = inst.amount > 0 && instPaid >= inst.amount;
                                  const paidPercent = inst.amount > 0 ? Math.min(100, Math.round((instPaid / inst.amount) * 100)) : 0;
                                  return (
                                    <div key={inst.id} className={`rounded-lg border p-3 ${instFullyPaid ? 'bg-green-50 border-green-200' : 'bg-white'}`}>
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${instFullyPaid ? 'bg-green-200 text-green-700' : instPaid > 0 ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                                            {instFullyPaid ? <Check size={14} /> : inst.installmentNumber || '#'}
                                          </div>
                                          <div>
                                            <p className="text-sm font-medium text-gray-700">{inst.name}</p>
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                              {inst.paidDate && <span>โอนเมื่อ: {formatDate(inst.paidDate)}</span>}
                                              {instPaid > 0 && !instFullyPaid && <span className="text-blue-600">โอนแล้ว {formatCurrency(instPaid)} / คงเหลือ {formatCurrency(instRemaining)}</span>}
                                              {instFullyPaid && <span className="text-green-600 font-medium">ชำระครบแล้ว</span>}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <div className="text-right">
                                            <p className="text-sm font-bold text-gray-700">{formatCurrency(inst.amount)}</p>
                                            <span className={`text-xs px-2 py-0.5 rounded ${instFullyPaid ? 'bg-green-100 text-green-700' : instPaid > 0 ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                              {instFullyPaid ? '✅ ชำระครบ' : instPaid > 0 ? `โอนแล้ว ${paidPercent}%` : 'รอชำระ'}
                                            </span>
                                          </div>
                                          {editMode && (
                                          <div className="flex gap-1">
                                            <button onClick={() => handleEditInstallment(project.id, inst)} className="p-1 text-gray-400 hover:text-gray-600"><Pencil size={13} /></button>
                                            <button onClick={() => { if (confirm('ลบงวดเงินนี้?')) deleteInstallment(project.id, inst.id); }} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                                          </div>
                                          )}
                                        </div>
                                      </div>
                                      {/* Progress bar */}
                                      {inst.amount > 0 && (
                                        <div className="mt-2 flex items-center gap-2">
                                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                            <div className={`h-1.5 rounded-full ${instFullyPaid ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${paidPercent}%` }} />
                                          </div>
                                          <span className="text-xs text-gray-500">{formatCurrency(instPaid)}/{formatCurrency(inst.amount)}</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                <div className="flex justify-between p-3 bg-indigo-50 rounded-lg text-sm font-medium">
                                  <span>รวมทั้งหมด: {formatCurrency(totalInstallments)}</span>
                                  <span className="text-green-600">โอนแล้ว: {formatCurrency(totalPaidReal)}</span>
                                  <span className={totalPaidReal >= totalInstallments && totalInstallments > 0 ? 'text-green-600' : 'text-yellow-600'}>
                                    {totalPaidReal >= totalInstallments && totalInstallments > 0 ? '✅ ชำระครบทุกงวด' : `คงค้าง: ${formatCurrency(totalInstallments - totalPaidReal)}`}
                                  </span>
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีงวดเงิน</p>
                        )}
                      </div>
                    )}

                    {/* Payments Tab */}
                    {activeTab === 'payments' && (
                      <div className="p-5">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs text-gray-500">บันทึกการชำระเงินของโครงการนี้</p>
                          <button onClick={() => { setShowPaymentForm(project.id); setPaymentForm({ projectId: project.id, installmentId: '', amount: 0, paidDate: new Date().toISOString().split('T')[0], slipUrl: '', slipUrls: [], note: '' }); setEditingPaymentId(null); }} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus size={14} /> เพิ่มรายการโอน</button>
                        </div>

                        {showPaymentForm === project.id && (
                          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-t-xl">
                                <div className="flex items-center gap-2">
                                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow">
                                    <Banknote size={18} className="text-white" />
                                  </div>
                                  <h2 className="font-semibold text-gray-900">{editingPaymentId ? 'แก้ไขรายการชำระเงิน' : 'เพิ่มรายการชำระเงิน'}</h2>
                                </div>
                                <button onClick={() => { setShowPaymentForm(null); setEditingPaymentId(null); }} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-white/60">
                                  <X size={18} />
                                </button>
                              </div>
                              <div className="p-5 space-y-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">งวดเงิน *</label>
                                  <select
                                    value={paymentForm.installmentId}
                                    onChange={(e) => {
                                      const newInstId = e.target.value;
                                      // Prefill จำนวนเงิน = ยอดคงเหลือของงวดนี้
                                      let prefillAmount = paymentForm.amount;
                                      if (newInstId && !editingPaymentId) {
                                        const inst = installments.find((i) => i.id === newInstId);
                                        if (inst) {
                                          const paidSoFar = getInstallmentPaid(newInstId);
                                          prefillAmount = Math.max(0, inst.amount - paidSoFar);
                                        }
                                      }
                                      setPaymentForm({ ...paymentForm, installmentId: newInstId, amount: prefillAmount });
                                    }}
                                    className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                  >
                                    <option value="">-- เลือกงวดเงิน --</option>
                                    {installments.sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0)).map((inst) => {
                                      const fullyPaid = isInstallmentFullyPaid(inst);
                                      const paidSoFar = getInstallmentPaid(inst.id, editingPaymentId || undefined);
                                      const remaining = inst.amount - paidSoFar;
                                      const isCurrentEdit = editingPaymentId && paymentForm.installmentId === inst.id;
                                      const statusIcon = fullyPaid ? '✅' : paidSoFar > 0 ? '🔵' : '⏳';
                                      const amountText = fullyPaid
                                        ? `${formatCurrency(inst.amount)} ครบ`
                                        : paidSoFar > 0
                                          ? `คงเหลือ ${formatCurrency(remaining)}/${formatCurrency(inst.amount)}`
                                          : formatCurrency(inst.amount);
                                      return (
                                        <option key={inst.id} value={inst.id} disabled={fullyPaid && !isCurrentEdit}>
                                          {statusIcon} งวด {inst.installmentNumber} — {amountText}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  {paymentForm.installmentId && (() => {
                                    const inst = installments.find((i) => i.id === paymentForm.installmentId);
                                    return inst ? <p className="text-xs text-gray-500 mt-1">{inst.name}</p> : null;
                                  })()}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท) *</label>
                                    <input type="number" value={paymentForm.amount || ''} onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">วันที่โอน</label>
                                    <input type="date" value={paymentForm.paidDate} onChange={(e) => setPaymentForm({ ...paymentForm, paidDate: e.target.value })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">อัพโหลด Slip</label>
                                  <SlipUploader
                                    values={paymentForm.slipUrls || []}
                                    onChange={(urls) => setPaymentForm({ ...paymentForm, slipUrls: urls, slipUrl: urls[0] || '' })}
                                    onPreview={(url) => setViewSlipUrl(url)}
                                    color="indigo"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
                                  <input type="text" value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="หมายเหตุเพิ่มเติม..." />
                                </div>
                              </div>
                              <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
                                <button onClick={() => { setShowPaymentForm(null); setEditingPaymentId(null); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">ยกเลิก</button>
                                <button onClick={() => handleSavePayment(project.id)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-lg text-sm font-medium hover:from-indigo-700 hover:to-blue-700 shadow">
                                  <Save size={16} /> บันทึก
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {(() => {
                          const projectPayments = payments.filter((p) => p.projectId === project.id).sort((a, b) => new Date(b.paidDate || b.createdAt).getTime() - new Date(a.paidDate || a.createdAt).getTime());
                          const totalPaid = projectPayments.reduce((s, p) => s + p.amount, 0);
                          return projectPayments.length > 0 ? (
                            <div className="space-y-2">
                              {projectPayments.map((payment) => {
                                const inst = installments.find((i) => i.id === payment.installmentId);
                                return (
                                  <div key={payment.id} className="flex items-center justify-between bg-white rounded-lg border p-3">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                                        <Banknote size={16} />
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-gray-700">{inst ? `งวดที่ ${inst.installmentNumber}: ${inst.name}` : 'ไม่ระบุงวด'}</p>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                          {payment.paidDate && <span>{formatDate(payment.paidDate)}</span>}
                                          {payment.note && <span>- {payment.note}</span>}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="text-right">
                                        <p className="text-sm font-bold text-green-600">{formatCurrency(payment.amount)}</p>
                                      </div>
                                      {recordHasSlip(payment) && (() => {
                                        const slips = getSlips(payment);
                                        const isLoading = loadingSlipId === payment.id;
                                        return (
                                          <button
                                            onClick={() => handleViewSlipRecord('payment', payment.id, slips)}
                                            disabled={isLoading}
                                            className="relative p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-50"
                                            title={isLoading ? 'กำลังโหลด slip...' : `ดู Slip${slips.length > 0 ? ` (${slips.length} รูป)` : ''}`}
                                          >
                                            <Image size={16} />
                                            {slips.length > 1 && (
                                              <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">{slips.length}</span>
                                            )}
                                          </button>
                                        );
                                      })()}
                                      {editMode && (
                                      <div className="flex gap-1">
                                        <button onClick={() => handleEditPayment(project.id, payment)} className="p-1 text-gray-400 hover:text-gray-600"><Pencil size={13} /></button>
                                        <button onClick={() => { if (confirm('ลบรายการโอนนี้?')) { deletePayment(payment.id); setTimeout(() => syncInstallmentStatus(project.id, payment.installmentId), 100); } }} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                                      </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                              <div className="flex justify-between p-3 bg-indigo-50 rounded-lg text-sm font-medium">
                                <span>โอนแล้วทั้งหมด: {formatCurrency(totalPaid)}</span>
                                <span>งวดเงินรวม: {formatCurrency(totalInstallments)}</span>
                                <span className={totalPaid >= totalInstallments ? 'text-green-600' : 'text-yellow-600'}>
                                  {totalPaid >= totalInstallments ? 'ครบแล้ว' : `คงค้าง: ${formatCurrency(totalInstallments - totalPaid)}`}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีรายการชำระเงิน</p>
                          );
                        })()}
                      </div>
                    )}

                    {/* Distribution Tab — แบ่งเงิน */}
                    {activeTab === 'distribution' && (
                      <div className="p-5">
                        <div className="mb-4">
                          <h4 className="text-sm font-semibold text-gray-700 mb-1">สรุปการแบ่งเงินโครงการ</h4>
                          <p className="text-xs text-gray-500">คำนวณจากค่าบริการกิจกรรม × % ส่วนแบ่งที่กำหนด (Manager + Pool money ปรับ % รายกิจกรรมได้)</p>
                        </div>

                        {project.activities.length > 0 ? (
                          (() => {
                            const projectPaymentsAll = payments.filter((p) => p.projectId === project.id);
                            const totalPaidReal = projectPaymentsAll.reduce((s, p) => s + p.amount, 0);
                            const commissionAmount = getCommission(project);

                            // ใช้ rounded shares — ทุกยอดเป็นจำนวนเต็มบาท, Coordinator (ton) ดูดเศษ
                            const roundedExpected = calcRoundedExpected(project); // ยอดรวมเมื่อจ่ายครบ
                            const roundedNow = calcRoundedShares(project, totalPaidReal); // ที่ควรโอนตอนนี้

                            // memberShares สำหรับใช้ในตาราง breakdown
                            const memberShares = MEMBERS.map((m) => {
                              const byActivity = project.activities.map((a) => ({
                                activityName: a.name,
                                percent: a.sharePercent[m.id] || 0,
                                amount: (a.cost * (a.sharePercent[m.id] || 0)) / 100,
                              }));
                              const rawTotal = byActivity.reduce((s, a) => s + a.amount, 0);
                              // total = NET ทั้งโครงการ (rounded, ton ดูดเศษ)
                              const total = roundedExpected.members[m.id];
                              // shouldPayNow = ที่ต้องโอนตอนนี้ (rounded)
                              const shouldPayNow = roundedNow.members[m.id];
                              return { ...m, byActivity, total, rawTotal, shouldPayNow };
                            });

                            const horseRawTotal = calcHorseRawIncome(project);
                            const poolRawTotal = calcPoolRawIncome(project);
                            // Manager + Pool ไม่โดน commission → total = raw (rounded)
                            const horseTotal = roundedExpected.horse;
                            const poolTotal = roundedExpected.pool;
                            const horseShouldPayNow = roundedNow.horse;
                            const poolShouldPayNow = roundedNow.pool;
                            const commissionShouldPay = roundedNow.commission;

                            // grandTotal = totalCost (= cappedPaid เมื่อจ่ายครบ)
                            const grandTotal = totalCost;
                            const grandTotalRaw = memberShares.reduce((s, m) => s + m.rawTotal, 0) + horseRawTotal + poolRawTotal;
                            const memberSumRaw = memberShares.reduce((s, m) => s + m.rawTotal, 0);

                            return (
                              <div className="space-y-4">
                                {/* สรุปส่วนแบ่ง — ย้ายลงมาหลังแผนการโอน */}
                                {(() => {
                                  const projDists = distributions.filter((d) => d.projectId === project.id);
                                  const distPaid = (rid: RecipientId) => projDists.filter((d) => d.recipientId === rid).reduce((s, d) => s + d.amount, 0);
                                  const hasCommission = getCommission(project) > 0;
                                  return (
                                    <div className="bg-white rounded-lg border p-4">
                                      <div className="flex items-center justify-between mb-3">
                                        <h5 className="text-sm font-semibold text-gray-700">สรุปส่วนแบ่ง (จากเงินที่รับมาแล้ว {formatCurrency(totalPaidReal)})</h5>
                                        <button onClick={() => { setShowDistForm(project.id); setDistForm({ projectId: project.id, recipientId: '', amount: 0, paidDate: new Date().toISOString().split('T')[0], slipUrl: '', slipUrls: [], note: '' }); }} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"><Plus size={14} /> เพิ่มรายการโอน</button>
                                      </div>
                                      <div className={`grid grid-cols-2 sm:grid-cols-3 ${hasCommission ? 'lg:grid-cols-6' : 'lg:grid-cols-5'} gap-3`}>
                                        {memberShares.map((m) => {
                                          const shouldPay = m.shouldPayNow; // rounded
                                          const alreadyPaid = distPaid(m.id);
                                          const remaining = Math.max(0, shouldPay - alreadyPaid);
                                          const fullyPaid = alreadyPaid >= m.total && m.total > 0;
                                          return (
                                            <div key={m.id} className={`rounded-lg border p-3 text-center ${fullyPaid ? 'bg-green-50 border-green-200' : ''}`} style={{ borderColor: fullyPaid ? undefined : `${m.color}40`, background: fullyPaid ? undefined : `${m.color}08` }}>
                                              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: m.color }}>{m.shortName}</div>
                                              <p className="text-sm text-gray-700 font-medium">{m.name}</p>
                                              <p className="text-lg font-bold mt-1" style={{ color: m.color }}>{formatCurrency(m.total)}</p>
                                              <p className="text-xs text-gray-400">ส่วนแบ่งทั้งโครงการ</p>
                                              {alreadyPaid > 0 && (
                                                <p className="text-xs text-green-600 mt-1">โอนแล้ว: {formatCurrency(alreadyPaid)}</p>
                                              )}
                                              {totalPaidReal > 0 && !fullyPaid && (
                                                <div className="mt-2 px-2 py-1.5 bg-blue-50 rounded-md">
                                                  <p className="text-sm text-blue-700 font-bold">ต้องโอน: {formatCurrency(remaining)}</p>
                                                </div>
                                              )}
                                              {fullyPaid && (
                                                <p className="text-sm text-green-600 font-bold mt-2">✅ โอนครบแล้ว</p>
                                              )}
                                            </div>
                                          );
                                        })}
                                        {/* Manager — ไม่โดน commission, ใช้ rounded shouldPay */}
                                        {(() => {
                                          const hPaid = distPaid('horse');
                                          const hShouldPay = horseShouldPayNow; // rounded
                                          const hRemaining = Math.max(0, hShouldPay - hPaid);
                                          const hFull = hPaid >= horseTotal && horseTotal > 0;
                                          return (
                                            <div className={`rounded-lg border p-3 text-center ${hFull ? 'bg-green-50 border-green-200' : 'border-amber-200 bg-amber-50'}`}>
                                              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center bg-amber-500 text-white font-bold text-sm">MG</div>
                                              <p className="text-sm text-gray-700 font-medium">Manager</p>
                                              <p className="text-lg font-bold text-amber-600 mt-1">{formatCurrency(horseTotal)}</p>
                                              <p className="text-xs text-gray-400">ส่วนแบ่งทั้งโครงการ</p>
                                              {hPaid > 0 && <p className="text-xs text-green-600 mt-1">โอนแล้ว: {formatCurrency(hPaid)}</p>}
                                              {totalPaidReal > 0 && !hFull && (
                                                <div className="mt-2 px-2 py-1.5 bg-blue-50 rounded-md">
                                                  <p className="text-sm text-blue-700 font-bold">ต้องโอน: {formatCurrency(hRemaining)}</p>
                                                </div>
                                              )}
                                              {hFull && <p className="text-sm text-green-600 font-bold mt-2">✅ โอนครบแล้ว</p>}
                                            </div>
                                          );
                                        })()}
                                        {/* Pool money — ไม่โดน commission, ใช้ rounded shouldPay */}
                                        {(() => {
                                          const pPaid = distPaid('pool');
                                          const pShouldPay = poolShouldPayNow; // rounded
                                          const pRemaining = Math.max(0, pShouldPay - pPaid);
                                          const pFull = pPaid >= poolTotal && poolTotal > 0;
                                          return (
                                            <div className={`rounded-lg border p-3 text-center ${pFull ? 'bg-green-50 border-green-200' : 'border-gray-200 bg-gray-50'}`}>
                                              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center bg-gray-500 text-white font-bold text-sm">PM</div>
                                              <p className="text-sm text-gray-700 font-medium">Pool money</p>
                                              <p className="text-lg font-bold text-gray-600 mt-1">{formatCurrency(poolTotal)}</p>
                                              <p className="text-xs text-gray-400">ส่วนแบ่งทั้งโครงการ</p>
                                              {pPaid > 0 && <p className="text-xs text-green-600 mt-1">โอนแล้ว: {formatCurrency(pPaid)}</p>}
                                              {totalPaidReal > 0 && !pFull && (
                                                <div className="mt-2 px-2 py-1.5 bg-blue-50 rounded-md">
                                                  <p className="text-sm text-blue-700 font-bold">ต้องโอน: {formatCurrency(pRemaining)}</p>
                                                </div>
                                              )}
                                              {pFull && <p className="text-sm text-green-600 font-bold mt-2">✅ โอนครบแล้ว</p>}
                                            </div>
                                          );
                                        })()}
                                        {/* Commission (เฉพาะโครงการที่กำหนด commission > 0) */}
                                        {getCommission(project) > 0 && (() => {
                                          const commTotal = getCommission(project);
                                          const cPaid = distPaid('commission');
                                          const cFull = cPaid >= commTotal;
                                          // commission-first: ต้องโอนจริง = min(commission, ที่ลูกค้าจ่ายมาแล้ว) − โอนแล้ว
                                          const cShouldPay = commissionShouldPay;
                                          const cRemaining = Math.max(0, cShouldPay - cPaid);
                                          return (
                                            <div className={`rounded-lg border p-3 text-center ${cFull ? 'bg-green-50 border-green-200' : 'border-rose-200 bg-rose-50'}`}>
                                              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center bg-rose-500 text-white font-bold text-sm">CM</div>
                                              <p className="text-sm text-gray-700 font-medium">Commission</p>
                                              <p className="text-lg font-bold text-rose-600 mt-1">{formatCurrency(commTotal)}</p>
                                              <p className="text-xs text-gray-400">หักก่อนเป็นอันดับแรก</p>
                                              {cPaid > 0 && <p className="text-xs text-green-600 mt-1">โอนแล้ว: {formatCurrency(cPaid)}</p>}
                                              {totalPaidReal > 0 && !cFull && cRemaining > 0 && (
                                                <div className="mt-2 px-2 py-1.5 bg-blue-50 rounded-md">
                                                  <p className="text-sm text-blue-700 font-bold">ต้องโอน: {formatCurrency(cRemaining)}</p>
                                                </div>
                                              )}
                                              {cFull && <p className="text-sm text-green-600 font-bold mt-2">✅ โอนครบแล้ว</p>}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                      {totalPaidReal > 0 && (
                                        <div className="mt-3 p-3 bg-indigo-50 rounded-lg flex items-center justify-between text-sm">
                                          <span className="text-indigo-700">เงินที่รับมาแล้ว: <strong>{formatCurrency(totalPaidReal)}</strong> จากทั้งหมด <strong>{formatCurrency(grandTotal)}</strong> ({grandTotal > 0 ? Math.round((totalPaidReal / grandTotal) * 100) : 0}%)</span>
                                          <span className={totalPaidReal >= grandTotal ? 'text-green-600 font-bold' : 'text-yellow-600'}>{totalPaidReal >= grandTotal ? '✅ รับครบแล้ว' : `คงค้าง ${formatCurrency(grandTotal - totalPaidReal)}`}</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

                                {/* ตารางแบ่งตามกิจกรรม */}
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-left text-xs text-gray-500 border-b bg-gradient-to-r from-gray-50 to-gray-100">
                                        <th className="px-3 py-2 font-medium">กิจกรรม</th>
                                        <th className="px-3 py-2 font-medium text-right">ค่าบริการ</th>
                                        {MEMBERS.map((m) => <th key={m.id} className="px-3 py-2 font-medium text-center">{m.name}</th>)}
                                        <th className="px-3 py-2 font-medium text-center">Manager</th>
                                        <th className="px-3 py-2 font-medium text-center">Pool money</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {project.activities.map((a) => (
                                        <tr key={a.id} className="border-b border-gray-50">
                                          <td className="px-3 py-2 text-gray-700">{a.name}</td>
                                          <td className="px-3 py-2 text-right font-medium">{formatCurrency(a.cost)}</td>
                                          {MEMBERS.map((m) => (
                                            <td key={m.id} className="px-3 py-2 text-center">
                                              <span className="text-gray-500 text-xs">{a.sharePercent[m.id] || 0}%</span>
                                              <br />
                                              <span className="font-medium">{formatCurrency((a.cost * (a.sharePercent[m.id] || 0)) / 100)}</span>
                                            </td>
                                          ))}
                                          <td className="px-3 py-2 text-center">
                                            <span className="text-gray-500 text-xs">{getHorsePercent(a)}%</span><br />
                                            <span className="font-medium text-amber-600">{formatCurrency((a.cost * getHorsePercent(a)) / 100)}</span>
                                          </td>
                                          <td className="px-3 py-2 text-center">
                                            <span className="text-gray-500 text-xs">{getPoolPercent(a)}%</span><br />
                                            <span className="font-medium text-gray-500">{formatCurrency((a.cost * getPoolPercent(a)) / 100)}</span>
                                          </td>
                                        </tr>
                                      ))}
                                      <tr className="font-bold text-gray-900 bg-gray-50 border-t-2 border-gray-300">
                                        <td className="px-3 py-2">{commissionAmount > 0 ? 'รวม (ก่อนหัก commission)' : 'รวมทั้งหมด'}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(totalCost)}</td>
                                        {memberShares.map((m) => <td key={m.id} className="px-3 py-2 text-center" style={{ color: m.color }}>{formatCurrency(m.rawTotal)}</td>)}
                                        <td className="px-3 py-2 text-center text-amber-600">{formatCurrency(horseRawTotal)}</td>
                                        <td className="px-3 py-2 text-center text-gray-500">{formatCurrency(poolRawTotal)}</td>
                                      </tr>
                                      {commissionAmount > 0 && (
                                        <>
                                          <tr className="text-rose-700 bg-rose-50">
                                            <td className="px-3 py-1.5 text-xs">หัก Commission (จากสมาชิก {Math.round((1 - calcNetRatio(project)) * 10000) / 100}%)</td>
                                            <td className="px-3 py-1.5 text-right text-xs">−{formatCurrency(commissionAmount)}</td>
                                            {memberShares.map((m) => <td key={m.id} className="px-3 py-1.5 text-center text-xs">−{formatCurrency(m.rawTotal - m.total)}</td>)}
                                            <td className="px-3 py-1.5 text-center text-xs">−{formatCurrency(horseRawTotal - horseTotal)}</td>
                                            <td className="px-3 py-1.5 text-center text-xs">−{formatCurrency(poolRawTotal - poolTotal)}</td>
                                          </tr>
                                          <tr className="font-bold text-indigo-900 bg-indigo-50 border-t-2 border-indigo-200">
                                            <td className="px-3 py-2">รวมสุทธิ (ที่ต้องโอน)</td>
                                            <td className="px-3 py-2 text-right">{formatCurrency(totalCost - commissionAmount)}</td>
                                            {memberShares.map((m) => <td key={m.id} className="px-3 py-2 text-center" style={{ color: m.color }}>{formatCurrency(m.total)}</td>)}
                                            <td className="px-3 py-2 text-center text-amber-600">{formatCurrency(horseTotal)}</td>
                                            <td className="px-3 py-2 text-center text-gray-500">{formatCurrency(poolTotal)}</td>
                                          </tr>
                                        </>
                                      )}
                                    </tbody>
                                  </table>
                                </div>

                                {/* แผนการโอนเงินแยกรายงวด (ย้ายขึ้นมา) */}
                                <div className="bg-white rounded-lg border p-4">
                                  <h5 className="text-sm font-semibold text-gray-700 mb-3">แผนการโอนเงินแยกรายงวด {commissionAmount > 0 && <span className="text-xs font-normal text-gray-500">(Commission ตัดก่อนเป็นอันดับแรก แล้วค่อยกระจายให้สมาชิก)</span>}</h5>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-left text-xs text-gray-500 border-b">
                                          <th className="px-3 py-2 font-medium">งวด</th>
                                          <th className="px-3 py-2 font-medium text-right">จำนวนเงิน</th>
                                          <th className="px-3 py-2 font-medium text-right">รับแล้ว</th>
                                          {MEMBERS.map((m) => <th key={m.id} className="px-3 py-2 font-medium text-center">{m.name}</th>)}
                                          <th className="px-3 py-2 font-medium text-center">Manager</th>
                                          <th className="px-3 py-2 font-medium text-center">Pool money</th>
                                          {commissionAmount > 0 && <th className="px-3 py-2 font-medium text-center text-rose-600">Commission</th>}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(() => {
                                          // ใช้ calcRoundedSharesDelta — ทุกยอดเป็นจำนวนเต็มบาท
                                          // cumulative paid up to each installment → delta คือยอดของงวดนั้น
                                          const sortedInsts = [...installments].sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0));
                                          let cumulative = 0;
                                          return sortedInsts.map((inst) => {
                                            const instPaid = projectPaymentsAll.filter((p) => p.installmentId === inst.id).reduce((s, p) => s + p.amount, 0);
                                            const before = cumulative;
                                            cumulative += inst.amount;
                                            const delta = calcRoundedSharesDelta(project, before, cumulative);
                                            return (
                                              <tr key={inst.id} className="border-b border-gray-50">
                                                <td className="px-3 py-2 text-gray-700">งวดที่ {inst.installmentNumber}</td>
                                                <td className="px-3 py-2 text-right font-medium">{formatCurrency(inst.amount)}</td>
                                                <td className="px-3 py-2 text-right">
                                                  <span className={instPaid >= inst.amount && inst.amount > 0 ? 'text-green-600 font-medium' : instPaid > 0 ? 'text-blue-600' : 'text-gray-400'}>{formatCurrency(instPaid)}</span>
                                                </td>
                                                {memberShares.map((m) => (
                                                  <td key={m.id} className="px-3 py-2 text-center text-xs" style={{ color: m.color }}>{formatCurrency(delta.members[m.id])}</td>
                                                ))}
                                                <td className="px-3 py-2 text-center text-xs text-amber-600">{formatCurrency(delta.horse)}</td>
                                                <td className="px-3 py-2 text-center text-xs text-gray-500">{formatCurrency(delta.pool)}</td>
                                                {commissionAmount > 0 && <td className="px-3 py-2 text-center text-xs text-rose-600">{formatCurrency(delta.commission)}</td>}
                                              </tr>
                                            );
                                          });
                                        })()}
                                        <tr className="font-bold text-gray-900 bg-gray-50 border-t-2 border-gray-300">
                                          <td className="px-3 py-2">รวม</td>
                                          <td className="px-3 py-2 text-right">{formatCurrency(totalInstallments)}</td>
                                          <td className="px-3 py-2 text-right text-green-600">{formatCurrency(totalPaidReal)}</td>
                                          {memberShares.map((m) => <td key={m.id} className="px-3 py-2 text-center" style={{ color: m.color }}>{formatCurrency(m.total)}</td>)}
                                          <td className="px-3 py-2 text-center text-amber-600">{formatCurrency(horseTotal)}</td>
                                          <td className="px-3 py-2 text-center text-gray-500">{formatCurrency(poolTotal)}</td>
                                          {commissionAmount > 0 && <td className="px-3 py-2 text-center text-rose-600">{formatCurrency(commissionAmount)}</td>}
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                {/* บันทึกการโอนเงินให้สมาชิก */}
                                <div className="bg-white rounded-lg border p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <h5 className="text-sm font-semibold text-gray-700">บันทึกการโอนเงินให้สมาชิก</h5>
                                    <button onClick={() => { setShowDistForm(project.id); setDistForm({ projectId: project.id, recipientId: '', amount: 0, paidDate: new Date().toISOString().split('T')[0], slipUrl: '', slipUrls: [], note: '' }); }} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"><Plus size={14} /> เพิ่มรายการโอน</button>
                                  </div>

                                  {showDistForm === project.id && (
                                    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                                      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-xl">
                                          <div className="flex items-center gap-2">
                                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow">
                                              <Banknote size={18} className="text-white" />
                                            </div>
                                            <h2 className="font-semibold text-gray-900">เพิ่มรายการโอนเงินให้สมาชิก</h2>
                                          </div>
                                          <button onClick={() => setShowDistForm(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-white/60">
                                            <X size={18} />
                                          </button>
                                        </div>
                                        <div className="p-5 space-y-4">
                                          <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">ผู้รับเงิน *</label>
                                            <select
                                              value={distForm.recipientId}
                                              onChange={(e) => {
                                                const rid = e.target.value as RecipientId | '';
                                                // Prefill จำนวนเงิน = ที่ต้องโอนคงเหลือของ recipient นั้น (rounded shouldPay − โอนแล้ว)
                                                let prefillAmount = distForm.amount;
                                                if (rid) {
                                                  const alreadyPaid = distributions
                                                    .filter((d) => d.projectId === project.id && d.recipientId === rid)
                                                    .reduce((s, d) => s + d.amount, 0);
                                                  const totalPaidForProject = payments.filter((p) => p.projectId === project.id).reduce((s, p) => s + p.amount, 0);
                                                  const rs = calcRoundedShares(project, totalPaidForProject);
                                                  let shouldPay = 0;
                                                  if (rid === 'commission') shouldPay = rs.commission;
                                                  else if (rid === 'horse') shouldPay = rs.horse;
                                                  else if (rid === 'pool') shouldPay = rs.pool;
                                                  else shouldPay = rs.members[rid as MemberId] ?? 0;
                                                  prefillAmount = Math.max(0, shouldPay - alreadyPaid);
                                                }
                                                setDistForm({ ...distForm, recipientId: rid as RecipientId, amount: prefillAmount });
                                              }}
                                              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
                                            >
                                              <option value="">-- เลือกผู้รับเงิน --</option>
                                              {MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                              <option value="horse">Manager</option>
                                              <option value="pool">Pool money</option>
                                              {getCommission(project) > 0 && (
                                                <option value="commission">Commission ({formatCurrency(getCommission(project))})</option>
                                              )}
                                            </select>
                                          </div>
                                          <div className="grid grid-cols-2 gap-3">
                                            <div>
                                              <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท) *</label>
                                              <input type="number" value={distForm.amount || ''} onChange={(e) => setDistForm({ ...distForm, amount: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="0" />
                                            </div>
                                            <div>
                                              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่โอน</label>
                                              <input type="date" value={distForm.paidDate} onChange={(e) => setDistForm({ ...distForm, paidDate: e.target.value })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />
                                            </div>
                                          </div>
                                          <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">อัพโหลด Slip</label>
                                            <SlipUploader
                                              values={distForm.slipUrls || []}
                                              onChange={(urls) => setDistForm({ ...distForm, slipUrls: urls, slipUrl: urls[0] || '' })}
                                              onPreview={(url) => setViewSlipUrl(url)}
                                              color="green"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
                                            <input type="text" value={distForm.note} onChange={(e) => setDistForm({ ...distForm, note: e.target.value })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="หมายเหตุเพิ่มเติม..." />
                                          </div>
                                        </div>
                                        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
                                          <button onClick={() => setShowDistForm(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">ยกเลิก</button>
                                          <button onClick={() => handleSaveDistribution(project.id)} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-sm font-medium hover:from-green-700 hover:to-emerald-700 shadow">
                                            <Save size={16} /> บันทึก
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {(() => {
                                    const projDists = distributions.filter((d) => d.projectId === project.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                                    // สรุปโอนแล้วแยกตามผู้รับ
                                    const distByRecipient = (rid: RecipientId) => projDists.filter((d) => d.recipientId === rid).reduce((s, d) => s + d.amount, 0);
                                    const totalDist = projDists.reduce((s, d) => s + d.amount, 0);

                                    return projDists.length > 0 ? (
                                      <div className="space-y-2">
                                        {projDists.map((dist) => (
                                          <div key={dist.id} className="flex items-center justify-between bg-white rounded-lg border p-3">
                                            <div className="flex items-center gap-3">
                                              <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold">
                                                {ALL_SHORT_NAMES[dist.recipientId] || '?'}
                                              </div>
                                              <div>
                                                <p className="text-sm font-medium text-gray-700">{ALL_SHARE_NAMES[dist.recipientId] || dist.recipientId}</p>
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                  {dist.paidDate && <span>{formatDate(dist.paidDate)}</span>}
                                                  {dist.note && <span>- {dist.note}</span>}
                                                </div>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                              <p className="text-sm font-bold text-green-600">{formatCurrency(dist.amount)}</p>
                                              {recordHasSlip(dist) && (() => {
                                                const slips = getSlips(dist);
                                                const isLoading = loadingSlipId === dist.id;
                                                return (
                                                  <button
                                                    onClick={() => handleViewSlipRecord('distribution', dist.id, slips)}
                                                    disabled={isLoading}
                                                    className="relative p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-50"
                                                    title={isLoading ? 'กำลังโหลด slip...' : `ดู Slip${slips.length > 0 ? ` (${slips.length} รูป)` : ''}`}
                                                  >
                                                    <Image size={16} />
                                                    {slips.length > 1 && (
                                                      <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">{slips.length}</span>
                                                    )}
                                                  </button>
                                                );
                                              })()}
                                              {editMode && <button onClick={() => { if (confirm('ลบรายการนี้?')) deleteDistribution(dist.id); }} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>}
                                            </div>
                                          </div>
                                        ))}
                                        {/* สรุปแยกตามผู้รับ */}
                                        <div className="p-3 bg-green-50 rounded-lg text-sm">
                                          <p className="font-medium text-green-800 mb-2">สรุปยอดโอนแล้ว: {formatCurrency(totalDist)}</p>
                                          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                                            {MEMBERS.map((m) => {
                                              const paid = distByRecipient(m.id);
                                              const owed = memberShares.find((ms) => ms.id === m.id)?.total || 0;
                                              return (
                                                <div key={m.id} className="flex justify-between bg-white rounded px-2 py-1">
                                                  <span>{m.name}</span>
                                                  <span className={paid >= owed && owed > 0 ? 'text-green-600 font-medium' : ''}>{formatCurrency(paid)}/{formatCurrency(owed)}</span>
                                                </div>
                                              );
                                            })}
                                            <div className="flex justify-between bg-white rounded px-2 py-1">
                                              <span>Manager</span>
                                              <span className={distByRecipient('horse') >= horseTotal && horseTotal > 0 ? 'text-green-600 font-medium' : ''}>{formatCurrency(distByRecipient('horse'))}/{formatCurrency(horseTotal)}</span>
                                            </div>
                                            <div className="flex justify-between bg-white rounded px-2 py-1">
                                              <span>Pool money</span>
                                              <span className={distByRecipient('pool') >= poolTotal && poolTotal > 0 ? 'text-green-600 font-medium' : ''}>{formatCurrency(distByRecipient('pool'))}/{formatCurrency(poolTotal)}</span>
                                            </div>
                                            {commissionAmount > 0 && (
                                              <div className="flex justify-between bg-white rounded px-2 py-1">
                                                <span className="text-rose-700">Commission</span>
                                                <span className={distByRecipient('commission') >= commissionAmount ? 'text-green-600 font-medium' : 'text-rose-600'}>{formatCurrency(distByRecipient('commission'))}/{formatCurrency(commissionAmount)}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-gray-400 text-sm text-center py-3">ยังไม่มีรายการโอนเงินให้สมาชิก</p>
                                    );
                                  })()}
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <p className="text-gray-400 text-sm text-center py-4">ยังไม่มีกิจกรรม กรุณาเพิ่มกิจกรรมก่อน</p>
                        )}
                      </div>
                    )}
                </div>

                {/* Slip viewer modal (single slip) */}
                {viewSlipUrl && (
                  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-lg max-h-[80vh] overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-gray-900">Slip การชำระเงิน</h3>
                        <button onClick={() => setViewSlipUrl(null)}><X size={18} className="text-gray-400" /></button>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={viewSlipUrl} alt="Payment slip" className="w-full rounded-lg" />
                    </div>
                  </div>
                )}

                {/* Multi-slip viewer modal with navigation */}
                {viewSlips && viewSlips.length > 0 && (
                  <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-between items-center p-4 border-b border-gray-100">
                        <h3 className="font-semibold text-gray-900">
                          Slip {viewSlipIndex + 1} / {viewSlips.length}
                        </h3>
                        <button onClick={() => setViewSlips(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100">
                          <X size={18} />
                        </button>
                      </div>

                      {/* Main image with prev/next buttons */}
                      <div className="relative bg-gray-50 p-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={viewSlips[viewSlipIndex]} alt={`Slip ${viewSlipIndex + 1}`} className="w-full max-h-[60vh] object-contain rounded-lg" />

                        {viewSlips.length > 1 && (
                          <>
                            <button
                              onClick={() => setViewSlipIndex((i) => (i - 1 + viewSlips.length) % viewSlips.length)}
                              className="absolute left-6 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center text-gray-700"
                              title="ก่อนหน้า"
                            >
                              <ChevronLeft size={20} />
                            </button>
                            <button
                              onClick={() => setViewSlipIndex((i) => (i + 1) % viewSlips.length)}
                              className="absolute right-6 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center text-gray-700"
                              title="ถัดไป"
                            >
                              <ChevronRight size={20} />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Thumbnails */}
                      {viewSlips.length > 1 && (
                        <div className="p-4 border-t border-gray-100">
                          <div className="flex gap-2 overflow-x-auto">
                            {viewSlips.map((slip, i) => (
                              <button
                                key={i}
                                onClick={() => setViewSlipIndex(i)}
                                className={`relative shrink-0 rounded-lg overflow-hidden border-2 transition-all ${i === viewSlipIndex ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-200 hover:border-gray-300 opacity-70 hover:opacity-100'}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={slip} alt={`thumb ${i + 1}`} className="w-16 h-16 object-cover" />
                                <div className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[10px] rounded px-1">{i + 1}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
