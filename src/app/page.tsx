'use client';

import { useStore } from '@/store/useStore';
import { MEMBERS, RecipientId, getHorsePercent, getPoolPercent, PRIORITY_LABELS, PRIORITY_COLORS } from '@/types';
import Link from 'next/link';
import { formatCurrency, getStatusLabel, getStatusColor } from '@/lib/utils';
import { useHydrated } from '@/lib/useHydrated';
import {
  FolderKanban,
  TrendingUp,
  Clock,
  CheckCircle2,
  Users,
  Wallet,
  Banknote,
  ClipboardList,
  Receipt,
  // Available imports below
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const STATUS_COLORS = {
  pending: '#eab308',
  in_progress: '#3b82f6',
  completed: '#22c55e',
};

export default function DashboardPage() {
  const hydrated = useHydrated();
  const { projects, payments, distributions, quotations, trackingActivities } = useStore();

  if (!hydrated) return <div className="flex items-center justify-center h-64 text-gray-400">กำลังโหลด...</div>;

  const totalProjects = projects.length;
  const completedProjects = projects.filter((p) => p.status === 'completed').length;
  const inProgressProjects = projects.filter((p) => p.status === 'in_progress').length;

  const grandTotalCost = projects.reduce((s, p) => s + p.activities.reduce((sa, a) => sa + a.cost, 0), 0);
  const totalClientPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalDistributed = distributions.reduce((s, d) => s + d.amount, 0);

  // รายได้แต่ละคน + ผู้จัดการ + กองกลาง
  const distPaidAll = (rid: RecipientId) => distributions.filter((d) => d.recipientId === rid).reduce((s, d) => s + d.amount, 0);

  const memberRevenue = MEMBERS.map((member) => {
    const expected = projects.reduce((total, project) => {
      return total + project.activities.reduce((actTotal, activity) => {
        return actTotal + (activity.cost * (activity.sharePercent[member.id] || 0)) / 100;
      }, 0);
    }, 0);
    const actual = distPaidAll(member.id);
    return { name: member.shortName, fullName: member.name, expected, actual, color: member.color };
  });

  const horseExpected = projects.reduce((s, p) => s + p.activities.reduce((sa, a) => sa + (a.cost * getHorsePercent(a)) / 100, 0), 0);
  const horseActual = distPaidAll('horse');
  const poolExpected = projects.reduce((s, p) => s + p.activities.reduce((sa, a) => sa + (a.cost * getPoolPercent(a)) / 100, 0), 0);
  const poolActual = distPaidAll('pool');

  const chartData = [
    ...memberRevenue.map((m) => ({ name: m.name, expected: m.expected, actual: m.actual, color: m.color })),
    { name: 'ผจก', expected: horseExpected, actual: horseActual, color: '#f59e0b' },
    { name: 'กก', expected: poolExpected, actual: poolActual, color: '#6b7280' },
  ];

  const pendingCount = projects.filter((p) => p.status === 'pending').length;
  const statusData = [
    { name: 'รอดำเนินการ', value: pendingCount, color: STATUS_COLORS.pending },
    { name: 'กำลังดำเนินการ', value: inProgressProjects, color: STATUS_COLORS.in_progress },
    { name: 'เสร็จสิ้น', value: completedProjects, color: STATUS_COLORS.completed },
  ].filter((d) => d.value > 0);

  const projectDetails = [...projects]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((project) => {
      const totalCost = project.activities.reduce((s, a) => s + a.cost, 0);
      const memberIncomes = MEMBERS.map((m) => ({
        id: m.id, name: m.shortName,
        income: project.activities.reduce((s, a) => s + (a.cost * (a.sharePercent[m.id] || 0)) / 100, 0),
      }));
      const horseIncome = project.activities.reduce((s, a) => s + (a.cost * getHorsePercent(a)) / 100, 0);
      const poolIncome = project.activities.reduce((s, a) => s + (a.cost * getPoolPercent(a)) / 100, 0);
      const clientPaid = payments.filter((p) => p.projectId === project.id).reduce((s, p) => s + p.amount, 0);
      const distributed = distributions.filter((d) => d.projectId === project.id).reduce((s, d) => s + d.amount, 0);
      const progress = project.activities.length > 0
        ? Math.round(project.activities.filter((a) => a.status === 'completed').length / project.activities.length * 100) : 0;
      return { ...project, totalCost, memberIncomes, horseIncome, poolIncome, clientPaid, distributed, progress };
    });

  const stats = [
    { label: 'โครงการทั้งหมด', value: totalProjects, icon: FolderKanban, color: 'bg-indigo-50 text-indigo-600', accent: 'from-indigo-500 to-indigo-600' },
    { label: 'กำลังดำเนินการ', value: inProgressProjects, icon: Clock, color: 'bg-blue-50 text-blue-600', accent: 'from-blue-500 to-blue-600' },
    { label: 'เสร็จสิ้น', value: completedProjects, icon: CheckCircle2, color: 'bg-green-50 text-green-600', accent: 'from-green-500 to-green-600' },
    { label: 'ใบเสนอราคา', value: quotations.length, icon: Receipt, color: 'bg-purple-50 text-purple-600', accent: 'from-purple-500 to-purple-600' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">ภาพรวมระบบบริหารจัดการงานวิจัย</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-5 flex overflow-hidden relative">
            <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${stat.accent} rounded-l-xl`} />
            <div className="flex items-center justify-between flex-1 pl-2">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold mt-1">{stat.value}</p>
              </div>
              <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center`}>
                <stat.icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Banknote size={20} className="text-green-600" />
            <span className="text-sm text-green-800 font-medium">ลูกค้าชำระแล้ว</span>
          </div>
          <span className="text-2xl font-bold text-green-700">{formatCurrency(totalClientPaid)}</span>
          <div className="mt-2 bg-green-100 rounded-full h-1.5">
            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${grandTotalCost > 0 ? Math.min(100, Math.round(totalClientPaid / grandTotalCost * 100)) : 0}%` }} />
          </div>
          <p className="text-xs text-green-600 mt-1">{grandTotalCost > 0 ? Math.round(totalClientPaid / grandTotalCost * 100) : 0}% จาก {formatCurrency(grandTotalCost)}</p>
        </div>
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Users size={20} className="text-blue-600" />
            <span className="text-sm text-blue-800 font-medium">โอนให้สมาชิกแล้ว</span>
          </div>
          <span className="text-2xl font-bold text-blue-700">{formatCurrency(totalDistributed)}</span>
          <div className="mt-2 bg-blue-100 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${totalClientPaid > 0 ? Math.min(100, Math.round(totalDistributed / totalClientPaid * 100)) : 0}%` }} />
          </div>
          <p className="text-xs text-blue-600 mt-1">{totalClientPaid > 0 ? Math.round(totalDistributed / totalClientPaid * 100) : 0}% จากที่รับมา {formatCurrency(totalClientPaid)}</p>
        </div>
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={20} className="text-amber-600" />
            <span className="text-sm text-amber-800 font-medium">รอโอนให้สมาชิก</span>
          </div>
          <span className="text-2xl font-bold text-amber-700">{formatCurrency(Math.max(0, totalClientPaid - totalDistributed))}</span>
          <p className="text-xs text-amber-600 mt-2">คาดว่าจะได้ทั้งหมด {formatCurrency(grandTotalCost)}</p>
        </div>
      </div>

      {/* Member Revenue Cards */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Users size={18} /> สรุปรายได้แต่ละคน</h2>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {memberRevenue.map((m) => (
              <div key={m.name} className="rounded-lg border p-3 text-center relative overflow-hidden" style={{ borderColor: `${m.color}30`, background: `${m.color}06` }}>
                <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ backgroundColor: m.color }} />
                <div className="w-9 h-9 rounded-full mx-auto mb-1.5 flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: m.color }}>{m.name}</div>
                <p className="text-xs text-gray-600 font-medium">{m.fullName}</p>
                <p className="text-sm font-bold text-green-600 mt-1">รับ {formatCurrency(m.actual)}</p>
                <p className="text-xs text-gray-400">คาด {formatCurrency(m.expected)}</p>
              </div>
            ))}
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-center relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-amber-500" />
              <div className="w-9 h-9 rounded-full mx-auto mb-1.5 flex items-center justify-center bg-amber-500 text-white font-bold text-xs">ผจก</div>
              <p className="text-xs text-gray-600 font-medium">ผู้จัดการ</p>
              <p className="text-sm font-bold text-green-600 mt-1">รับ {formatCurrency(horseActual)}</p>
              <p className="text-xs text-gray-400">คาด {formatCurrency(horseExpected)}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 text-center relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-gray-500" />
              <div className="w-9 h-9 rounded-full mx-auto mb-1.5 flex items-center justify-center bg-gray-500 text-white font-bold text-xs">กก</div>
              <p className="text-xs text-gray-600 font-medium">กองกลาง</p>
              <p className="text-sm font-bold text-green-600 mt-1">รับ {formatCurrency(poolActual)}</p>
              <p className="text-xs text-gray-400">คาด {formatCurrency(poolExpected)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ClipboardList size={18} /> รายได้แต่ละคน (รับจริง vs คาดว่าจะได้)
          </h2>
          {chartData.some((d) => d.expected > 0 || d.actual > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Legend />
                <Bar dataKey="actual" name="รับจริง" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expected" name="คาดว่าจะได้" fill="#a5b4fc" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">ยังไม่มีข้อมูลรายได้</div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FolderKanban size={18} /> สถานะโครงการ
          </h2>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false} fontSize={12}>
                  {statusData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">ยังไม่มีโครงการ</div>
          )}
        </div>
      </div>

      {/* Project Revenue Detail Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Receipt size={18} /> รายได้แยกรายโครงการ</h2>
        </div>
        {projectDetails.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b">
                  <th className="px-3 py-3 font-medium">รหัส</th>
                  <th className="px-3 py-3 font-medium">โครงการ</th>
                  <th className="px-3 py-3 font-medium">ผู้วิจัย</th>
                  <th className="px-3 py-3 font-medium text-center">สถานะ</th>
                  <th className="px-3 py-3 font-medium text-center">%</th>
                  <th className="px-3 py-3 font-medium text-right">ค่าใช้จ่าย</th>
                  {MEMBERS.map((m) => <th key={m.id} className="px-3 py-3 font-medium text-right">{m.shortName}</th>)}
                  <th className="px-3 py-3 font-medium text-right">ผจก</th>
                  <th className="px-3 py-3 font-medium text-right">กก</th>
                  <th className="px-3 py-3 font-medium text-right">ชำระ</th>
                  <th className="px-3 py-3 font-medium text-right">โอน</th>
                </tr>
              </thead>
              <tbody>
                {projectDetails.map((p, i) => (
                  <tr key={p.id} className={`border-b border-gray-50 hover:bg-indigo-50/20 ${i % 2 === 0 ? 'bg-pink-50/30' : 'bg-green-50/30'}`}>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{p.projectCode || '-'}</td>
                    <td className="px-3 py-2.5 font-medium text-gray-800 max-w-[180px] truncate">{p.name}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{p.client || '-'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(p.status)}`}>{getStatusLabel(p.status)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center gap-1">
                        <div className="flex-1 bg-gray-100 rounded-full h-1 min-w-[30px]"><div className="bg-indigo-500 h-1 rounded-full" style={{ width: `${p.progress}%` }} /></div>
                        <span className="text-xs text-gray-500">{p.progress}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">{formatCurrency(p.totalCost)}</td>
                    {p.memberIncomes.map((mi) => <td key={mi.id} className="px-3 py-2.5 text-right text-gray-600 text-xs">{formatCurrency(mi.income)}</td>)}
                    <td className="px-3 py-2.5 text-right text-amber-600 text-xs">{formatCurrency(p.horseIncome)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{formatCurrency(p.poolIncome)}</td>
                    <td className="px-3 py-2.5 text-right text-green-600 font-medium text-xs">{formatCurrency(p.clientPaid)}</td>
                    <td className="px-3 py-2.5 text-right text-blue-600 font-medium text-xs">{formatCurrency(p.distributed)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-bold text-gray-900 border-t-2 border-gray-300">
                  <td className="px-3 py-2.5" colSpan={5}>รวมทุกโครงการ</td>
                  <td className="px-3 py-2.5 text-right">{formatCurrency(grandTotalCost)}</td>
                  {MEMBERS.map((m) => <td key={m.id} className="px-3 py-2.5 text-right text-xs">{formatCurrency(projectDetails.reduce((s, p) => s + (p.memberIncomes.find((mi) => mi.id === m.id)?.income || 0), 0))}</td>)}
                  <td className="px-3 py-2.5 text-right text-amber-600 text-xs">{formatCurrency(projectDetails.reduce((s, p) => s + p.horseIncome, 0))}</td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">{formatCurrency(projectDetails.reduce((s, p) => s + p.poolIncome, 0))}</td>
                  <td className="px-3 py-2.5 text-right text-green-600 text-xs">{formatCurrency(totalClientPaid)}</td>
                  <td className="px-3 py-2.5 text-right text-blue-600 text-xs">{formatCurrency(totalDistributed)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400 text-sm">ยังไม่มีโครงการ</div>
        )}
      </div>

      {/* Project progress + deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><TrendingUp size={18} /> ความคืบหน้าโครงการ</h2>
          {projects.length > 0 ? (
            <div className="space-y-3">
              {projectDetails.slice(0, 6).map((p) => (
                <div key={p.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 truncate mr-2">{p.name}</span>
                    <span className={`text-xs shrink-0 px-1.5 py-0.5 rounded ${getStatusColor(p.status)}`}>{p.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${p.status === 'completed' ? 'bg-green-500' : p.status === 'in_progress' ? 'bg-blue-500' : 'bg-yellow-500'}`} style={{ width: `${p.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">ยังไม่มีโครงการ</p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2"><Clock size={18} /> โครงการใกล้ถึง Deadline</h2>
          {(() => {
            const deadlines = projects.filter((p) => p.status !== 'completed' && p.endDate).sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime()).slice(0, 5);
            return deadlines.length > 0 ? (
              <div className="space-y-3">
                {deadlines.map((project) => {
                  const daysLeft = Math.ceil((new Date(project.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const isUrgent = daysLeft <= 7;
                  return (
                    <div key={project.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div>
                        <p className="text-sm font-medium text-gray-700">{project.name}</p>
                        <p className="text-xs text-gray-500">{project.client}</p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${isUrgent ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                          {daysLeft > 0 ? `อีก ${daysLeft} วัน` : 'เลยกำหนด'}
                        </span>
                        <span className={`block mt-1 px-2 py-0.5 rounded text-xs ${getStatusColor(project.status)}`}>{getStatusLabel(project.status)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">ไม่มีโครงการที่ใกล้ถึงกำหนด</p>
            );
          })()}
        </div>
      </div>

      {/* Tracking Activities — กำลังทำ + เลย Deadline */}
      {(() => {
        const todayMs = new Date().setHours(0, 0, 0, 0);
        const inProgress = trackingActivities.filter((a) => a.status === 'in_progress');
        const overdue = trackingActivities.filter((a) => {
          if (a.status === 'done' || !a.deadline) return false;
          return new Date(a.deadline).setHours(0, 0, 0, 0) < todayMs;
        });
        if (inProgress.length === 0 && overdue.length === 0) return null;

        return (
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-cyan-50 to-blue-50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardList size={18} className="text-cyan-600" /> Activity ที่ต้องติดตาม
              </h2>
              <Link href="/tracking" className="text-xs text-cyan-700 hover:text-cyan-800 font-medium">
                ดูทั้งหมด →
              </Link>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
              {/* เลย deadline */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <h3 className="text-sm font-bold text-red-700">เลย Deadline ({overdue.length})</h3>
                </div>
                {overdue.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">ไม่มี Activity เลย deadline 🎉</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {overdue
                      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
                      .map((act) => {
                        const project = projects.find((p) => p.id === act.projectId);
                        const member = MEMBERS.find((m) => m.id === act.assigneeId);
                        const daysOver = Math.floor((todayMs - new Date(act.deadline).setHours(0, 0, 0, 0)) / 86400000);
                        return (
                          <div key={act.id} className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm font-medium text-gray-800 truncate">{act.title}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${PRIORITY_COLORS[act.priority]}`}>
                                  {PRIORITY_LABELS[act.priority]}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                {project && <span className="truncate">{project.client || project.name}</span>}
                                {member && (
                                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-bold shrink-0" style={{ backgroundColor: member.color }}>
                                    {member.shortName}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs font-bold text-red-600 shrink-0 bg-white px-2 py-0.5 rounded">เลย {daysOver} วัน</span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* กำลังทำ */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <h3 className="text-sm font-bold text-blue-700">กำลังทำ ({inProgress.length})</h3>
                </div>
                {inProgress.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">ไม่มี Activity ที่กำลังทำ</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {inProgress
                      .sort((a, b) => {
                        if (!a.deadline) return 1;
                        if (!b.deadline) return -1;
                        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
                      })
                      .map((act) => {
                        const project = projects.find((p) => p.id === act.projectId);
                        const member = MEMBERS.find((m) => m.id === act.assigneeId);
                        const daysLeft = act.deadline
                          ? Math.ceil((new Date(act.deadline).setHours(0, 0, 0, 0) - todayMs) / 86400000)
                          : null;
                        return (
                          <div key={act.id} className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm font-medium text-gray-800 truncate">{act.title}</p>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${PRIORITY_COLORS[act.priority]}`}>
                                  {PRIORITY_LABELS[act.priority]}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                {project && <span className="truncate">{project.client || project.name}</span>}
                                {member && (
                                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-bold shrink-0" style={{ backgroundColor: member.color }}>
                                    {member.shortName}
                                  </span>
                                )}
                              </div>
                            </div>
                            {daysLeft !== null && (
                              <span className={`text-xs font-bold shrink-0 px-2 py-0.5 rounded ${daysLeft <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-white text-blue-600'}`}>
                                {daysLeft === 0 ? 'วันนี้' : `อีก ${daysLeft} วัน`}
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
