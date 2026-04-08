'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { MEMBERS, HORSE_PERCENT, POOL_PERCENT, RecipientId, ALL_SHARE_NAMES, getHorsePercent, getPoolPercent } from '@/types';
import { useHydrated } from '@/lib/useHydrated';
import { formatCurrency } from '@/lib/utils';
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
import { Wallet, Filter, TrendingUp, CheckCircle2, X, Save, Banknote, Plus } from 'lucide-react';
import SlipUploader from '@/components/SlipUploader';

export default function IncomePage() {
  const hydrated = useHydrated();
  const { projects, payments, distributions, addDistribution } = useStore();
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Distribution popup state
  const [distModal, setDistModal] = useState<{ recipientId: RecipientId; projectId: string; projectName: string; maxAmount: number } | null>(null);
  const [distForm, setDistForm] = useState({ amount: 0, paidDate: '', slipUrl: '', slipUrls: [] as string[], note: '' });
  const [viewSlipUrl, setViewSlipUrl] = useState<string | null>(null);

  const openDistModal = (recipientId: RecipientId, projectId: string, projectName: string, maxAmount: number) => {
    const today = new Date();
    const dStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setDistModal({ recipientId, projectId, projectName, maxAmount });
    setDistForm({ amount: maxAmount > 0 ? Math.round(maxAmount * 100) / 100 : 0, paidDate: dStr, slipUrl: '', slipUrls: [], note: '' });
  };

  const handleSaveDist = () => {
    if (!distModal) return;
    if (!distForm.amount || distForm.amount <= 0) {
      alert('กรุณาระบุจำนวนเงิน');
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
    setDistModal(null);
  };

  if (!hydrated) return <div className="flex items-center justify-center h-64 text-gray-400">กำลังโหลด...</div>;

  const filteredProjects = filterStatus === 'all'
    ? projects
    : projects.filter((p) => p.status === filterStatus);

  // รายรับที่คาดว่าจะได้ (จากกิจกรรม)
  const memberIncomes = MEMBERS.map((member) => {
    const expectedIncome = filteredProjects.reduce((total, project) => {
      return total + project.activities.reduce((actTotal, activity) => {
        return actTotal + (activity.cost * (activity.sharePercent[member.id] || 0)) / 100;
      }, 0);
    }, 0);

    // รายรับจริงที่ได้รับ (จาก distributions)
    const actualIncome = distributions
      .filter((d) => d.recipientId === member.id && filteredProjects.some((p) => p.id === d.projectId))
      .reduce((s, d) => s + d.amount, 0);

    const projectBreakdown = filteredProjects.map((project) => {
      const expected = project.activities.reduce((actTotal, activity) => {
        return actTotal + (activity.cost * (activity.sharePercent[member.id] || 0)) / 100;
      }, 0);
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

    return { ...member, expectedIncome, actualIncome, projectBreakdown };
  });

  // ผู้จัดการ + กองกลาง
  const horseExpected = filteredProjects.reduce((total, project) => {
    return total + project.activities.reduce((actTotal, activity) => actTotal + (activity.cost * getHorsePercent(activity)) / 100, 0);
  }, 0);
  const horseActual = distributions
    .filter((d) => d.recipientId === 'horse' && filteredProjects.some((p) => p.id === d.projectId))
    .reduce((s, d) => s + d.amount, 0);

  const poolExpected = filteredProjects.reduce((total, project) => {
    return total + project.activities.reduce((actTotal, activity) => actTotal + (activity.cost * getPoolPercent(activity)) / 100, 0);
  }, 0);
  const poolActual = distributions
    .filter((d) => d.recipientId === 'pool' && filteredProjects.some((p) => p.id === d.projectId))
    .reduce((s, d) => s + d.amount, 0);

  const grandExpected = memberIncomes.reduce((sum, m) => sum + m.expectedIncome, 0) + horseExpected + poolExpected;
  const grandActual = memberIncomes.reduce((sum, m) => sum + m.actualIncome, 0) + horseActual + poolActual;

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
      name: 'ผู้จัดการ',
      actual: horseActual,
      remaining: Math.max(0, horseExpected - horseActual),
      total: horseExpected,
      color: '#f59e0b',
    },
    {
      name: 'กองกลาง',
      actual: poolActual,
      remaining: Math.max(0, poolExpected - poolActual),
      total: poolExpected,
      color: '#6b7280',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">รายได้</h1>
          <p className="text-gray-500 text-sm mt-1">รายรับจริงที่ชำระแล้ว กับรายรับที่คาดว่าจะได้ (หักผู้จัดการ + กองกลาง รายกิจกรรม)</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="all">ทุกสถานะ</option>
            <option value="completed">เสร็จสิ้นแล้ว</option>
            <option value="in_progress">กำลังดำเนินการ</option>
            <option value="pending">รอดำเนินการ</option>
          </select>
        </div>
      </div>

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
              <span className="text-xs text-gray-500">คาดว่าจะได้</span>
              <span className="text-sm font-medium text-gray-500 ml-auto">{formatCurrency(member.expectedIncome)}</span>
            </div>
            {member.expectedIncome > 0 && (
              <div className="mt-2">
                <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                  <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.round((member.actualIncome / member.expectedIncome) * 100))}%` }} />
                </div>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">{member.projectBreakdown.length} โครงการ</p>
          </div>
        ))}
      </div>

      {/* Horse + Pool */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-amber-900">ผู้จัดการ</p>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-amber-700">รับจริง: <strong className="text-green-600">{formatCurrency(horseActual)}</strong></span>
            <span className="text-amber-600">คาดว่าจะได้: <strong>{formatCurrency(horseExpected)}</strong></span>
          </div>
        </div>
        <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-gray-900">กองกลาง</p>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700">รับจริง: <strong className="text-green-600">{formatCurrency(poolActual)}</strong></span>
            <span className="text-gray-600">คาดว่าจะได้: <strong>{formatCurrency(poolExpected)}</strong></span>
          </div>
        </div>
      </div>

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

      {/* ผู้จัดการ Breakdown */}
      {(() => {
        const horseBreakdown = filteredProjects.map((project) => {
          const expected = project.activities.reduce((s, a) => s + (a.cost * getHorsePercent(a)) / 100, 0);
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
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs bg-amber-500">ผจก</div>
              <div>
                <h3 className="font-semibold text-gray-900">ผู้จัดการ</h3>
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

      {/* กองกลาง Breakdown */}
      {(() => {
        const poolBreakdown = filteredProjects.map((project) => {
          const expected = project.activities.reduce((s, a) => s + (a.cost * getPoolPercent(a)) / 100, 0);
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
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs bg-gray-500">กก</div>
              <div>
                <h3 className="font-semibold text-gray-900">กองกลาง</h3>
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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDistModal(null)}>
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
                    value={distForm.amount || ''}
                    onChange={(e) => setDistForm({ ...distForm, amount: Number(e.target.value) })}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="0"
                  />
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
              <button onClick={handleSaveDist} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-sm font-medium hover:from-green-700 hover:to-emerald-700 shadow">
                <Save size={16} /> บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slip viewer */}
      {viewSlipUrl && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={() => setViewSlipUrl(null)}>
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
