'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { MEMBERS, Project, Activity, MemberId, ProjectStatus, STANDARD_ACTIVITIES, HORSE_PERCENT, POOL_PERCENT, PaymentInstallment, PaymentRecord, DistributionRecord, RecipientId, ALL_SHARE_NAMES, ALL_SHORT_NAMES } from '@/types';
import { formatCurrency, formatDate, getStatusLabel, getStatusColor } from '@/lib/utils';
import { Plus, Pencil, Trash2, X, Save, CreditCard, Check, Calculator, Image, Banknote, ClipboardList, Landmark, Receipt, Users } from 'lucide-react';
import { useHydrated } from '@/lib/useHydrated';

type ProjectForm = Omit<Project, 'id' | 'createdAt' | 'activities' | 'installments'>;

function generateProjectCode(existingProjects: Project[]): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const todayProjects = existingProjects.filter((p) => p.projectCode?.startsWith(dateStr));
  const seq = String(todayProjects.length + 1).padStart(2, '0');
  return `${dateStr}${seq}`;
}

const emptyActivity = (): Omit<Activity, 'id'> => ({
  name: '', cost: 0, sharePercent: { tangmo: 0, frank: 0, ton: 0 }, status: 'pending',
});

const emptyInstallment = (): Omit<PaymentInstallment, 'id'> => ({
  installmentNumber: 1, name: '', amount: 0, status: 'pending', paidDate: '',
});

