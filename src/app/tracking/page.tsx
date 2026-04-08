'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { useHydrated } from '@/lib/useHydrated';
import { TrackingActivity, MEMBERS } from '@/types';
import CalendarView, { CalendarViewMode, getCalendarHeader } from '@/components/CalendarView';
import TrackingActivityModal from '@/components/TrackingActivityModal';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, CalendarDays, List, Filter } from 'lucide-react';

export default function TrackingPage() {
  const hydrated = useHydrated();
  const { trackingActivities, projects, addTrackingActivity, updateTrackingActivity, deleteTrackingActivity } = useStore();

  const [view, setView] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<TrackingActivity | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | null>(null);

  const filteredActivities = useMemo(() => {
    return trackingActivities.filter((a) => {
      if (filterProject !== 'all' && a.projectId !== filterProject) return false;
      if (filterAssignee !== 'all' && a.assigneeId !== filterAssignee) return false;
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      return true;
    });
  }, [trackingActivities, filterProject, filterAssignee, filterStatus]);

  if (!hydrated) return <div className="flex items-center justify-center h-64 text-gray-400">กำลังโหลด...</div>;

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() - 1);
    else if (view === 'week') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + 1);
    else if (view === 'week') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  const handleAdd = () => {
    setEditingActivity(null);
    setDefaultDate(null);
    setModalOpen(true);
  };

  const handleDateClick = (date: Date) => {
    setEditingActivity(null);
    setDefaultDate(date);
    setModalOpen(true);
  };

  const handleActivityClick = (activity: TrackingActivity) => {
    setEditingActivity(activity);
    setDefaultDate(null);
    setModalOpen(true);
  };

  const handleSave = (data: Omit<TrackingActivity, 'id' | 'createdAt'>) => {
    if (editingActivity) {
      updateTrackingActivity(editingActivity.id, data);
    } else {
      addTrackingActivity(data);
    }
    setModalOpen(false);
    setEditingActivity(null);
  };

  const handleDelete = (id: string) => {
    deleteTrackingActivity(id);
    setModalOpen(false);
    setEditingActivity(null);
  };

  // Stats
  const stats = {
    total: filteredActivities.length,
    todo: filteredActivities.filter((a) => a.status === 'todo').length,
    inProgress: filteredActivities.filter((a) => a.status === 'in_progress').length,
    done: filteredActivities.filter((a) => a.status === 'done').length,
    overdue: filteredActivities.filter((a) => {
      if (a.status === 'done' || !a.deadline) return false;
      return new Date(a.deadline) < new Date();
    }).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays size={26} className="text-cyan-600" /> Tracking Activities
          </h1>
          <p className="text-gray-500 text-sm mt-1">ติดตามงานและ deadline ของทีม</p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg text-sm font-medium hover:from-cyan-700 hover:to-blue-700 shadow transition-all"
        >
          <Plus size={16} /> เพิ่ม Activity
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <p className="text-xs text-gray-500">ทั้งหมด</p>
          <p className="text-xl font-bold text-gray-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <p className="text-xs text-gray-500">รอทำ</p>
          <p className="text-xl font-bold text-gray-700">{stats.todo}</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-3 shadow-sm">
          <p className="text-xs text-blue-600">กำลังทำ</p>
          <p className="text-xl font-bold text-blue-700">{stats.inProgress}</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-3 shadow-sm">
          <p className="text-xs text-green-600">เสร็จแล้ว</p>
          <p className="text-xl font-bold text-green-700">{stats.done}</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-3 shadow-sm">
          <p className="text-xs text-red-600">เลย deadline</p>
          <p className="text-xl font-bold text-red-700">{stats.overdue}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm flex items-center justify-between flex-wrap gap-3">
        {/* View switcher */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setView('month')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${view === 'month' ? 'bg-white text-cyan-700 shadow' : 'text-gray-600 hover:text-gray-800'}`}
          >
            <CalendarIcon size={14} /> เดือน
          </button>
          <button
            onClick={() => setView('week')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${view === 'week' ? 'bg-white text-cyan-700 shadow' : 'text-gray-600 hover:text-gray-800'}`}
          >
            <CalendarDays size={14} /> สัปดาห์
          </button>
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${view === 'list' ? 'bg-white text-cyan-700 shadow' : 'text-gray-600 hover:text-gray-800'}`}
          >
            <List size={14} /> รายการ
          </button>
        </div>

        {/* Navigation */}
        {view !== 'list' && (
          <div className="flex items-center gap-2">
            <button onClick={handlePrev} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg" title="ก่อนหน้า">
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 text-xs font-medium text-cyan-700 hover:bg-cyan-50 rounded-lg border border-cyan-200"
            >
              วันนี้
            </button>
            <span className="text-sm font-semibold text-gray-700 min-w-[180px] text-center">{getCalendarHeader(view, currentDate)}</span>
            <button onClick={handleNext} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg" title="ถัดไป">
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="all">ทุกนักวิจัย</option>
            <option value="">ไม่ผูก</option>
            {projects.filter((p) => p.status !== 'completed').map((p) => <option key={p.id} value={p.id}>{p.client || p.name}</option>)}
          </select>
          <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="all">ทุกคน</option>
            <option value="">ไม่ระบุ</option>
            {MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="all">ทุกสถานะ</option>
            <option value="todo">รอทำ</option>
            <option value="in_progress">กำลังทำ</option>
            <option value="done">เสร็จแล้ว</option>
          </select>
        </div>
      </div>

      {/* Calendar */}
      <CalendarView
        activities={filteredActivities}
        view={view}
        currentDate={currentDate}
        projects={projects}
        onActivityClick={handleActivityClick}
        onDateClick={handleDateClick}
      />

      {/* Modal */}
      <TrackingActivityModal
        open={modalOpen}
        editingActivity={editingActivity}
        projects={projects}
        defaultDate={defaultDate}
        onClose={() => { setModalOpen(false); setEditingActivity(null); }}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}

