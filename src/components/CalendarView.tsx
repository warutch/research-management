'use client';

import { TrackingActivity, TRACKING_STATUS_DOTS, PRIORITY_COLORS, MEMBERS, ALL_SHORT_NAMES, TRACKING_STATUS_LABELS, PRIORITY_LABELS, Project } from '@/types';
import { formatCurrency } from '@/lib/utils';

export type CalendarViewMode = 'month' | 'week' | 'list';

interface Props {
  activities: TrackingActivity[];
  view: CalendarViewMode;
  currentDate: Date;
  projects: Project[];
  onActivityClick: (activity: TrackingActivity) => void;
  onDateClick?: (date: Date) => void;
}

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const THAI_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

// ============ Helpers ============
function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isInRange(date: Date, start: Date, end: Date): boolean {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return d >= s && d <= e;
}

function getMonthMatrix(date: Date): Date[][] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=Sun
  const start = new Date(year, month, 1 - startOffset);
  const matrix: Date[][] = [];
  for (let week = 0; week < 6; week++) {
    const row: Date[] = [];
    for (let day = 0; day < 7; day++) {
      row.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + week * 7 + day));
    }
    matrix.push(row);
  }
  return matrix;
}

function getWeekDates(date: Date): Date[] {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function formatTHDate(d: Date): string {
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// ============ Activity in date helper ============
function activitiesOnDate(activities: TrackingActivity[], date: Date): TrackingActivity[] {
  return activities.filter((a) => {
    const start = parseDate(a.startDate);
    const end = parseDate(a.deadline);
    if (!start && !end) return false;
    const s = start || end!;
    const e = end || start!;
    return isInRange(date, s, e);
  });
}

function getProjectColor(projectId: string, projects: Project[]): string {
  const idx = projects.findIndex((p) => p.id === projectId);
  if (idx === -1) return '#6b7280';
  const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16'];
  return colors[idx % colors.length];
}

// ============ Calendar header (month label) ============
export function getCalendarHeader(view: CalendarViewMode, currentDate: Date): string {
  if (view === 'month') return `${THAI_MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear() + 543}`;
  if (view === 'week') {
    const week = getWeekDates(currentDate);
    const start = week[0];
    const end = week[6];
    return `${start.getDate()} ${THAI_MONTHS[start.getMonth()]} - ${end.getDate()} ${THAI_MONTHS[end.getMonth()]} ${end.getFullYear() + 543}`;
  }
  return `${THAI_MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear() + 543}`;
}

// ============ Lane assignment for week row ============
// Returns array of "rows" of activities, where each row contains non-overlapping activities
// Each item: { activity, startCol, endCol } where col is 0-6 (sun-sat)
function assignLanes(weekDates: Date[], activities: TrackingActivity[]) {
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  // Filter & compute span for activities that intersect this week
  const items = activities
    .map((a) => {
      const start = parseDate(a.startDate);
      const end = parseDate(a.deadline);
      if (!start && !end) return null;
      const s = start || end!;
      const e = end || start!;
      // Skip if completely outside this week
      const wsTime = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()).getTime();
      const weTime = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate()).getTime();
      const sTime = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
      const eTime = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
      if (eTime < wsTime || sTime > weTime) return null;

      // Clamp to week boundaries
      const startCol = sTime <= wsTime ? 0 : weekDates.findIndex((d) => isSameDay(d, s));
      const endCol = eTime >= weTime ? 6 : weekDates.findIndex((d) => isSameDay(d, e));
      const continuesLeft = sTime < wsTime;
      const continuesRight = eTime > weTime;
      return { activity: a, startCol, endCol, continuesLeft, continuesRight };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    // sort by startCol then by length desc
    .sort((a, b) => {
      if (a.startCol !== b.startCol) return a.startCol - b.startCol;
      return (b.endCol - b.startCol) - (a.endCol - a.startCol);
    });

  // Greedy lane assignment
  const lanes: Array<Array<typeof items[0]>> = [];
  for (const item of items) {
    let placed = false;
    for (const lane of lanes) {
      const lastInLane = lane[lane.length - 1];
      if (!lastInLane || lastInLane.endCol < item.startCol) {
        lane.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([item]);
  }
  return lanes;
}

// ============ Main Component ============
export default function CalendarView({ activities, view, currentDate, projects, onActivityClick, onDateClick }: Props) {
  const today = new Date();

  if (view === 'month') {
    const matrix = getMonthMatrix(currentDate);
    const MAX_LANES = 4;
    const LANE_HEIGHT = 26; // px ต่อ lane (เพิ่มจาก 20 → 26)
    const LANE_GAP = 3;
    const TOP_OFFSET = 28; // จากเลขวันที่

    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
          {THAI_DAYS_SHORT.map((day, i) => (
            <div key={i} className={`px-2 py-2 text-center text-xs font-bold ${i === 0 || i === 6 ? 'text-red-500' : 'text-gray-700'}`}>
              {day}
            </div>
          ))}
        </div>

        {/* Week rows */}
        {matrix.map((week, weekIdx) => {
          const lanes = assignLanes(week, activities);
          const visibleLanes = lanes.slice(0, MAX_LANES);
          const hiddenCount = lanes.length - visibleLanes.length;
          // คำนวณความสูงของ row ให้พอกับ lanes
          const rowMinHeight = TOP_OFFSET + visibleLanes.length * (LANE_HEIGHT + LANE_GAP) + 16;

          // หาว่าวันนี้อยู่คอลัมน์ไหนใน week นี้
          const todayCol = week.findIndex((d) => isSameDay(d, today));

          return (
            <div key={weekIdx} className="relative border-b border-gray-100 last:border-b-0">
              {/* Date cells */}
              <div className="grid grid-cols-7">
                {week.map((date, i) => {
                  const isCurrentMonth = date.getMonth() === currentDate.getMonth();
                  const isToday = isSameDay(date, today);
                  return (
                    <div
                      key={i}
                      onClick={() => onDateClick?.(date)}
                      style={{ minHeight: Math.max(130, rowMinHeight) }}
                      className={`border-r border-gray-100 last:border-r-0 p-2 cursor-pointer hover:bg-gray-50/60 transition-colors ${!isCurrentMonth ? 'opacity-40 bg-gray-50/30' : ''} ${isToday ? 'bg-blue-50/40' : ''}`}
                    >
                      {isToday ? (
                        // วันนี้ — render เลขผ่าน overlay layer ด้านบน (เพื่อให้อยู่เหนือ activity bars)
                        <div className="h-7" />
                      ) : (
                        <div className={`text-sm font-bold ${date.getDay() === 0 || date.getDay() === 6 ? 'text-red-500' : 'text-gray-700'}`}>
                          {date.getDate()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Activity bars overlay */}
              <div className="absolute left-0 right-0 pointer-events-none" style={{ top: TOP_OFFSET }}>
                {visibleLanes.map((lane, laneIdx) => (
                  <div key={laneIdx} className="relative" style={{ height: LANE_HEIGHT, marginBottom: LANE_GAP }}>
                    {lane.map((item) => {
                      const { activity: act, startCol, endCol, continuesLeft, continuesRight } = item;
                      const projColor = act.projectId ? getProjectColor(act.projectId, projects) : '#6b7280';
                      const widthPct = ((endCol - startCol + 1) / 7) * 100;
                      const leftPct = (startCol / 7) * 100;
                      const isDone = act.status === 'done';

                      return (
                        <button
                          key={act.id}
                          onClick={(e) => { e.stopPropagation(); onActivityClick(act); }}
                          className={`absolute top-0 text-xs font-semibold pointer-events-auto hover:brightness-95 hover:shadow-lg transition-all flex items-center gap-1.5 px-2 truncate shadow-sm ${continuesLeft ? '' : 'rounded-l-md'} ${continuesRight ? '' : 'rounded-r-md'}`}
                          style={{
                            left: `calc(${leftPct}% + 3px)`,
                            width: `calc(${widthPct}% - 6px)`,
                            height: LANE_HEIGHT,
                            backgroundColor: projColor,
                            color: 'white',
                            borderLeft: continuesLeft ? `2px dashed rgba(255,255,255,0.7)` : 'none',
                            borderRight: continuesRight ? `2px dashed rgba(255,255,255,0.7)` : 'none',
                            textShadow: '0 1px 2px rgba(0,0,0,0.25)',
                          }}
                          title={`${act.title}${act.startDate ? ` (${act.startDate}` : ''}${act.deadline ? ` → ${act.deadline})` : act.startDate ? ')' : ''}`}
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${TRACKING_STATUS_DOTS[act.status]} ring-2 ring-white/80`} />
                          <span className={`truncate flex-1 text-left ${isDone ? 'line-through opacity-80' : ''}`}>{act.title}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {hiddenCount > 0 && (
                  <div className="text-xs font-medium text-gray-600 px-3 pt-1 pointer-events-none">
                    +{hiddenCount} แถวเพิ่มเติม
                  </div>
                )}
              </div>

              {/* Today highlight overlay (อยู่บนสุดเหนือ activity bars) */}
              {todayCol !== -1 && (
                <div
                  className="absolute pointer-events-none rounded-md ring-2 ring-blue-500"
                  style={{
                    left: `calc(${(todayCol / 7) * 100}% + 2px)`,
                    width: `calc(${100 / 7}% - 4px)`,
                    top: 2,
                    bottom: 2,
                    boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.2), 0 4px 12px rgba(59, 130, 246, 0.25)',
                    zIndex: 20,
                  }}
                >
                  {/* Today date circle - on top of activity bars */}
                  <div className="absolute top-1.5 left-1.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold shadow-lg ring-2 ring-white">
                    {week[todayCol].getDate()}
                  </div>
                  {/* Today badge */}
                  <div className="absolute top-2 right-1.5 bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-md">
                    วันนี้
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (view === 'week') {
    const weekDates = getWeekDates(currentDate);
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-200">
          {weekDates.map((date, i) => {
            const isToday = isSameDay(date, today);
            return (
              <div key={i} className={`p-3 text-center border-r border-gray-100 ${isToday ? 'bg-blue-50' : 'bg-gray-50/50'}`}>
                <div className={`text-xs ${i === 0 || i === 6 ? 'text-red-500' : 'text-gray-500'}`}>{THAI_DAYS_SHORT[i]}</div>
                <div className={`text-lg font-bold ${isToday ? 'text-blue-700' : 'text-gray-800'}`}>{date.getDate()}</div>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-7 min-h-[400px]">
          {weekDates.map((date, i) => {
            const dayActs = activitiesOnDate(activities, date);
            return (
              <div key={i} className="border-r border-gray-100 p-2 space-y-1.5">
                {dayActs.length === 0 ? (
                  <p className="text-xs text-gray-300 text-center pt-4">-</p>
                ) : (
                  dayActs.map((act) => {
                    const projColor = act.projectId ? getProjectColor(act.projectId, projects) : '#9ca3af';
                    const project = projects.find((p) => p.id === act.projectId);
                    const isDeadlineDay = act.deadline && isSameDay(parseDate(act.deadline)!, date);
                    return (
                      <button
                        key={act.id}
                        onClick={() => onActivityClick(act)}
                        className="w-full text-left p-2 rounded-lg hover:shadow-sm transition-all text-xs"
                        style={{ backgroundColor: `${projColor}15`, borderLeft: `3px solid ${projColor}` }}
                      >
                        <div className="flex items-center gap-1 mb-1">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TRACKING_STATUS_DOTS[act.status]}`} />
                          <span className={`font-medium truncate flex-1 ${act.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                            {act.title}
                          </span>
                          {isDeadlineDay && <span className="text-red-500">🔴</span>}
                        </div>
                        {project && <p className="text-[10px] text-gray-500 truncate">{project.client || project.name}</p>}
                        {act.assigneeId && (
                          <span className="inline-block mt-1 text-[10px] bg-white border rounded px-1 text-gray-600">
                            {ALL_SHORT_NAMES[act.assigneeId]}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // List view
  const sortedActs = [...activities].sort((a, b) => {
    const ad = parseDate(a.startDate || a.deadline);
    const bd = parseDate(b.startDate || b.deadline);
    if (!ad && !bd) return 0;
    if (!ad) return 1;
    if (!bd) return -1;
    return ad.getTime() - bd.getTime();
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {sortedActs.length === 0 ? (
        <div className="p-12 text-center text-gray-400">ไม่พบ Activity</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b">
                <th className="px-4 py-3 font-medium">วันเริ่ม</th>
                <th className="px-4 py-3 font-medium">Deadline</th>
                <th className="px-4 py-3 font-medium">งาน</th>
                <th className="px-4 py-3 font-medium">นักวิจัย</th>
                <th className="px-4 py-3 font-medium text-center">ผู้รับ</th>
                <th className="px-4 py-3 font-medium text-center">ความสำคัญ</th>
                <th className="px-4 py-3 font-medium text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {sortedActs.map((act) => {
                const project = projects.find((p) => p.id === act.projectId);
                const member = MEMBERS.find((m) => m.id === act.assigneeId);
                const start = parseDate(act.startDate);
                const end = parseDate(act.deadline);
                const isOverdue = end && end < today && act.status !== 'done';
                return (
                  <tr key={act.id} onClick={() => onActivityClick(act)} className="border-b border-gray-50 hover:bg-indigo-50/40 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">{start ? formatTHDate(start) : '-'}</td>
                    <td className={`px-4 py-3 text-xs whitespace-nowrap ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                      {end ? formatTHDate(end) : '-'}
                      {isOverdue && <span className="ml-1">⚠️</span>}
                    </td>
                    <td className="px-4 py-3">
                      <p className={`font-medium ${act.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{act.title}</p>
                      {act.description && <p className="text-xs text-gray-500 truncate max-w-xs">{act.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{project?.client || project?.name || <span className="text-gray-400">-</span>}</td>
                    <td className="px-4 py-3 text-center">
                      {member ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-[10px] font-bold" style={{ backgroundColor: member.color }}>
                          {member.shortName}
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${PRIORITY_COLORS[act.priority]}`}>
                        {PRIORITY_LABELS[act.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-xs">
                        <span className={`w-2 h-2 rounded-full ${TRACKING_STATUS_DOTS[act.status]}`} />
                        {TRACKING_STATUS_LABELS[act.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// formatCurrency unused but kept for potential future use
void formatCurrency;
