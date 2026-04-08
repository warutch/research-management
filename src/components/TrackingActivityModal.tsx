'use client';

import { useState, useEffect } from 'react';
import { TrackingActivity, TrackingPriority, TrackingStatus, MEMBERS, MemberId, Project, PRIORITY_LABELS, TRACKING_STATUS_LABELS } from '@/types';
import { CalendarDays, X, Save, Trash2 } from 'lucide-react';

interface Props {
  open: boolean;
  editingActivity: TrackingActivity | null;
  projects: Project[];
  defaultDate?: Date | null;
  onClose: () => void;
  onSave: (activity: Omit<TrackingActivity, 'id' | 'createdAt'>) => void;
  onDelete?: (id: string) => void;
}

const emptyForm = (defaultDate?: Date | null): Omit<TrackingActivity, 'id' | 'createdAt'> => {
  const today = defaultDate || new Date();
  const dStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const week = new Date(today.getTime() + 7 * 86400000);
  const wStr = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, '0')}-${String(week.getDate()).padStart(2, '0')}`;
  return {
    title: '',
    description: '',
    projectId: '',
    assigneeId: '',
    startDate: dStr,
    deadline: wStr,
    status: 'todo',
    priority: 'medium',
  };
};

export default function TrackingActivityModal({ open, editingActivity, projects, defaultDate, onClose, onSave, onDelete }: Props) {
  const [form, setForm] = useState(emptyForm(defaultDate));

  useEffect(() => {
    if (editingActivity) {
      setForm({
        title: editingActivity.title,
        description: editingActivity.description,
        projectId: editingActivity.projectId,
        assigneeId: editingActivity.assigneeId,
        startDate: editingActivity.startDate,
        deadline: editingActivity.deadline,
        status: editingActivity.status,
        priority: editingActivity.priority,
      });
    } else {
      setForm(emptyForm(defaultDate));
    }
  }, [editingActivity, defaultDate, open]);

  if (!open) return null;

  const handleSave = () => {
    if (!form.title.trim()) {
      alert('กรุณากรอกชื่องาน');
      return;
    }
    if (form.startDate && form.deadline && form.startDate > form.deadline) {
      alert('วันเริ่มต้องไม่หลังกำหนดส่ง');
      return;
    }
    onSave(form);
  };

  const handleDelete = () => {
    if (!editingActivity || !onDelete) return;
    if (confirm(`ลบ Activity "${editingActivity.title}"?`)) {
      onDelete(editingActivity.id);
    }
  };

  const priorityColors: Record<TrackingPriority, { active: string; inactive: string }> = {
    low: { active: 'bg-green-100 border-green-500 text-green-700', inactive: 'border-gray-200 text-gray-500 hover:border-green-300' },
    medium: { active: 'bg-yellow-100 border-yellow-500 text-yellow-700', inactive: 'border-gray-200 text-gray-500 hover:border-yellow-300' },
    high: { active: 'bg-red-100 border-red-500 text-red-700', inactive: 'border-gray-200 text-gray-500 hover:border-red-300' },
  };

  const statusColors: Record<TrackingStatus, { active: string; inactive: string }> = {
    todo: { active: 'bg-gray-100 border-gray-500 text-gray-700', inactive: 'border-gray-200 text-gray-500 hover:border-gray-400' },
    in_progress: { active: 'bg-blue-100 border-blue-500 text-blue-700', inactive: 'border-gray-200 text-gray-500 hover:border-blue-400' },
    done: { active: 'bg-green-100 border-green-500 text-green-700', inactive: 'border-gray-200 text-gray-500 hover:border-green-400' },
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[95vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-cyan-50 to-blue-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow">
              <CalendarDays size={18} className="text-white" />
            </div>
            <h2 className="font-semibold text-gray-900">{editingActivity ? 'แก้ไข Activity' : 'เพิ่ม Activity ใหม่'}</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-white/60">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่องาน *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="เช่น ส่ง draft proposal"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รายละเอียด</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              rows={2}
              placeholder="รายละเอียดเพิ่มเติม..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">นักวิจัยที่เกี่ยวข้อง</label>
            <select
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">-- ไม่ผูกกับนักวิจัย --</option>
              {projects
                .filter((p) => p.status !== 'completed' || p.id === form.projectId)
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.client || p.name}</option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ผู้รับผิดชอบ</label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, assigneeId: '' })}
                className={`px-3 py-2 rounded-lg text-xs border-2 transition-all ${form.assigneeId === '' ? 'bg-gray-100 border-gray-500 text-gray-700' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
              >
                ไม่ระบุ
              </button>
              {MEMBERS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setForm({ ...form, assigneeId: m.id })}
                  className="px-3 py-2 rounded-lg text-xs border-2 transition-all flex items-center justify-center gap-1.5"
                  style={{
                    backgroundColor: form.assigneeId === m.id ? `${m.color}20` : '',
                    borderColor: form.assigneeId === m.id ? m.color : '',
                    color: form.assigneeId === m.id ? m.color : '#6b7280',
                  }}
                >
                  <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ backgroundColor: m.color }}>
                    {m.shortName}
                  </span>
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันเริ่ม</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">กำหนดส่ง</label>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">ความสำคัญ</label>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as TrackingPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setForm({ ...form, priority: p })}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${form.priority === p ? priorityColors[p].active : priorityColors[p].inactive}`}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">สถานะ</label>
            <div className="grid grid-cols-3 gap-2">
              {(['todo', 'in_progress', 'done'] as TrackingStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm({ ...form, status: s })}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${form.status === s ? statusColors[s].active : statusColors[s].inactive}`}
                >
                  {TRACKING_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 p-5 border-t border-gray-100">
          {editingActivity && onDelete ? (
            <button onClick={handleDelete} className="flex items-center gap-1 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
              <Trash2 size={14} /> ลบ
            </button>
          ) : <div />}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">ยกเลิก</button>
            <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-lg text-sm font-medium hover:from-cyan-700 hover:to-blue-700 shadow">
              <Save size={16} /> บันทึก
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