export default function ProjectsPage() {
  const hydrated = useHydrated();
  const {
    projects, addProject, updateProject, deleteProject,
    addActivity, updateActivity, deleteActivity,
    addInstallment, updateInstallment, deleteInstallment,
    payments, addPayment, updatePayment, deletePayment,
    distributions, addDistribution, deleteDistribution,
  } = useStore();

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [projects]
  );

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProjectForm>({ projectCode: '', name: '', client: '', budget: 0, startDate: '', endDate: '', status: 'pending' });
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(sortedProjects[0]?.id || null);
  const [activeTab, setActiveTab] = useState<'activities' | 'installments' | 'payments' | 'distribution'>('activities');

  const [activityForm, setActivityForm] = useState(emptyActivity());
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [showActivityForm, setShowActivityForm] = useState<string | null>(null);

  const [installmentForm, setInstallmentForm] = useState(emptyInstallment());
  const [editingInstallmentId, setEditingInstallmentId] = useState<string | null>(null);
  const [showInstallmentForm, setShowInstallmentForm] = useState<string | null>(null);

  const [paymentForm, setPaymentForm] = useState<Omit<PaymentRecord, 'id' | 'createdAt'>>({ projectId: '', installmentId: '', amount: 0, paidDate: '', slipUrl: '', note: '' });
  const [showPaymentForm, setShowPaymentForm] = useState<string | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [viewSlipUrl, setViewSlipUrl] = useState<string | null>(null);

  // Distribution form
  const [showDistForm, setShowDistForm] = useState<string | null>(null);
  const [distForm, setDistForm] = useState({ projectId: '', recipientId: '' as RecipientId | '', amount: 0, paidDate: new Date().toISOString().split('T')[0], slipUrl: '', note: '' });

  const handleDistSlipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setDistForm({ ...distForm, slipUrl: ev.target?.result as string });
    reader.readAsDataURL(file);
  };

  const handleSaveDistribution = (projectId: string) => {
    if (!distForm.recipientId) { alert('กรุณาเลือกผู้รับเงิน'); return; }
    if (!distForm.amount || distForm.amount <= 0) { alert('กรุณาระบุจำนวนเงิน'); return; }
    addDistribution({ ...distForm, projectId, recipientId: distForm.recipientId as RecipientId });
    setDistForm({ projectId: '', recipientId: '', amount: 0, paidDate: new Date().toISOString().split('T')[0], slipUrl: '', note: '' });
    setShowDistForm(null);
  };

  const openNewProjectForm = () => {
    setForm({ projectCode: generateProjectCode(projects), name: '', client: '', budget: 0, startDate: '', endDate: '', status: 'pending' });
    setEditingId(null);
    setShowForm(true);
  };

  const handleSaveProject = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      updateProject(editingId, form);
    } else {
      const projectId = addProject(form);
      // 4 กิจกรรม default พร้อมราคาและส่วนแบ่ง
      const defaultActs = [
        { name: 'Proposal', cost: 20000, sharePercent: { tangmo: 80, frank: 0, ton: 15 } },
        { name: 'Analysis', cost: 20000, sharePercent: { tangmo: 0, frank: 80, ton: 15 } },
        { name: 'Result', cost: 10000, sharePercent: { tangmo: 80, frank: 0, ton: 15 } },
        { name: 'Publication Support', cost: 15000, sharePercent: { tangmo: 55, frank: 20, ton: 20 } },
      ];
      defaultActs.forEach((act) => {
        addActivity(projectId, { ...act, status: 'pending' as ProjectStatus });
      });
      // 3 งวดเงิน default + auto-fill จำนวนเงิน
      const totalAll = defaultActs.reduce((s, a) => s + a.cost, 0);
      const totalPAR = defaultActs.filter((a) => ['Proposal', 'Analysis', 'Result'].includes(a.name)).reduce((s, a) => s + a.cost, 0);
      const totalPub = defaultActs.filter((a) => a.name === 'Publication Support').reduce((s, a) => s + a.cost, 0);
      const defaultInstallments = [
        { num: 1, name: 'งวดที่ 1 ส่ง draft มัดจำ 50%', amount: totalAll * 0.5 },
        { num: 2, name: 'งวดที่ 2 ส่งบทความฉบับสมบูรณ์', amount: totalPAR * 0.5 },
        { num: 3, name: 'งวดที่ 3 ส่ง Submit วารสาร', amount: totalPub * 0.5 },
      ];
      defaultInstallments.forEach((inst) => {
        addInstallment(projectId, { installmentNumber: inst.num, name: inst.name, amount: inst.amount, status: 'pending', paidDate: '' });
      });
      setSelectedProjectId(projectId);
      setActiveTab('activities');
    }
    setShowForm(false);
    setEditingId(null);
  };

  const handleEditProject = (project: Project) => {
    setForm({ projectCode: project.projectCode, name: project.name, client: project.client, budget: project.budget, startDate: project.startDate, endDate: project.endDate, status: project.status });
    setEditingId(project.id);
    setShowForm(true);
  };

  const handleSaveActivity = (projectId: string) => {
    if (!activityForm.name.trim()) return;
    const totalShare = Object.values(activityForm.sharePercent).reduce((a, b) => a + b, 0);
    if (totalShare + HORSE_PERCENT + POOL_PERCENT > 100) {
      alert(`ส่วนแบ่งผู้ก่อตั้งรวมต้องไม่เกิน ${100 - HORSE_PERCENT - POOL_PERCENT}% (หักผู้จัดการ ${HORSE_PERCENT}% + กองกลาง ${POOL_PERCENT}% อัตโนมัติ)`);
      return;
    }
    if (editingActivityId) updateActivity(projectId, editingActivityId, activityForm);
    else addActivity(projectId, activityForm);
    setActivityForm(emptyActivity()); setShowActivityForm(null); setEditingActivityId(null);
  };

  const handleEditActivity = (projectId: string, activity: Activity) => {
    setActivityForm({ name: activity.name, cost: activity.cost, sharePercent: { ...activity.sharePercent }, status: activity.status });
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
    const totalPAR = acts.filter((a) => ['Proposal', 'Analysis', 'Result'].includes(a.name)).reduce((s, a) => s + a.cost, 0);
    const totalPub = acts.filter((a) => a.name === 'Publication Support').reduce((s, a) => s + a.cost, 0);
    const autoAmounts: Record<number, { amount: number; label: string }> = {
      1: { amount: totalAll * 0.5, label: `งวดที่ 1: ค่าใช้จ่ายทั้งหมด × 50% = ${formatCurrency(totalAll * 0.5)}` },
      2: { amount: totalPAR * 0.5, label: `งวดที่ 2: (Proposal+Analysis+Result) × 50% = ${formatCurrency(totalPAR * 0.5)}` },
      3: { amount: totalPub * 0.5, label: `งวดที่ 3: Publication Support × 50% = ${formatCurrency(totalPub * 0.5)}` },
    };
    const installments = project.installments || [];
    const toUpdate = installments.filter((inst) => autoAmounts[inst.installmentNumber]);
    if (toUpdate.length === 0) { alert('ไม่พบงวดที่ 1-3 ให้คำนวณ'); return; }
    const summary = toUpdate.map((inst) => autoAmounts[inst.installmentNumber].label).join('\n');
    if (!confirm(`คำนวณเงินงวดอัตโนมัติ:\n\n${summary}\n\nต้องการดำเนินการ?`)) return;
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
    if (!paymentForm.installmentId) { alert('กรุณาเลือกงวดเงิน'); return; }
    if (!paymentForm.amount || paymentForm.amount <= 0) { alert('กรุณาระบุจำนวนเงิน'); return; }

    // ตรวจสอบว่าจ่ายเกินงวดหรือไม่
    const project = projects.find((p) => p.id === projectId);
    const inst = project?.installments.find((i) => i.id === paymentForm.installmentId);
    if (inst && inst.amount > 0) {
      const alreadyPaid = getInstallmentPaid(paymentForm.installmentId, editingPaymentId || undefined);
      const wouldTotal = alreadyPaid + paymentForm.amount;
      if (wouldTotal > inst.amount) {
        const remaining = inst.amount - alreadyPaid;
        alert(`ไม่สามารถบันทึกได้ จำนวนเงินเกินงวด\n\nงวดเงิน: ${formatCurrency(inst.amount)}\nชำระแล้ว: ${formatCurrency(alreadyPaid)}\nคงเหลือ: ${formatCurrency(remaining)}\nจำนวนที่กรอก: ${formatCurrency(paymentForm.amount)}\n\nกรุณาแก้ไขจำนวนเงินไม่เกิน ${formatCurrency(remaining)}`);
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

    setPaymentForm({ projectId: '', installmentId: '', amount: 0, paidDate: '', slipUrl: '', note: '' });
    setShowPaymentForm(null);
    setEditingPaymentId(null);
  };

  const handleEditPayment = (projectId: string, payment: PaymentRecord) => {
    setPaymentForm({ projectId: payment.projectId, installmentId: payment.installmentId, amount: payment.amount, paidDate: payment.paidDate, slipUrl: payment.slipUrl, note: payment.note });
    setEditingPaymentId(payment.id);
    setShowPaymentForm(projectId);
  };

  const handleSlipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setPaymentForm({ ...paymentForm, slipUrl: event.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const handleActivityStatusChange = (projectId: string, activityId: string, activityName: string, newStatus: ProjectStatus) => {
    if (!confirm(`เปลี่ยนสถานะ "${activityName}" เป็น "${getStatusLabel(newStatus)}"?`)) return;
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">จัดการโครงการ</h1>
          <p className="text-gray-500 text-sm mt-1">เพิ่ม แก้ไข และจัดการกิจกรรม/งวดเงินในโครงการวิจัย</p>
        </div>
        <button onClick={openNewProjectForm} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          <Plus size={16} /> เพิ่มโครงการ
        </button>
      </div>

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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="pending">รอดำเนินการ</option>
                  <option value="in_progress">กำลังดำเนินการ</option>
                  <option value="completed">เสร็จสิ้น</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t">
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 text-sm text-gray-600">ยกเลิก</button>
              <button onClick={handleSaveProject} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"><Save size={16} /> บันทึก</button>
            </div>
          </div>
        </div>
      )}

      {/* Excel-style Project Tabs */}
      {sortedProjects.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 mb-2">ยังไม่มีโครงการ</p>
          <p className="text-gray-400 text-sm">กดปุ่ม &quot;เพิ่มโครงการ&quot; เพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div>
          {/* Tab Bar */}
          <div className="flex items-end overflow-x-auto gap-0.5 pb-0">
            {sortedProjects.map((project, index) => {
              const isSelected = (selectedProjectId || sortedProjects[0]?.id) === project.id;
              const statusDot = project.status === 'completed' ? 'bg-green-500' : project.status === 'in_progress' ? 'bg-blue-500' : 'bg-yellow-500';
              const tabBg = project.status === 'completed'
                ? (isSelected ? 'bg-green-100 border-green-400 text-green-900' : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100')
                : project.status === 'in_progress'
                ? (isSelected ? 'bg-blue-100 border-blue-400 text-blue-900' : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100')
                : (isSelected ? 'bg-yellow-100 border-yellow-400 text-yellow-900' : 'bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100');

              return (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-b-0 rounded-t-lg transition-colors whitespace-nowrap ${tabBg} ${isSelected ? 'z-10 -mb-px' : 'opacity-80'}`}
                >
                  <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                  {project.projectCode && <span className="font-mono text-gray-500">{project.projectCode}</span>}
                  <span className="max-w-[120px] truncate text-gray-700">{project.name}</span>
                </button>
              );
            })}
            <button
              onClick={openNewProjectForm}
              className="flex items-center gap-1 px-3 py-2 text-xs font-medium border border-b-0 rounded-t-lg bg-gray-50 border-gray-200 hover:bg-gray-100 text-gray-500 whitespace-nowrap"
            >
              <Plus size={12} /> เพิ่ม
            </button>
          </div>

          {/* Selected Project Content */}
          {(() => {
            const project = sortedProjects.find(p => p.id === selectedProjectId) || sortedProjects[0];
            if (!project) return null;
            const totalCost = project.activities.reduce((s, a) => s + a.cost, 0);
            const progress = project.activities.length > 0 ? Math.round(project.activities.filter((a) => a.status === 'completed').length / project.activities.length * 100) : 0;
            const installments = project.installments || [];
            const paidAmount = payments.filter((p) => p.projectId === project.id).reduce((s, p) => s + p.amount, 0);
            const totalInstallments = installments.reduce((s, i) => s + i.amount, 0);

            const panelBorder = project.status === 'completed' ? 'border-green-400' : project.status === 'in_progress' ? 'border-blue-400' : 'border-yellow-400';

            return (
              <div className={`bg-white rounded-b-xl rounded-tr-xl border shadow-sm ${panelBorder}`}>
                {/* Project Header */}
                <div className="p-5 border-b">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        {project.projectCode && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">{project.projectCode}</span>}
                        <h3 className="font-semibold text-gray-900">{project.name}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(project.status)}`}>{getStatusLabel(project.status)}</span>
                      </div>
                      <p className="text-sm text-gray-500">{project.client || 'ไม่ระบุผู้วิจัย'}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>งบ: {formatCurrency(project.budget)}</span>
                        <span>ค่าใช้จ่าย: {formatCurrency(totalCost)}</span>
                        <span>รับแล้ว: {formatCurrency(paidAmount)}/{formatCurrency(totalInstallments)}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5"><div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${progress}%` }} /></div>
                        <span className="text-xs text-gray-500">{progress}%</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-4">
                      <button onClick={() => handleEditProject(project)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"><Pencil size={15} /></button>
                      <button onClick={() => { if (confirm('ต้องการลบโครงการนี้?')) { const otherId = sortedProjects.find(p => p.id !== project.id)?.id || null; deleteProject(project.id); setSelectedProjectId(otherId); } }} className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-50"><Trash2 size={15} /></button>
                    </div>
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
                          <p className="text-xs text-gray-500">* หักผู้จัดการ {HORSE_PERCENT}% + กองกลาง {POOL_PERCENT}% อัตโนมัติทุกกิจกรรม</p>
                          <button onClick={() => { setShowActivityForm(project.id); setActivityForm(emptyActivity()); setEditingActivityId(null); }} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus size={14} /> เพิ่มกิจกรรม</button>
                        </div>

                        {showActivityForm === project.id && (
                          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                            <h5 className="text-sm font-medium text-gray-700 mb-3">{editingActivityId ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรมใหม่'}</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">ชื่อกิจกรรม *</label>
                                <div className="flex gap-2">
                                  <select value={STANDARD_ACTIVITIES.includes(activityForm.name as typeof STANDARD_ACTIVITIES[number]) ? activityForm.name : '__custom__'} onChange={(e) => { if (e.target.value !== '__custom__') setActivityForm({ ...activityForm, name: e.target.value }); }} className="border rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                                    {STANDARD_ACTIVITIES.map((act) => <option key={act} value={act}>{act}</option>)}
                                    <option value="__custom__">อื่นๆ</option>
                                  </select>
                                  <input type="text" value={activityForm.name} onChange={(e) => setActivityForm({ ...activityForm, name: e.target.value })} className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="ชื่อกิจกรรม" />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">ค่าบริการ (บาท)</label>
                                <input type="number" value={activityForm.cost || ''} onChange={(e) => setActivityForm({ ...activityForm, cost: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                              </div>
                            </div>
                            <div className="mb-3">
                              <label className="block text-xs text-gray-500 mb-2">ส่วนแบ่งผู้ก่อตั้ง (%) — รวม: {Object.values(activityForm.sharePercent).reduce((a, b) => a + b, 0)}% + ผู้จัดการ {HORSE_PERCENT}% + กองกลาง {POOL_PERCENT}% = {Object.values(activityForm.sharePercent).reduce((a, b) => a + b, 0) + HORSE_PERCENT + POOL_PERCENT}%</label>
                              <div className="grid grid-cols-3 gap-3">
                                {MEMBERS.map((member) => (
                                  <div key={member.id}>
                                    <label className="block text-xs text-gray-600 mb-1">{member.name}</label>
                                    <input type="number" min={0} max={95} value={activityForm.sharePercent[member.id] || ''} onChange={(e) => setActivityForm({ ...activityForm, sharePercent: { ...activityForm.sharePercent, [member.id]: Number(e.target.value) } })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <button onClick={() => { setShowActivityForm(null); setEditingActivityId(null); }} className="px-3 py-1.5 text-xs text-gray-600">ยกเลิก</button>
                              <button onClick={() => handleSaveActivity(project.id)} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">บันทึก</button>
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
                                  <th className="pb-2 font-medium text-center">ผู้จัดการ</th>
                                  <th className="pb-2 font-medium text-center">กองกลาง</th>
                                  <th className="pb-2 font-medium text-center">สถานะ</th>
                                  <th className="pb-2 font-medium text-right">จัดการ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {project.activities.map((activity) => (
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
                                      <span className="text-gray-600">{HORSE_PERCENT}%</span><br />
                                      <span className="text-xs text-gray-400">{formatCurrency((activity.cost * HORSE_PERCENT) / 100)}</span>
                                    </td>
                                    <td className="py-2.5 text-center">
                                      <span className="text-gray-600">{POOL_PERCENT}%</span><br />
                                      <span className="text-xs text-gray-400">{formatCurrency((activity.cost * POOL_PERCENT) / 100)}</span>
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
                                      <div className="flex items-center justify-end gap-1">
                                        <button onClick={() => handleEditActivity(project.id, activity)} className="p-1 text-gray-400 hover:text-gray-600"><Pencil size={13} /></button>
                                        <button onClick={() => { if (confirm('ลบกิจกรรมนี้?')) deleteActivity(project.id, activity.id); }} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                <tr className="font-medium text-gray-900 bg-gray-50">
                                  <td className="py-2.5">รวม</td>
                                  <td className="py-2.5 text-right">{formatCurrency(totalCost)}</td>
                                  {MEMBERS.map((m) => <td key={m.id} className="py-2.5 text-center text-xs">{formatCurrency(project.activities.reduce((sum, a) => sum + (a.cost * (a.sharePercent[m.id] || 0)) / 100, 0))}</td>)}
                                  <td className="py-2.5 text-center text-xs">{formatCurrency(project.activities.reduce((s, a) => s + (a.cost * HORSE_PERCENT) / 100, 0))}</td>
                                  <td className="py-2.5 text-center text-xs">{formatCurrency(project.activities.reduce((s, a) => s + (a.cost * POOL_PERCENT) / 100, 0))}</td>
                                  <td /><td />
                                </tr>
                              </tbody>
                            </table>
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
                            <button onClick={() => handleAutoFillInstallments(project)} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600" title="คำนวณจำนวนเงินงวด 1-3 อัตโนมัติจากกิจกรรม"><Calculator size={14} /> คำนวณอัตโนมัติ</button>
                            <button onClick={() => { const nextNum = installments.length > 0 ? Math.max(...installments.map((i) => i.installmentNumber || 0)) + 1 : 1; setShowInstallmentForm(project.id); setInstallmentForm({ ...emptyInstallment(), installmentNumber: nextNum }); setEditingInstallmentId(null); }} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus size={14} /> เพิ่มงวดเงิน</button>
                          </div>
                        </div>

                        {showInstallmentForm === project.id && (
                          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                            <h5 className="text-sm font-medium text-gray-700 mb-3">{editingInstallmentId ? 'แก้ไขงวดเงิน' : 'เพิ่มงวดเงินใหม่'}</h5>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">งวดที่</label>
                                <input type="number" min={1} value={installmentForm.installmentNumber} onChange={(e) => setInstallmentForm({ ...installmentForm, installmentNumber: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                              </div>
                              <div className="col-span-2">
                                <label className="block text-xs text-gray-500 mb-1">ชื่องวด *</label>
                                <input type="text" value={installmentForm.name} onChange={(e) => setInstallmentForm({ ...installmentForm, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="เช่น งวดที่ 1 ส่ง Draft" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">จำนวนเงิน (บาท)</label>
                                <input type="number" value={installmentForm.amount || ''} onChange={(e) => setInstallmentForm({ ...installmentForm, amount: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">สถานะ</label>
                                <select value={installmentForm.status} onChange={(e) => setInstallmentForm({ ...installmentForm, status: e.target.value as 'pending' | 'paid' })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                                  <option value="pending">รอชำระ</option>
                                  <option value="paid">ชำระแล้ว</option>
                                </select>
                              </div>
                              {installmentForm.status === 'paid' && (
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">วันที่โอน</label>
                                  <input type="date" value={installmentForm.paidDate} onChange={(e) => setInstallmentForm({ ...installmentForm, paidDate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                                </div>
                              )}
                            </div>
                            <div className="flex justify-end gap-2">
                              <button onClick={() => { setShowInstallmentForm(null); setEditingInstallmentId(null); }} className="px-3 py-1.5 text-xs text-gray-600">ยกเลิก</button>
                              <button onClick={() => handleSaveInstallment(project.id)} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">บันทึก</button>
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
                                          <div className="flex gap-1">
                                            <button onClick={() => handleEditInstallment(project.id, inst)} className="p-1 text-gray-400 hover:text-gray-600"><Pencil size={13} /></button>
                                            <button onClick={() => { if (confirm('ลบงวดเงินนี้?')) deleteInstallment(project.id, inst.id); }} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                                          </div>
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
                          <button onClick={() => { setShowPaymentForm(project.id); setPaymentForm({ projectId: project.id, installmentId: '', amount: 0, paidDate: new Date().toISOString().split('T')[0], slipUrl: '', note: '' }); setEditingPaymentId(null); }} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"><Plus size={14} /> เพิ่มรายการโอน</button>
                        </div>

                        {showPaymentForm === project.id && (
                          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                            <h5 className="text-sm font-medium text-gray-700 mb-3">{editingPaymentId ? 'แก้ไขรายการโอน' : 'เพิ่มรายการโอนใหม่'}</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">งวดเงิน *</label>
                                <select value={paymentForm.installmentId} onChange={(e) => setPaymentForm({ ...paymentForm, installmentId: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                                  <option value="">-- เลือกงวดเงิน --</option>
                                  {installments.sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0)).map((inst) => {
                                    const fullyPaid = isInstallmentFullyPaid(inst);
                                    const paidSoFar = getInstallmentPaid(inst.id, editingPaymentId || undefined);
                                    const remaining = inst.amount - paidSoFar;
                                    const isCurrentEdit = editingPaymentId && paymentForm.installmentId === inst.id;
                                    return (
                                      <option key={inst.id} value={inst.id} disabled={fullyPaid && !isCurrentEdit}>
                                        งวดที่ {inst.installmentNumber}: {inst.name} ({formatCurrency(inst.amount)})
                                        {fullyPaid ? ' ✅ ชำระครบแล้ว' : remaining < inst.amount ? ` [คงเหลือ ${formatCurrency(remaining)}]` : ''}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">จำนวนเงิน (บาท) *</label>
                                <input type="number" value={paymentForm.amount || ''} onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">วันที่โอน</label>
                                <input type="date" value={paymentForm.paidDate} onChange={(e) => setPaymentForm({ ...paymentForm, paidDate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">อัพโหลด Slip</label>
                                <input type="file" accept="image/*" onChange={handleSlipUpload} className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-700" />
                                {paymentForm.slipUrl && <img src={paymentForm.slipUrl} alt="slip preview" className="mt-2 h-16 rounded border" />}
                              </div>
                            </div>
                            <div className="mb-3">
                              <label className="block text-xs text-gray-500 mb-1">หมายเหตุ</label>
                              <input type="text" value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="หมายเหตุเพิ่มเติม..." />
                            </div>
                            <div className="flex justify-end gap-2">
                              <button onClick={() => { setShowPaymentForm(null); setEditingPaymentId(null); }} className="px-3 py-1.5 text-xs text-gray-600">ยกเลิก</button>
                              <button onClick={() => handleSavePayment(project.id)} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">บันทึก</button>
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
                                      {payment.slipUrl && (
                                        <button onClick={() => setViewSlipUrl(payment.slipUrl)} className="p-1 text-gray-400 hover:text-indigo-600" title="ดู Slip">
                                          <Image size={16} />
                                        </button>
                                      )}
                                      <div className="flex gap-1">
                                        <button onClick={() => handleEditPayment(project.id, payment)} className="p-1 text-gray-400 hover:text-gray-600"><Pencil size={13} /></button>
                                        <button onClick={() => { if (confirm('ลบรายการโอนนี้?')) { deletePayment(payment.id); setTimeout(() => syncInstallmentStatus(project.id, payment.installmentId), 100); } }} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                                      </div>
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
                          <p className="text-xs text-gray-500">คำนวณจากค่าบริการกิจกรรม × % ส่วนแบ่งที่กำหนด (ผู้จัดการ {HORSE_PERCENT}% + กองกลาง {POOL_PERCENT}% หักอัตโนมัติ)</p>
                        </div>

                        {project.activities.length > 0 ? (
                          (() => {
                            const projectPaymentsAll = payments.filter((p) => p.projectId === project.id);
                            const totalPaidReal = projectPaymentsAll.reduce((s, p) => s + p.amount, 0);

                            // คำนวณส่วนแบ่งจากกิจกรรม
                            const memberShares = MEMBERS.map((m) => {
                              const byActivity = project.activities.map((a) => ({
                                activityName: a.name,
                                percent: a.sharePercent[m.id] || 0,
                                amount: (a.cost * (a.sharePercent[m.id] || 0)) / 100,
                              }));
                              const total = byActivity.reduce((s, a) => s + a.amount, 0);
                              return { ...m, byActivity, total };
                            });

                            const horseByActivity = project.activities.map((a) => ({
                              activityName: a.name,
                              percent: HORSE_PERCENT,
                              amount: (a.cost * HORSE_PERCENT) / 100,
                            }));
                            const horseTotal = horseByActivity.reduce((s, a) => s + a.amount, 0);

                            const poolByActivity = project.activities.map((a) => ({
                              activityName: a.name,
                              percent: POOL_PERCENT,
                              amount: (a.cost * POOL_PERCENT) / 100,
                            }));
                            const poolTotal = poolByActivity.reduce((s, a) => s + a.amount, 0);

                            const grandTotal = memberShares.reduce((s, m) => s + m.total, 0) + horseTotal + poolTotal;

                            // สัดส่วนที่ต้องโอนจริง (ตาม % ของเงินที่รับมาแล้ว)
                            const paidRatio = grandTotal > 0 ? totalPaidReal / grandTotal : 0;

                            return (
                              <div className="space-y-4">
                                {/* สรุปส่วนแบ่ง — ย้ายลงมาหลังแผนการโอน */}
                                {(() => {
                                  const projDists = distributions.filter((d) => d.projectId === project.id);
                                  const distPaid = (rid: RecipientId) => projDists.filter((d) => d.recipientId === rid).reduce((s, d) => s + d.amount, 0);
                                  return (
                                    <div className="bg-white rounded-lg border p-4">
                                      <div className="flex items-center justify-between mb-3">
                                        <h5 className="text-sm font-semibold text-gray-700">สรุปส่วนแบ่ง (จากเงินที่รับมาแล้ว {formatCurrency(totalPaidReal)})</h5>
                                        <button onClick={() => { setShowDistForm(project.id); setDistForm({ projectId: project.id, recipientId: '', amount: 0, paidDate: new Date().toISOString().split('T')[0], slipUrl: '', note: '' }); }} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"><Plus size={14} /> เพิ่มรายการโอน</button>
                                      </div>
                                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                        {memberShares.map((m) => {
                                          const shouldPay = m.total * paidRatio;
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
                                        {/* ผู้จัดการ */}
                                        {(() => {
                                          const hPaid = distPaid('horse');
                                          const hShouldPay = horseTotal * paidRatio;
                                          const hRemaining = Math.max(0, hShouldPay - hPaid);
                                          const hFull = hPaid >= horseTotal && horseTotal > 0;
                                          return (
                                            <div className={`rounded-lg border p-3 text-center ${hFull ? 'bg-green-50 border-green-200' : 'border-amber-200 bg-amber-50'}`}>
                                              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center bg-amber-500 text-white font-bold text-sm">ผจก</div>
                                              <p className="text-sm text-gray-700 font-medium">ผู้จัดการ</p>
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
                                        {/* กองกลาง */}
                                        {(() => {
                                          const pPaid = distPaid('pool');
                                          const pShouldPay = poolTotal * paidRatio;
                                          const pRemaining = Math.max(0, pShouldPay - pPaid);
                                          const pFull = pPaid >= poolTotal && poolTotal > 0;
                                          return (
                                            <div className={`rounded-lg border p-3 text-center ${pFull ? 'bg-green-50 border-green-200' : 'border-gray-200 bg-gray-50'}`}>
                                              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center bg-gray-500 text-white font-bold text-sm">กก</div>
                                              <p className="text-sm text-gray-700 font-medium">กองกลาง</p>
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
                                      </div>
                                      {totalPaidReal > 0 && (
                                        <div className="mt-3 p-3 bg-indigo-50 rounded-lg flex items-center justify-between text-sm">
                                          <span className="text-indigo-700">เงินที่รับมาแล้ว: <strong>{formatCurrency(totalPaidReal)}</strong> จากทั้งหมด <strong>{formatCurrency(grandTotal)}</strong> ({grandTotal > 0 ? Math.round(paidRatio * 100) : 0}%)</span>
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
                                        <th className="px-3 py-2 font-medium text-center">ผู้จัดการ</th>
                                        <th className="px-3 py-2 font-medium text-center">กองกลาง</th>
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
                                            <span className="text-gray-500 text-xs">{HORSE_PERCENT}%</span><br />
                                            <span className="font-medium text-amber-600">{formatCurrency((a.cost * HORSE_PERCENT) / 100)}</span>
                                          </td>
                                          <td className="px-3 py-2 text-center">
                                            <span className="text-gray-500 text-xs">{POOL_PERCENT}%</span><br />
                                            <span className="font-medium text-gray-500">{formatCurrency((a.cost * POOL_PERCENT) / 100)}</span>
                                          </td>
                                        </tr>
                                      ))}
                                      <tr className="font-bold text-gray-900 bg-gray-50 border-t-2 border-gray-300">
                                        <td className="px-3 py-2">รวมทั้งหมด</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(totalCost)}</td>
                                        {memberShares.map((m) => <td key={m.id} className="px-3 py-2 text-center" style={{ color: m.color }}>{formatCurrency(m.total)}</td>)}
                                        <td className="px-3 py-2 text-center text-amber-600">{formatCurrency(horseTotal)}</td>
                                        <td className="px-3 py-2 text-center text-gray-500">{formatCurrency(poolTotal)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>

                                {/* แผนการโอนเงินแยกรายงวด (ย้ายขึ้นมา) */}
                                <div className="bg-white rounded-lg border p-4">
                                  <h5 className="text-sm font-semibold text-gray-700 mb-3">แผนการโอนเงินแยกรายงวด</h5>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-left text-xs text-gray-500 border-b">
                                          <th className="px-3 py-2 font-medium">งวด</th>
                                          <th className="px-3 py-2 font-medium text-right">จำนวนเงิน</th>
                                          <th className="px-3 py-2 font-medium text-right">รับแล้ว</th>
                                          {MEMBERS.map((m) => <th key={m.id} className="px-3 py-2 font-medium text-center">{m.name}</th>)}
                                          <th className="px-3 py-2 font-medium text-center">ผู้จัดการ</th>
                                          <th className="px-3 py-2 font-medium text-center">กองกลาง</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {[...installments].sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0)).map((inst) => {
                                          const instPaid = projectPaymentsAll.filter((p) => p.installmentId === inst.id).reduce((s, p) => s + p.amount, 0);
                                          const instRatio = grandTotal > 0 ? inst.amount / grandTotal : 0;
                                          return (
                                            <tr key={inst.id} className="border-b border-gray-50">
                                              <td className="px-3 py-2 text-gray-700">งวดที่ {inst.installmentNumber}</td>
                                              <td className="px-3 py-2 text-right font-medium">{formatCurrency(inst.amount)}</td>
                                              <td className="px-3 py-2 text-right">
                                                <span className={instPaid >= inst.amount && inst.amount > 0 ? 'text-green-600 font-medium' : instPaid > 0 ? 'text-blue-600' : 'text-gray-400'}>{formatCurrency(instPaid)}</span>
                                              </td>
                                              {memberShares.map((m) => (
                                                <td key={m.id} className="px-3 py-2 text-center text-xs" style={{ color: m.color }}>{formatCurrency(m.total * instRatio)}</td>
                                              ))}
                                              <td className="px-3 py-2 text-center text-xs text-amber-600">{formatCurrency(horseTotal * instRatio)}</td>
                                              <td className="px-3 py-2 text-center text-xs text-gray-500">{formatCurrency(poolTotal * instRatio)}</td>
                                            </tr>
                                          );
                                        })}
                                        <tr className="font-bold text-gray-900 bg-gray-50 border-t-2 border-gray-300">
                                          <td className="px-3 py-2">รวม</td>
                                          <td className="px-3 py-2 text-right">{formatCurrency(totalInstallments)}</td>
                                          <td className="px-3 py-2 text-right text-green-600">{formatCurrency(totalPaidReal)}</td>
                                          {memberShares.map((m) => <td key={m.id} className="px-3 py-2 text-center" style={{ color: m.color }}>{formatCurrency(m.total)}</td>)}
                                          <td className="px-3 py-2 text-center text-amber-600">{formatCurrency(horseTotal)}</td>
                                          <td className="px-3 py-2 text-center text-gray-500">{formatCurrency(poolTotal)}</td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                {/* บันทึกการโอนเงินให้สมาชิก */}
                                <div className="bg-white rounded-lg border p-4">
                                  <div className="flex items-center justify-between mb-3">
                                    <h5 className="text-sm font-semibold text-gray-700">บันทึกการโอนเงินให้สมาชิก</h5>
                                    <button onClick={() => { setShowDistForm(project.id); setDistForm({ projectId: project.id, recipientId: '', amount: 0, paidDate: new Date().toISOString().split('T')[0], slipUrl: '', note: '' }); }} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"><Plus size={14} /> เพิ่มรายการโอน</button>
                                  </div>

                                  {showDistForm === project.id && (
                                    <div className="bg-gray-50 rounded-lg border p-4 mb-3">
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                                        <div>
                                          <label className="block text-xs text-gray-500 mb-1">ผู้รับเงิน *</label>
                                          <select value={distForm.recipientId} onChange={(e) => setDistForm({ ...distForm, recipientId: e.target.value as RecipientId })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500">
                                            <option value="">-- เลือกผู้รับเงิน --</option>
                                            {MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                            <option value="horse">ผู้จัดการ</option>
                                            <option value="pool">กองกลาง</option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="block text-xs text-gray-500 mb-1">จำนวนเงิน (บาท) *</label>
                                          <input type="number" value={distForm.amount || ''} onChange={(e) => setDistForm({ ...distForm, amount: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="0" />
                                        </div>
                                        <div>
                                          <label className="block text-xs text-gray-500 mb-1">วันที่โอน</label>
                                          <input type="date" value={distForm.paidDate} onChange={(e) => setDistForm({ ...distForm, paidDate: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500" />
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                        <div>
                                          <label className="block text-xs text-gray-500 mb-1">อัพโหลด Slip</label>
                                          <input type="file" accept="image/*" onChange={handleDistSlipUpload} className="w-full border rounded-lg px-3 py-1.5 text-sm outline-none file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-green-50 file:text-green-700" />
                                          {distForm.slipUrl && <img src={distForm.slipUrl} alt="slip" className="mt-2 h-16 rounded border" />}
                                        </div>
                                        <div>
                                          <label className="block text-xs text-gray-500 mb-1">หมายเหตุ</label>
                                          <input type="text" value={distForm.note} onChange={(e) => setDistForm({ ...distForm, note: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="หมายเหตุ..." />
                                        </div>
                                      </div>
                                      <div className="flex justify-end gap-2">
                                        <button onClick={() => setShowDistForm(null)} className="px-3 py-1.5 text-xs text-gray-600">ยกเลิก</button>
                                        <button onClick={() => handleSaveDistribution(project.id)} className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">บันทึก</button>
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
                                              {dist.slipUrl && (
                                                <button onClick={() => setViewSlipUrl(dist.slipUrl)} className="p-1 text-gray-400 hover:text-indigo-600" title="ดู Slip"><Image size={16} /></button>
                                              )}
                                              <button onClick={() => { if (confirm('ลบรายการนี้?')) deleteDistribution(dist.id); }} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
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
                                              <span>ผู้จัดการ</span>
                                              <span className={distByRecipient('horse') >= horseTotal && horseTotal > 0 ? 'text-green-600 font-medium' : ''}>{formatCurrency(distByRecipient('horse'))}/{formatCurrency(horseTotal)}</span>
                                            </div>
                                            <div className="flex justify-between bg-white rounded px-2 py-1">
                                              <span>กองกลาง</span>
                                              <span className={distByRecipient('pool') >= poolTotal && poolTotal > 0 ? 'text-green-600 font-medium' : ''}>{formatCurrency(distByRecipient('pool'))}/{formatCurrency(poolTotal)}</span>
                                            </div>
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

                {/* Slip viewer modal */}
                {viewSlipUrl && (
                  <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setViewSlipUrl(null)}>
                    <div className="bg-white rounded-xl shadow-xl max-w-lg max-h-[80vh] overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-gray-900">Slip การชำระเงิน</h3>
                        <button onClick={() => setViewSlipUrl(null)}><X size={18} className="text-gray-400" /></button>
                      </div>
                      <img src={viewSlipUrl} alt="Payment slip" className="w-full rounded-lg" />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
