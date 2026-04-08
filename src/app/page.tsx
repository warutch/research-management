'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { MEMBERS, RecipientId, TrackingActivity, Project, ProjectStatus, getHorsePercent, getPoolPercent, PRIORITY_LABELS, PRIORITY_COLORS } from '@/types';
import Link from 'next/link';
import { formatCurrency, getStatusLabel, getStatusColor } from '@/lib/utils';
import { useHydrated } from '@/lib/useHydrated';
import TrackingActivityModal from '@/components/TrackingActivityModal';
import {
  FolderKanban,
  TrendingUp,
  Clock,
  CheckCircle2,
  Users,
  Wallet,
  Banknote,
  ClipboardList,
  AlertCircle,
  Activity as ActivityIcon,
  CalendarDays,
  X,
  Save,
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
  const { projects, payments, distributions, quotations, trackingActivities, updateTrackingActivity, deleteTrackingActivity, updateProject } = useStore();

  // Modal state for editing tracking activity
  const [editingActivity, setEditingActivity] = useState<TrackingActivity | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Modal state for editing project
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectForm, setProjectForm] = useState<{ projectCode: string; name: string; client: string; budget: number; startDate: string; endDate: string; status: ProjectStatus }>({
    projectCode: '', name: '', client: '', budget: 0, startDate: '', endDate: '', status: 'pending',
  });

  const handleActivityClick = (activity: TrackingActivity) => {
    setEditingActivity(activity);
    setModalOpen(true);
  };

  const handleSaveActivity = (data: Omit<TrackingActivity, 'id' | 'createdAt'>) => {
    if (editingActivity) {
      updateTrackingActivity(editingActivity.id, data);
    }
    setModalOpen(false);
    setEditingActivity(null);
  };

  const handleDeleteActivity = (id: string) => {
    deleteTrackingActivity(id);
    setModalOpen(false);
    setEditingActivity(null);
  };

  const handleProjectClick = (project: Project) => {
    setEditingProject(project);
    setProjectForm({
      projectCode: project.projectCode || '',
      name: project.name,
      client: project.client,
      budget: project.budget,
      startDate: project.startDate,
      endDate: project.endDate,
      status: project.status,
    });
  };

  const handleSaveProject = () => {
    if (!editingProject) return;
    if (!projectForm.name.trim()) {
      alert('กรุณาระบุชื่อโครงการ');
      return;
    }
    updateProject(editingProject.id, projectForm);
    setEditingProject(null);
  };

  if (!hydrated) return <div className="flex items-center justify-center h-64 text-gray-400">กำลังโหลด...</div>;

  const totalProjects = projects.length;
  const completedProjects = projects.filter((p) => p.status === 'completed').length;
  const inProgressProjects = projects.filter((p) => p.status === 'in_progress').length;
  const pendingCount = projects.filter((p) => p.status === 'pending').length;

  const grandTotalCost = projects.reduce((s, p) => s + p.activities.reduce((sa, a) => sa + a.cost, 0), 0);
  const totalClientPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalDistributed = distributions.reduce((s, d) => s + d.amount, 0);

  // Tracking stats
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const trackingInProgress = trackingActivities.filter((a) => a.status === 'in_progress');
  const trackingOverdue = trackingActivities.filter((a) => {
    if (a.status === 'done' || !a.deadline) return false;
    return new Date(a.deadline).setHours(0, 0, 0, 0) < todayMs;
  });
  const trackingUpcoming = trackingActivities.filter((a) => {
    if (a.status === 'done' || !a.deadline) return false;
    const deadlineMs = new Date(a.deadline).setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((deadlineMs - todayMs) / 86400000);
    return diffDays >= 0 && diffDays <= 7;
  });
  const trackingDone = trackingActivities.filter((a) => a.status === 'done').length;

  // Financial stats
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
    ...memberRevenue.map((m) => ({
      name: m.name,
      actual: m.actual,
      remaining: Math.max(0, m.expected - m.actual),
      total: m.expected,
      color: m.color,
    })),
    {
      name: 'ผจก',
      actual: horseActual,
      remaining: Math.max(0, horseExpected - horseActual),
      total: horseExpected,
      color: '#f59e0b',
    },
    {
      name: 'กก',
      actual: poolActual,
      remaining: Math.max(0, poolExpected - poolActual),
      total: poolExpected,
      color: '#6b7280',
    },
  ];

  const statusData = [
    { name: 'รอดำเนินการ', value: pendingCount, color: STATUS_COLORS.pending },
    { name: 'กำลังดำเนินการ', value: inProgressProjects, color: STATUS_COLORS.in_progress },
    { name: 'เสร็จสิ้น', value: completedProjects, color: STATUS_COLORS.completed },
  ].filter((d) => d.value > 0);

  const projectDetails = [...projects]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((project) => {
      const totalCost = project.activities.reduce((s, a) => s + a.cost, 0);
      const clientPaid = payments.filter((p) => p.projectId === project.id).reduce((s, p) => s + p.amount, 0);
      const progress = project.activities.length > 0
        ? Math.round(project.activities.filter((a) => a.status === 'completed').length / project.activities.length * 100) : 0;
      return { ...project, totalCost, clientPaid, progress };
    });

  // Active projects (in-progress + pending) sorted by progress
  const activeProjects = projectDetails.filter((p) => p.status !== 'completed');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">ภาพรวมการทำงานและโครงการ</p>
      </div>

      {/* ============ ROW 1: Key Metrics ============ */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-indigo-600" />
          <div className="flex items-center justify-between pl-1">
            <div>
              <p className="text-xs text-gray-500">โครงการทั้งหมด</p>
              <p className="text-2xl font-bold mt-0.5">{totalProjects}</p>
            </div>
            <FolderKanban size={20} className="text-indigo-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-blue-600" />
          <div className="flex items-center justify-between pl-1">
            <div>
              <p className="text-xs text-gray-500">กำลังดำเนินการ</p>
              <p className="text-2xl font-bold mt-0.5 text-blue-700">{inProgressProjects}</p>
            </div>
            <Clock size={20} className="text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-green-500 to-green-600" />
          <div className="flex items-center justify-between pl-1">
            <div>
              <p className="text-xs text-gray-500">เสร็จสิ้น</p>
              <p className="text-2xl font-bold mt-0.5 text-green-700">{completedProjects}</p>
            </div>
            <CheckCircle2 size={20} className="text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-500 to-cyan-600" />
          <div className="flex items-center justify-between pl-1">
            <div>
              <p className="text-xs text-gray-500">Activity กำลังทำ</p>
              <p className="text-2xl font-bold mt-0.5 text-cyan-700">{trackingInProgress.length}</p>
            </div>
            <ActivityIcon size={20} className="text-cyan-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-red-500 to-red-600" />
          <div className="flex items-center justify-between pl-1">
            <div>
              <p className="text-xs text-gray-500">เลย Deadline</p>
              <p className="text-2xl font-bold mt-0.5 text-red-700">{trackingOverdue.length}</p>
            </div>
            <AlertCircle size={20} className="text-red-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-purple-500 to-purple-600" />
          <div className="flex items-center justify-between pl-1">
            <div>
              <p className="text-xs text-gray-500">Activity เสร็จ</p>
              <p className="text-2xl font-bold mt-0.5 text-purple-700">{trackingDone}</p>
            </div>
            <CheckCircle2 size={20} className="text-purple-500" />
          </div>
        </div>
      </div>

      {/* ============ ROW 2: Activities (ความสำคัญสูงสุด) ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* เลย Deadline — ความสำคัญสูงสุด */}
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-red-50 to-orange-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-red-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              เลย Deadline ({trackingOverdue.length})
            </h3>
            <Link href="/tracking" className="text-xs text-red-600 hover:text-red-800 font-medium">ดูทั้งหมด →</Link>
          </div>
          <div className="p-4">
            {trackingOverdue.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-6">🎉 ไม่มี Activity เลย deadline</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {trackingOverdue
                  .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
                  .map((act) => {
                    const project = projects.find((p) => p.id === act.projectId);
                    const member = MEMBERS.find((m) => m.id === act.assigneeId);
                    const daysOver = Math.floor((todayMs - new Date(act.deadline).setHours(0, 0, 0, 0)) / 86400000);
                    return (
                      <button key={act.id} onClick={() => handleActivityClick(act)} className="w-full text-left p-2.5 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800 flex-1 truncate">{act.title}</p>
                          <span className="text-xs font-bold text-red-700 bg-white px-2 py-0.5 rounded shrink-0">เลย {daysOver}ว.</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <span className={`px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[act.priority]}`}>{PRIORITY_LABELS[act.priority]}</span>
                          {project && <span className="truncate">{project.client || project.name}</span>}
                          {member && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-bold shrink-0" style={{ backgroundColor: member.color }}>
                              {member.shortName}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* กำลังทำ */}
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-cyan-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-blue-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              กำลังทำ ({trackingInProgress.length})
            </h3>
            <Link href="/tracking" className="text-xs text-blue-600 hover:text-blue-800 font-medium">ดูทั้งหมด →</Link>
          </div>
          <div className="p-4">
            {trackingInProgress.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-6">ไม่มี Activity ที่กำลังทำ</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {trackingInProgress
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
                      <button key={act.id} onClick={() => handleActivityClick(act)} className="w-full text-left p-2.5 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800 flex-1 truncate">{act.title}</p>
                          {daysLeft !== null && (
                            <span className={`text-xs font-bold shrink-0 px-2 py-0.5 rounded ${daysLeft <= 3 ? 'bg-orange-100 text-orange-700' : 'bg-white text-blue-600'}`}>
                              {daysLeft === 0 ? 'วันนี้' : `อีก ${daysLeft}ว.`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <span className={`px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[act.priority]}`}>{PRIORITY_LABELS[act.priority]}</span>
                          {project && <span className="truncate">{project.client || project.name}</span>}
                          {member && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-bold shrink-0" style={{ backgroundColor: member.color }}>
                              {member.shortName}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Deadline ใน 7 วัน */}
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-yellow-50 to-amber-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-700 flex items-center gap-2">
              <CalendarDays size={14} /> ใกล้ Deadline ({trackingUpcoming.length})
            </h3>
            <Link href="/tracking" className="text-xs text-amber-700 hover:text-amber-800 font-medium">ดูทั้งหมด →</Link>
          </div>
          <div className="p-4">
            {trackingUpcoming.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-6">ไม่มี Activity ใกล้ deadline</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {trackingUpcoming
                  .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
                  .map((act) => {
                    const project = projects.find((p) => p.id === act.projectId);
                    const member = MEMBERS.find((m) => m.id === act.assigneeId);
                    const daysLeft = Math.ceil((new Date(act.deadline).setHours(0, 0, 0, 0) - todayMs) / 86400000);
                    return (
                      <button key={act.id} onClick={() => handleActivityClick(act)} className="w-full text-left p-2.5 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800 flex-1 truncate">{act.title}</p>
                          <span className="text-xs font-bold bg-amber-200 text-amber-800 shrink-0 px-2 py-0.5 rounded">
                            {daysLeft === 0 ? 'วันนี้' : `อีก ${daysLeft}ว.`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <span className={`px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[act.priority]}`}>{PRIORITY_LABELS[act.priority]}</span>
                          {project && <span className="truncate">{project.client || project.name}</span>}
                          {member && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-bold shrink-0" style={{ backgroundColor: member.color }}>
                              {member.shortName}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ ROW 3: Project Progress & Status ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Active Projects with Progress (ครึ่งใหญ่) */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp size={18} className="text-indigo-600" /> ความคืบหน้าโครงการ (ที่กำลังดำเนินการ)
            </h2>
            <Link href="/projects" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">จัดการโครงการ →</Link>
          </div>
          <div className="p-5">
            {activeProjects.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-6">ไม่มีโครงการที่กำลังดำเนินการ</p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {activeProjects.map((p) => {
                  const daysLeft = p.endDate
                    ? Math.ceil((new Date(p.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null;
                  const isUrgent = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;
                  const isOverdue = daysLeft !== null && daysLeft < 0;
                  return (
                    <button key={p.id} onClick={() => handleProjectClick(p)} className="w-full text-left border border-gray-100 rounded-lg p-3 hover:bg-indigo-50/40 hover:border-indigo-200 hover:shadow-sm transition-all">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {p.projectCode && <span className="text-xs font-mono text-gray-400 shrink-0">{p.projectCode}</span>}
                            <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                          </div>
                          <p className="text-xs text-gray-500 truncate mt-0.5">{p.client || 'ไม่ระบุผู้วิจัย'}</p>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(p.status)}`}>
                          {getStatusLabel(p.status)}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${p.status === 'in_progress' ? 'bg-gradient-to-r from-blue-500 to-cyan-500' : 'bg-gradient-to-r from-yellow-400 to-amber-500'}`}
                            style={{ width: `${p.progress}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-gray-700 shrink-0 w-10 text-right">{p.progress}%</span>
                      </div>
                      {/* Footer info */}
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>
                          {p.activities.filter((a) => a.status === 'completed').length}/{p.activities.length} กิจกรรมเสร็จ
                        </span>
                        {daysLeft !== null && (
                          <span className={`font-medium ${isOverdue ? 'text-red-600' : isUrgent ? 'text-orange-600' : 'text-gray-500'}`}>
                            {isOverdue ? `⚠ เลยกำหนด ${Math.abs(daysLeft)} วัน` : daysLeft === 0 ? '⏰ ครบกำหนดวันนี้' : `อีก ${daysLeft} วัน`}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Status Pie Chart */}
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <FolderKanban size={18} /> สถานะโครงการ
            </h2>
          </div>
          <div className="p-5">
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name} (${value})`} labelLine={false} fontSize={11}>
                    {statusData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">ยังไม่มีโครงการ</div>
            )}
          </div>
        </div>
      </div>

      {/* ============ ROW 4: Project Deadlines + Quick Stats ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Clock size={18} className="text-amber-600" /> โครงการใกล้ถึง Deadline
            </h2>
          </div>
          <div className="p-5">
            {(() => {
              const deadlines = projects.filter((p) => p.status !== 'completed' && p.endDate).sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime()).slice(0, 5);
              return deadlines.length > 0 ? (
                <div className="space-y-3">
                  {deadlines.map((project) => {
                    const daysLeft = Math.ceil((new Date(project.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    const isUrgent = daysLeft <= 7;
                    return (
                      <button key={project.id} onClick={() => handleProjectClick(project)} className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-indigo-50 hover:shadow-sm text-left transition-all">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">{project.name}</p>
                          <p className="text-xs text-gray-500 truncate">{project.client}</p>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${isUrgent ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                            {daysLeft > 0 ? `อีก ${daysLeft} วัน` : daysLeft === 0 ? 'วันนี้' : 'เลยกำหนด'}
                          </span>
                          <span className={`block mt-1 px-2 py-0.5 rounded text-xs ${getStatusColor(project.status)}`}>{getStatusLabel(project.status)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-400 text-sm text-center py-6">ไม่มีโครงการที่ใกล้ถึงกำหนด</p>
              );
            })()}
          </div>
        </div>

        {/* Team Workload */}
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-cyan-50 to-blue-50">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Users size={18} className="text-cyan-600" /> ภาระงานทีม (Active Activities)
            </h2>
          </div>
          <div className="p-5 space-y-3">
            {MEMBERS.map((m) => {
              const myActivities = trackingActivities.filter((a) => a.assigneeId === m.id && a.status !== 'done');
              const myOverdue = myActivities.filter((a) => {
                if (!a.deadline) return false;
                return new Date(a.deadline).setHours(0, 0, 0, 0) < todayMs;
              }).length;
              const myInProgress = myActivities.filter((a) => a.status === 'in_progress').length;
              const myTodo = myActivities.filter((a) => a.status === 'todo').length;
              return (
                <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ backgroundColor: m.color }}>
                    {m.shortName}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.role}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {myOverdue > 0 && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">{myOverdue} เลย</span>
                    )}
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">{myInProgress} ทำ</span>
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">{myTodo} รอ</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ============ ROW 5: Financial Summary (รายได้ - ลดความสำคัญ) ============ */}
      <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Wallet size={18} className="text-green-600" /> สรุปการเงิน
          </h2>
          <Link href="/income" className="text-xs text-green-700 hover:text-green-800 font-medium">ดูรายละเอียด →</Link>
        </div>
        <div className="p-5">
          {/* Summary row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Banknote size={16} className="text-green-600" />
                <span className="text-xs text-green-800 font-medium">ลูกค้าชำระ</span>
              </div>
              <span className="text-xl font-bold text-green-700">{formatCurrency(totalClientPaid)}</span>
              <div className="mt-1.5 bg-green-100 rounded-full h-1">
                <div className="bg-green-500 h-1 rounded-full" style={{ width: `${grandTotalCost > 0 ? Math.min(100, Math.round(totalClientPaid / grandTotalCost * 100)) : 0}%` }} />
              </div>
              <p className="text-[10px] text-green-600 mt-1">{grandTotalCost > 0 ? Math.round(totalClientPaid / grandTotalCost * 100) : 0}% จาก {formatCurrency(grandTotalCost)}</p>
            </div>
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users size={16} className="text-blue-600" />
                <span className="text-xs text-blue-800 font-medium">โอนให้สมาชิก</span>
              </div>
              <span className="text-xl font-bold text-blue-700">{formatCurrency(totalDistributed)}</span>
              <div className="mt-1.5 bg-blue-100 rounded-full h-1">
                <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${totalClientPaid > 0 ? Math.min(100, Math.round(totalDistributed / totalClientPaid * 100)) : 0}%` }} />
              </div>
              <p className="text-[10px] text-blue-600 mt-1">{totalClientPaid > 0 ? Math.round(totalDistributed / totalClientPaid * 100) : 0}% จากที่รับมา</p>
            </div>
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <ClipboardList size={16} className="text-amber-600" />
                <span className="text-xs text-amber-800 font-medium">รอโอนให้สมาชิก</span>
              </div>
              <span className="text-xl font-bold text-amber-700">{formatCurrency(Math.max(0, totalClientPaid - totalDistributed))}</span>
              <p className="text-[10px] text-amber-600 mt-2">ใบเสนอราคา {quotations.length} รายการ</p>
            </div>
          </div>

          {/* Chart */}
          {chartData.some((d) => d.total > 0 || d.actual > 0) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">รายได้แต่ละคน (รับจริง vs คาดว่าจะได้)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" fontSize={11} width={50} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="actual" name="รับจริง" stackId="income" fill="#22c55e" barSize={24} radius={[6, 0, 0, 6]} />
                  <Bar dataKey="remaining" name="คงเหลือ" stackId="income" fill="#e5e7eb" barSize={24} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Tracking Activity Edit Modal */}
      <TrackingActivityModal
        open={modalOpen}
        editingActivity={editingActivity}
        projects={projects}
        onClose={() => { setModalOpen(false); setEditingActivity(null); }}
        onSave={handleSaveActivity}
        onDelete={handleDeleteActivity}
      />

      {/* Project Edit Modal */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditingProject(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-xl">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow">
                  <FolderKanban size={18} className="text-white" />
                </div>
                <h2 className="font-semibold text-gray-900">แก้ไขโครงการ</h2>
              </div>
              <button onClick={() => setEditingProject(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-white/60">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">รหัสโครงการ</label>
                  <input type="text" value={projectForm.projectCode} onChange={(e) => setProjectForm({ ...projectForm, projectCode: e.target.value })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-mono bg-gray-50" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อโครงการ *</label>
                  <input type="text" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="ชื่อโครงการวิจัย" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ผู้วิจัย / ลูกค้า</label>
                <input type="text" value={projectForm.client} onChange={(e) => setProjectForm({ ...projectForm, client: e.target.value })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="ชื่อผู้วิจัย" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">งบประมาณรวม (บาท)</label>
                <input type="number" value={projectForm.budget || ''} onChange={(e) => setProjectForm({ ...projectForm, budget: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันเริ่มต้น</label>
                  <input type="date" value={projectForm.startDate} onChange={(e) => setProjectForm({ ...projectForm, startDate: e.target.value })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันสิ้นสุด</label>
                  <input type="date" value={projectForm.endDate} onChange={(e) => setProjectForm({ ...projectForm, endDate: e.target.value })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
                <select value={projectForm.status} onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value as ProjectStatus })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="pending">รอดำเนินการ</option>
                  <option value="in_progress">กำลังดำเนินการ</option>
                  <option value="completed">เสร็จสิ้น</option>
                </select>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <Link href={`/projects?id=${editingProject.id}`} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  → ไปหน้าจัดการโครงการเพื่อแก้ไขกิจกรรม/งวดเงิน/การชำระเงิน
                </Link>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setEditingProject(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">ยกเลิก</button>
              <button onClick={handleSaveProject} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-indigo-700 hover:to-purple-700 shadow">
                <Save size={16} /> บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
