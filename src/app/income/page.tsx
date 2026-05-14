'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { MEMBERS, RecipientId, ALL_SHARE_NAMES, getCommission, calcMemberNetIncome, calcHorseNetIncome, calcPoolNetIncome } from '@/types';
import { useHydrated } from '@/lib/useHydrated';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { Tooltip as InfoTip, TooltipRow } from '@/components/Tooltip';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Wallet, TrendingUp, CheckCircle2, X, Save, Banknote, Plus } from 'lucide-react';
import SlipUploader from '@/components/SlipUploader';

export default function IncomePage() {
  const hydrated = useHydrated();
  const { projects, payments, distributions, addDistribution } = useStore();

  // Distribution popup state
  const [distModal, setDistModal] = useState<{ recipientId: RecipientId; projectId: string; projectName: string; maxAmount: number } | null>(null);
  const [distForm, setDistForm] = useState({ amount: 0, paidDate: '', slipUrl: '', slipUrls: [] as string[], note: '' });
  const [viewSlipUrl, setViewSlipUrl] = useState<string | null>(null);

  // Bulk-distribute state
  type BulkProject = { projectId: string; projectName: string; client: string; outstanding: number };
  const [bulkModal, setBulkModal] = useState<{ recipientId: RecipientId; recipientName: string; projects: BulkProject[]; selected: Record<string, boolean>; paidDate: string } | null>(null);
  const openBulkDistModal = (recipientId: RecipientId, recipientName: string, projects: { projectId: string; projectName: string; client: string; outstanding: number }[]) => {
    const today = new Date();
    const dStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const selected: Record<string, boolean> = {};
    projects.forEach((p) => { selected[p.projectId] = true; });
    setBulkModal({ recipientId, recipientName, projects, selected, paidDate: dStr });
  };
  const handleBulkSubmit = () => {
    if (!bulkModal) return;
    const picked = bulkModal.projects.filter((p) => bulkModal.selected[p.projectId]);
    if (picked.length === 0) {
      toast.error('กรุณาเลือกอย่างน้อย 1 โครงการ');
      return;
    }
    picked.forEach((p) => {
      addDistribution({
        projectId: p.projectId,
        recipientId: bulkModal.recipientId,
        amount: Math.round(p.outstanding * 100) / 100,
        paidDate: bulkModal.paidDate,
        slipUrl: '',
        slipUrls: [],
        note: '',
      });
    });
    const total = picked.reduce((s, p) => s + p.outstanding, 0);
    toast.success(`โอน ${formatCurrency(total)} ให้ ${bulkModal.recipientName} ใน ${picked.length} โครงการเรียบร้อย`);
    setBulkModal(null);
  };

  const openDistModal = (recipientId: RecipientId, projectId: string, projectName: string, maxAmount: number) => {
    const today = new Date();
    const dStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setDistModal({ recipientId, projectId, projectName, maxAmount });
    setDistForm({ amount: maxAmount > 0 ? Math.round(maxAmount * 100) / 100 : 0, paidDate: dStr, slipUrl: '', slipUrls: [], note: '' });
  };

  const handleSaveDist = () => {
    if (!distModal) return;
    if (!distForm.amount || distForm.amount <= 0) {
      toast.error('กรุณาระบุจำนวนเงิน');
      return;
    }
    addDistribution({
      projectId: distModal.projectId,
      recipientId: distModal.recipientId,
      amount: distForm.amount,
      paidDate: distForm.paidDate,
      slipUrl: distForm.slipUrl,
      slipUrls: distForm.slipUrls,
      note: distForm.note,
    });
    toast.success(`บันทึกการโอน ${formatCurrency(distForm.amount)} ให้ ${ALL_SHARE_NAMES[distModal.recipientId]} เรียบร้อย`);
    setDistModal(null);
  };

  if (!hydrated) return <div className="flex items-center justify-center h-64 text-gray-400">กำลังโหลด...</div>;

  const filteredProjects = projects;

  // รายรับที่คาดว่าจะได้ (จากกิจกรรม) — ใช้ NET (หลังหัก commission)
  const memberIncomes = MEMBERS.map((member) => {
    const expectedIncome = filteredProjects.reduce((total, project) => total + calcMemberNetIncome(project, member.id), 0);

    // รายรับจริงที่ได้รับ (จาก distributions)
    const actualIncome = distributions
      .filter((d) => d.recipientId === member.id && filteredProjects.some((p) => p.id === d.projectId))
      .reduce((s, d) => s + d.amount, 0);

    const projectBreakdown = filteredProjects.map((project) => {
      const expected = calcMemberNetIncome(project, member.id);
      const actual = distributions
        .filter((d) => d.recipientId === member.id && d.projectId === project.id)
        .reduce((s, d) => s + d.amount, 0);
      // คำนวณ "ต้องโอน" จากสัดส่วนเงินที่ลูกค้าชำระแล้ว
      const projectGrandTotal = project.activities.reduce((s, a) => s + a.cost, 0);
      const clientPaid = payments.filter((p) => p.projectId === project.id).reduce((s, p) => s + p.amount, 0);
      const paidRatio = projectGrandTotal > 0 ? clientPaid / projectGrandTotal : 0;
      const shouldPay = expected * paidRatio;
      const diff = shouldPay - actual; // บวก = ค้าง, ลบ = เกิน
      const outstanding = Math.max(0, diff);
      const overpaid = Math.max(0, -diff);
      return { projectId: project.id, projectName: project.name, client: project.client, expected, actual, shouldPay, outstanding, overpaid };
    }).filter((p) => p.expected > 0 || p.actual > 0);

    // คงค้าง = ผลรวม "ต้องโอน − โอนแล้ว" รายโครงการ (คิดเฉพาะที่ลูกค้าชำระมาแล้ว)
    const outstandingPayable = projectBreakdown.reduce((s, p) => s + p.outstanding, 0);
    const shouldPayTotal = projectBreakdown.reduce((s, p) => s + p.shouldPay, 0);

    return { ...member, expectedIncome, actualIncome, projectBreakdown, outstandingPayable, shouldPayTotal };
  });

  // Helper: คำนวณ "ต้องโอน" รวมของ recipient (horse/pool/commission) ตามสัดส่วน client paid
  const computeRecipientStats = (getExpected: (p: typeof filteredProjects[number]) => number, rid: RecipientId) => {
    let expected = 0;
    let actual = 0;
    let shouldPay = 0;
    for (const project of filteredProjects) {
      const exp = getExpected(project);
      expected += exp;
      const act = distributions
        .filter((d) => d.recipientId === rid && d.projectId === project.id)
        .reduce((s, d) => s + d.amount, 0);
      actual += act;
      const projectGrandTotal = project.activities.reduce((s, a) => s + a.cost, 0);
      const clientPaid = payments.filter((p) => p.projectId === project.id).reduce((s, p) => s + p.amount, 0);
      const paidRatio = projectGrandTotal > 0 ? clientPaid / projectGrandTotal : 0;
      shouldPay += exp * paidRatio;
    }
    const outstandingPayable = Math.max(0, shouldPay - actual);
    return { expected, actual, shouldPay, outstandingPayable };
  };

  // Manager + Pool money — ใช้ NET (หลังหัก commission)
  const horseStats = computeRecipientStats(calcHorseNetIncome, 'horse');
  const horseExpected = horseStats.expected;
  const horseActual = horseStats.actual;
  const horseOutstandingPayable = horseStats.outstandingPayable;

  const poolStats = computeRecipientStats(calcPoolNetIncome, 'pool');
  const poolExpected = poolStats.expected;
  const poolActual = poolStats.actual;
  const poolOutstandingPayable = poolStats.outstandingPayable;

  // Commission — รวมรายโครงการ (one-time)
  const commissionStats = computeRecipientStats((p) => getCommission(p), 'commission');
  const commissionExpected = commissionStats.expected;
  const commissionActual = commissionStats.actual;
  const commissionOutstandingPayable = commissionStats.outstandingPayable;

  const grandExpected = memberIncomes.reduce((sum, m) => sum + m.expectedIncome, 0) + horseExpected + poolExpected + commissionExpected;
  const grandActual = memberIncomes.reduce((sum, m) => sum + m.actualIncome, 0) + horseActual + poolActual + commissionActual;

  // เงินที่ลูกค้าชำระมาแล้ว
  const totalClientPaid = filteredProjects.reduce((s, p) => {
    return s + payments.filter((pay) => pay.projectId === p.id).reduce((ps, pay) => ps + pay.amount, 0);
  }, 0);

  const chartData = [
    ...memberIncomes.map((m) => ({
      name: m.name,
      actual: m.actualIncome,
      remaining: Math.max(0, m.expectedIncome - m.actualIncome),
      total: m.expectedIncome,
      color: m.color,
    })),
    {
      name: 'Manager',
      actual: horseActual,
      remaining: Math.max(0, horseExpected - horseActual),
      total: horseExpected,
      color: '#f59e0b',
    },
    {
      name: 'Pool money',
      actual: poolActual,
      remaining: Math.max(0, poolExpected - poolActual),
      total: poolExpected,
      color: '#6b7280',
    },
    ...(commissionExpected > 0 ? [{
      name: 'Commission',
      actual: commissionActual,
      remaining: Math.max(0, commissionExpected - commissionActual),
      total: commissionExpected,
      color: '#e11d48',
    }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Member Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {memberIncomes.map((member) => (
          <div key={member.id} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-5 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: `linear-gradient(to bottom, ${member.color}, ${member.color}88)` }} />
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: member.color }}>
                {member.shortName}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{member.name}</p>
                <p className="text-xs text-gray-500">{member.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={14} className="text-green-500" />
              <span className="text-xs text-gray-500">รับจริง</span>
              <span className="text-lg font-bold text-green-600 ml-auto">{formatCurrency(member.actualIncome)}</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-gray-400" />
              <InfoTip
                content={(
                  <div className="space-y-1 min-w-[200px]">
                    <p className="font-medium text-white mb-1">คาดว่าจะได้</p>
                    <p className="text-gray-300">ส่วนแบ่งสุทธิทั้งหมดของ {member.name} จากทุกโครงการ (รวมที่ลูกค้ายังไม่จ่ายมา)</p>
                  </div>
                )}
              >
                <span className="text-xs text-gray-500 underline decoration-dotted underline-offset-2 cursor-help">คาดว่าจะได้</span>
              </InfoTip>
              <span className="text-sm font-medium text-gray-500 ml-auto">{formatCurrency(member.expectedIncome)}</span>
            </div>
            {(() => {
              const outstanding = member.outstandingPayable;
              const futureRemaining = Math.max(0, member.expectedIncome - member.actualIncome - outstanding); // ส่วนที่รอลูกค้าจ่ายอีก
              const breakdown = (
                <div className="space-y-1 min-w-[240px]">
                  <p className="font-medium text-white mb-1.5 border-b border-gray-700 pb-1">คงค้าง — รายละเอียด</p>
                  <p className="text-[11px] text-gray-400 mb-1">คิดจากที่ลูกค้าจ่ายเข้ามาเท่านั้น</p>
                  <TooltipRow label={`ลูกค้าจ่ายแล้ว → ส่วนของ ${member.name}`} value={formatCurrency(member.shouldPayTotal)} />
                  <TooltipRow label="โอนให้สมาชิกแล้ว" value={formatCurrency(member.actualIncome)} accent="green" />
                  <TooltipRow label="คงค้าง (ที่ต้องโอนตอนนี้)" value={formatCurrency(outstanding)} accent={outstanding > 0 ? 'amber' : 'green'} />
                  {futureRemaining > 0 && <TooltipRow label="รอลูกค้าจ่ายอีก" value={formatCurrency(futureRemaining)} accent="gray" />}
                </div>
              );
              return outstanding > 0 ? (
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-3.5 h-3.5 inline-block" />
                  <InfoTip content={breakdown}>
                    <span className="text-xs text-amber-600 underline decoration-dotted underline-offset-2 cursor-help">คงค้าง</span>
                  </InfoTip>
                  <span className="text-sm font-semibold text-amber-600 ml-auto">{formatCurrency(outstanding)}</span>
                </div>
              ) : member.expectedIncome > 0 && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-3.5 h-3.5 inline-block" />
                  <InfoTip content={breakdown}>
                    <span className="text-xs text-green-600 underline decoration-dotted underline-offset-2 cursor-help">✅ โอนครบตามยอด</span>
                  </InfoTip>
                </div>
              );
            })()}
            {member.expectedIncome > 0 && (
              <div className="mt-2">
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.round((member.actualIncome / member.expectedIncome) * 100))}%` }} />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-400">{member.projectBreakdown.length} โครงการ</p>
              {(() => {
                const outstandingProjects = member.projectBreakdown.filter((p) => p.outstanding > 0);
                if (outstandingProjects.length === 0) return null;
                return (
                  <button
                    onClick={() => openBulkDistModal(member.id, member.name, outstandingProjects)}
                    className="text-xs px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium"
                    title={`โอนยอดคงค้างให้ ${member.name} ${outstandingProjects.length} โครงการ`}
                  >
                    โอนทั้งหมด ({outstandingProjects.length})
                  </button>
                );
              })()}
            </div>
          </div>
        ))}
      </div>

      {/* Horse + Pool + Commission */}
      {(() => {
        const renderRecipientCard = (
          name: string,
          actual: number,
          expected: number,
          outstanding: number,
          colorClass: { bg: string; text: string; strong: string; expectedText: string },
        ) => {
          const futureRemaining = Math.max(0, expected - actual - outstanding);
          const shouldPay = actual + outstanding;
          const breakdown = (
            <div className="space-y-1 min-w-[240px]">
              <p className="font-medium text-white mb-1.5 border-b border-gray-700 pb-1">{name} — รายละเอียด</p>
              <p className="text-[11px] text-gray-400 mb-1">คงค้างคิดจากที่ลูกค้าจ่ายเข้ามาเท่านั้น</p>
              <TooltipRow label="ลูกค้าจ่ายแล้ว → ส่วนของ ผู้รับ" value={formatCurrency(shouldPay)} />
              <TooltipRow label="โอนแล้ว" value={formatCurrency(actual)} accent="green" />
              <TooltipRow label="คงค้าง" value={formatCurrency(outstanding)} accent={outstanding > 0 ? 'amber' : 'green'} />
              {futureRemaining > 0 && <TooltipRow label="รอลูกค้าจ่ายอีก" value={formatCurrency(futureRemaining)} accent="gray" />}
              <TooltipRow label="รวมคาดว่าจะได้" value={formatCurrency(expected)} />
            </div>
          );
          return (
            <div className={`${colorClass.bg} rounded-xl border p-4 shadow-sm`}>
              <div className="flex items-center justify-between mb-2">
                <p className={`font-medium ${colorClass.strong}`}>{name}</p>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className={colorClass.text}>รับจริง: <strong className="text-green-600">{formatCurrency(actual)}</strong></span>
                <InfoTip content={breakdown}>
                  <span className={`${colorClass.expectedText} underline decoration-dotted underline-offset-2 cursor-help`}>
                    คาดว่าจะได้: <strong>{formatCurrency(expected)}</strong>
                  </span>
                </InfoTip>
              </div>
              {outstanding > 0 && (
                <div className={`mt-1.5 text-xs ${colorClass.text} font-medium`}>
                  <InfoTip content={breakdown}>
                    <span className="underline decoration-dotted underline-offset-2 cursor-help">คงค้าง:</span>
                  </InfoTip> {formatCurrency(outstanding)}
                </div>
              )}
            </div>
          );
        };
        return (
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${commissionExpected > 0 ? 'lg:grid-cols-3' : ''} gap-4`}>
            {renderRecipientCard('Manager', horseActual, horseExpected, horseOutstandingPayable, {
              bg: 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200',
              text: 'text-amber-700',
              strong: 'text-amber-900',
              expectedText: 'text-amber-600',
            })}
            {renderRecipientCard('Pool money', poolActual, poolExpected, poolOutstandingPayable, {
              bg: 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200',
              text: 'text-gray-700',
              strong: 'text-gray-900',
              expectedText: 'text-gray-600',
            })}
            {commissionExpected > 0 && renderRecipientCard('Commission', commissionActual, commissionExpected, commissionOutstandingPayable, {
              bg: 'bg-gradient-to-r from-rose-50 to-pink-50 border-rose-200',
              text: 'text-rose-700',
              strong: 'text-rose-900',
              expectedText: 'text-rose-600',
            })}
          </div>
        );
      })()}

      {/* Grand Total */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 size={20} className="text-green-600" />
            <span className="text-sm text-green-800">ลูกค้าชำระแล้ว</span>
          </div>
          <span className="text-2xl font-bold text-green-700">{formatCurrency(totalClientPaid)}</span>
        </div>
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={20} className="text-blue-600" />
            <span className="text-sm text-blue-800">โอนให้สมาชิกแล้ว</span>
          </div>
          <span className="text-2xl font-bold text-blue-700">{formatCurrency(grandActual)}</span>
        </div>
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={20} className="text-indigo-600" />
            <span className="text-sm text-indigo-800">รายได้คาดว่าจะได้ทั้งหมด</span>
          </div>
          <span className="text-2xl font-bold text-indigo-700">{formatCurrency(grandExpected)}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
        <h2 className="font-semibold text-gray-900 mb-4">เปรียบเทียบรายได้ (รับจริง vs คาดว่าจะได้)</h2>
        {chartData.some((d) => d.total > 0 || d.actual > 0) ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" fontSize={12} width={80} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend />
              <Bar dataKey="actual" name="รับจริง" stackId="income" fill="#22c55e" barSize={28} radius={[6, 0, 0, 6]} />
              <Bar dataKey="remaining" name="คงเหลือ" stackId="income" fill="#e5e7eb" barSize={28} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">ยังไม่มีข้อมูลรายได้</div>
        )}
      </div>

      {/* Detailed Breakdown */}
      {memberIncomes.map((member) => (
        <div key={member.id} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: member.color }}>{member.shortName}</div>
            <div>
              <h3 className="font-semibold text-gray-900">{member.name}</h3>
              <p className="text-xs text-gray-500">{member.role}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-sm font-bold text-green-600">รับจริง {formatCurrency(member.actualIncome)}</p>
              <p className="text-xs text-gray-500">คาดว่าจะได้ {formatCurrency(member.expectedIncome)}</p>
            </div>
          </div>
          {member.projectBreakdown.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 bg-gray-50">
                    <th className="px-5 py-2 font-medium">โครงการ</th>
                    <th className="px-5 py-2 font-medium">ผู้วิจัย</th>
                    <th className="px-5 py-2 font-medium text-right">คาดว่าจะได้</th>
                    <th className="px-5 py-2 font-medium text-right">ต้องโอน</th>
                    <th className="px-5 py-2 font-medium text-right">โอนแล้ว</th>
                    <th className="px-5 py-2 font-medium text-right">คงค้าง</th>
                  </tr>
                </thead>
                <tbody>
                  {member.projectBreakdown.map((pb) => (
                    <tr
                      key={pb.projectId}
                      onClick={() => openDistModal(member.id, pb.projectId, pb.projectName, pb.outstanding)}
                      className="border-t border-gray-50 hover:bg-indigo-50/40 cursor-pointer transition-colors"
                      title="คลิกเพื่อเพิ่มการโอนเงิน"
                    >
                      <td className="px-5 py-2.5 text-gray-700">{pb.projectName}</td>
                      <td className="px-5 py-2.5 text-gray-500">{pb.client || '-'}</td>
                      <td className="px-5 py-2.5 text-right text-gray-500">{formatCurrency(pb.expected)}</td>
                      <td className="px-5 py-2.5 text-right text-blue-600 font-medium">{formatCurrency(pb.shouldPay)}</td>
                      <td className="px-5 py-2.5 text-right text-green-600 font-medium">{formatCurrency(pb.actual)}</td>
                      <td className="px-5 py-2.5 text-right">
                        {pb.overpaid > 0 ? (
                          <span className="text-orange-600 font-medium" title="โอนเกินจำนวนที่ต้องโอน">
                            ⚠ เกิน {formatCurrency(pb.overpaid)}
                          </span>
                        ) : pb.outstanding <= 0 ? (
                          <span className="text-green-600 font-medium">✅ ครบ</span>
                        ) : (
                          <span className="text-red-500 font-medium">{formatCurrency(pb.outstanding)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-5 text-gray-400 text-sm text-center">ยังไม่มีรายได้</p>
          )}
        </div>
      ))}

      {/* Manager Breakdown */}
      {(() => {
        const horseBreakdown = filteredProjects.map((project) => {
          const expected = calcHorseNetIncome(project);
          const actual = distributions.filter((d) => d.recipientId === 'horse' && d.projectId === project.id).reduce((s, d) => s + d.amount, 0);
          const projectGrandTotal = project.activities.reduce((s, a) => s + a.cost, 0);
          const clientPaid = payments.filter((p) => p.projectId === project.id).reduce((s, p) => s + p.amount, 0);
          const paidRatio = projectGrandTotal > 0 ? clientPaid / projectGrandTotal : 0;
          const shouldPay = expected * paidRatio;
          const diff = shouldPay - actual;
          const outstanding = Math.max(0, diff);
          const overpaid = Math.max(0, -diff);
          return { projectId: project.id, projectName: project.name, client: project.client, expected, actual, shouldPay, outstanding, overpaid };
        }).filter((p) => p.expected > 0 || p.actual > 0);

        return (
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-white flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs bg-amber-500">MG</div>
              <div>
                <h3 className="font-semibold text-gray-900">Manager</h3>
                <p className="text-xs text-gray-500">หักอัตโนมัติจากทุกกิจกรรม</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-sm font-bold text-green-600">รับจริง {formatCurrency(horseActual)}</p>
                <p className="text-xs text-gray-500">คาดว่าจะได้ {formatCurrency(horseExpected)}</p>
              </div>
            </div>
            {horseBreakdown.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 bg-gray-50">
                      <th className="px-5 py-2 font-medium">โครงการ</th>
                      <th className="px-5 py-2 font-medium">ผู้วิจัย</th>
                      <th className="px-5 py-2 font-medium text-right">คาดว่าจะได้</th>
                      <th className="px-5 py-2 font-medium text-right">ต้องโอน</th>
                      <th className="px-5 py-2 font-medium text-right">โอนแล้ว</th>
                      <th className="px-5 py-2 font-medium text-right">คงค้าง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {horseBreakdown.map((pb) => (
                      <tr
                        key={pb.projectId}
                        onClick={() => openDistModal('horse', pb.projectId, pb.projectName, pb.outstanding)}
                        className="border-t border-gray-50 hover:bg-amber-50/60 cursor-pointer transition-colors"
                        title="คลิกเพื่อเพิ่มการโอนเงิน"
                      >
                        <td className="px-5 py-2.5 text-gray-700">{pb.projectName}</td>
                        <td className="px-5 py-2.5 text-gray-500">{pb.client || '-'}</td>
                        <td className="px-5 py-2.5 text-right text-gray-500">{formatCurrency(pb.expected)}</td>
                        <td className="px-5 py-2.5 text-right text-blue-600 font-medium">{formatCurrency(pb.shouldPay)}</td>
                        <td className="px-5 py-2.5 text-right text-green-600 font-medium">{formatCurrency(pb.actual)}</td>
                        <td className="px-5 py-2.5 text-right">
                          {pb.overpaid > 0 ? (
                            <span className="text-orange-600 font-medium" title="โอนเกินจำนวนที่ต้องโอน">
                              ⚠ เกิน {formatCurrency(pb.overpaid)}
                            </span>
                          ) : pb.outstanding <= 0 ? (
                            <span className="text-green-600 font-medium">✅ ครบ</span>
                          ) : (
                            <span className="text-red-500 font-medium">{formatCurrency(pb.outstanding)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-5 text-gray-400 text-sm text-center">ยังไม่มีรายได้</p>
            )}
          </div>
        );
      })()}

      {/* Pool money Breakdown */}
      {(() => {
        const poolBreakdown = filteredProjects.map((project) => {
          const expected = calcPoolNetIncome(project);
          const actual = distributions.filter((d) => d.recipientId === 'pool' && d.projectId === project.id).reduce((s, d) => s + d.amount, 0);
          const projectGrandTotal = project.activities.reduce((s, a) => s + a.cost, 0);
          const clientPaid = payments.filter((p) => p.projectId === project.id).reduce((s, p) => s + p.amount, 0);
          const paidRatio = projectGrandTotal > 0 ? clientPaid / projectGrandTotal : 0;
          const shouldPay = expected * paidRatio;
          const diff = shouldPay - actual;
          const outstanding = Math.max(0, diff);
          const overpaid = Math.max(0, -diff);
          return { projectId: project.id, projectName: project.name, client: project.client, expected, actual, shouldPay, outstanding, overpaid };
        }).filter((p) => p.expected > 0 || p.actual > 0);

        return (
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs bg-gray-500">PM</div>
              <div>
                <h3 className="font-semibold text-gray-900">Pool money</h3>
                <p className="text-xs text-gray-500">หักอัตโนมัติจากทุกกิจกรรม</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-sm font-bold text-green-600">รับจริง {formatCurrency(poolActual)}</p>
                <p className="text-xs text-gray-500">คาดว่าจะได้ {formatCurrency(poolExpected)}</p>
              </div>
            </div>
            {poolBreakdown.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 bg-gray-50">
                      <th className="px-5 py-2 font-medium">โครงการ</th>
                      <th className="px-5 py-2 font-medium">ผู้วิจัย</th>
                      <th className="px-5 py-2 font-medium text-right">คาดว่าจะได้</th>
                      <th className="px-5 py-2 font-medium text-right">ต้องโอน</th>
                      <th className="px-5 py-2 font-medium text-right">โอนแล้ว</th>
                      <th className="px-5 py-2 font-medium text-right">คงค้าง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poolBreakdown.map((pb) => (
                      <tr
                        key={pb.projectId}
                        onClick={() => openDistModal('pool', pb.projectId, pb.projectName, pb.outstanding)}
                        className="border-t border-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
                        title="คลิกเพื่อเพิ่มการโอนเงิน"
                      >
                        <td className="px-5 py-2.5 text-gray-700">{pb.projectName}</td>
                        <td className="px-5 py-2.5 text-gray-500">{pb.client || '-'}</td>
                        <td className="px-5 py-2.5 text-right text-gray-500">{formatCurrency(pb.expected)}</td>
                        <td className="px-5 py-2.5 text-right text-blue-600 font-medium">{formatCurrency(pb.shouldPay)}</td>
                        <td className="px-5 py-2.5 text-right text-green-600 font-medium">{formatCurrency(pb.actual)}</td>
                        <td className="px-5 py-2.5 text-right">
                          {pb.overpaid > 0 ? (
                            <span className="text-orange-600 font-medium" title="โอนเกินจำนวนที่ต้องโอน">
                              ⚠ เกิน {formatCurrency(pb.overpaid)}
                            </span>
                          ) : pb.outstanding <= 0 ? (
                            <span className="text-green-600 font-medium">✅ ครบ</span>
                          ) : (
                            <span className="text-red-500 font-medium">{formatCurrency(pb.outstanding)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-5 text-gray-400 text-sm text-center">ยังไม่มีรายได้</p>
            )}
          </div>
        );
      })()}

      {/* Distribution Modal — เพิ่มการโอนเงินให้สมาชิก */}
      {distModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-xl">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow">
                  <Banknote size={18} className="text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">เพิ่มการโอนเงิน</h2>
                  <p className="text-xs text-gray-500">{ALL_SHARE_NAMES[distModal.recipientId]} — {distModal.projectName}</p>
                </div>
              </div>
              <button onClick={() => setDistModal(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-white/60">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {distModal.maxAmount > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm flex items-center justify-between">
                  <span className="text-blue-700">คงค้างที่ต้องโอน</span>
                  <strong className="text-blue-800">{formatCurrency(distModal.maxAmount)}</strong>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท) *</label>
                  <input
                    type="number"
                    min={0}
                    value={distForm.amount || ''}
                    onChange={(e) => setDistForm({ ...distForm, amount: Number(e.target.value) })}
                    className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500 ${distForm.amount > 0 ? '' : 'border-amber-300 bg-amber-50/40'}`}
                    placeholder="0"
                  />
                  {(!distForm.amount || distForm.amount <= 0) && (
                    <p className="text-xs text-amber-600 mt-1">กรุณาระบุจำนวนเงินที่มากกว่า 0</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่โอน</label>
                  <input
                    type="date"
                    value={distForm.paidDate}
                    onChange={(e) => setDistForm({ ...distForm, paidDate: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">อัพโหลด Slip</label>
                <SlipUploader
                  values={distForm.slipUrls}
                  onChange={(urls) => setDistForm({ ...distForm, slipUrls: urls, slipUrl: urls[0] || '' })}
                  onPreview={(url) => setViewSlipUrl(url)}
                  color="green"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
                <input
                  type="text"
                  value={distForm.note}
                  onChange={(e) => setDistForm({ ...distForm, note: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="หมายเหตุเพิ่มเติม..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setDistModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">ยกเลิก</button>
              <button
                onClick={handleSaveDist}
                disabled={!distForm.amount || distForm.amount <= 0}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-sm font-medium hover:from-green-700 hover:to-emerald-700 shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-500"
              >
                <Save size={16} /> บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk distribute modal */}
      <Modal
        open={!!bulkModal}
        onClose={() => setBulkModal(null)}
        size="lg"
        title={bulkModal ? `โอนยอดคงค้างให้ ${bulkModal.recipientName}` : ''}
        description={bulkModal ? `เลือกโครงการที่ต้องการบันทึกการโอน (${bulkModal.projects.length} โครงการมีคงค้าง)` : ''}
        footer={bulkModal ? (
          <>
            <button onClick={() => setBulkModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">ยกเลิก</button>
            <button
              onClick={handleBulkSubmit}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-sm font-medium hover:from-green-700 hover:to-emerald-700 shadow"
            >
              <Save size={16} /> บันทึกการโอน
            </button>
          </>
        ) : undefined}
      >
        {bulkModal && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">วันที่โอน:</label>
              <input
                type="date"
                value={bulkModal.paidDate}
                onChange={(e) => setBulkModal({ ...bulkModal, paidDate: e.target.value })}
                className="border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
              />
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setBulkModal({ ...bulkModal, selected: Object.fromEntries(bulkModal.projects.map((p) => [p.projectId, true])) })}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  เลือกทั้งหมด
                </button>
                <span className="text-xs text-gray-300">|</span>
                <button
                  onClick={() => setBulkModal({ ...bulkModal, selected: {} })}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                >
                  ล้าง
                </button>
              </div>
            </div>
            <div className="border rounded-lg max-h-[50vh] overflow-y-auto">
              {bulkModal.projects.map((p) => {
                const checked = !!bulkModal.selected[p.projectId];
                return (
                  <label
                    key={p.projectId}
                    className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 ${checked ? 'bg-indigo-50/40' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setBulkModal({ ...bulkModal, selected: { ...bulkModal.selected, [p.projectId]: e.target.checked } })}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{p.projectName}</p>
                      <p className="text-xs text-gray-500 truncate">{p.client || '(ไม่ระบุผู้วิจัย)'}</p>
                    </div>
                    <span className="text-sm font-semibold text-amber-600 flex-shrink-0">{formatCurrency(p.outstanding)}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex items-center justify-between bg-indigo-50 rounded-lg px-3 py-2">
              <span className="text-sm text-indigo-700">รวมที่จะโอน:</span>
              <span className="text-lg font-bold text-indigo-700">
                {formatCurrency(bulkModal.projects.filter((p) => bulkModal.selected[p.projectId]).reduce((s, p) => s + p.outstanding, 0))}
              </span>
            </div>
          </div>
        )}
      </Modal>

      {/* Slip viewer */}
      {viewSlipUrl && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl max-h-[90vh] overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-gray-900">Slip</h3>
              <button onClick={() => setViewSlipUrl(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewSlipUrl} alt="Slip" className="w-full rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
