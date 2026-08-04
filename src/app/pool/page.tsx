'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/store/useStore';
import {
  MEMBERS, MemberId, PoolTransaction, PoolTxType, DistributionRecord, Project,
  POOL_TX_LABELS, POOL_TX_ICONS,
  getPoolTxDirection, getPoolTxSignedAmount,
  calcPoolBalance, getSlips, recordHasSlip,
} from '@/types';
import { useHydrated } from '@/lib/useHydrated';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Modal } from '@/components/Modal';
import { toast } from '@/components/Toast';
import { Tooltip as InfoTip, TooltipRow } from '@/components/Tooltip';
import SlipUploader from '@/components/SlipUploader';
import {
  Wallet, TrendingUp, TrendingDown, Plus, Pencil, Trash2, Save, X, Image as ImageIcon,
  Landmark, ArrowDownToLine, ShoppingCart, User, Users, FileText, FolderKanban, ExternalLink,
} from 'lucide-react';

type TxFormState = Omit<PoolTransaction, 'id' | 'createdAt'>;

const emptyForm = (type: PoolTxType = 'transfer_in'): TxFormState => ({
  type,
  amount: 0,
  date: new Date().toISOString().slice(0, 10),
  source: '',
  category: '',
  recipientMemberId: undefined,
  recipientName: '',
  description: '',
  slipUrls: [],
});

const TYPE_META: Record<PoolTxType, { icon: typeof Landmark; color: string }> = {
  opening_balance: { icon: Landmark, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  transfer_in:     { icon: ArrowDownToLine, color: 'text-green-600 bg-green-50 border-green-200' },
  spending:        { icon: ShoppingCart, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  to_member:       { icon: User, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  to_other:        { icon: Users, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  other_in:        { icon: FileText, color: 'text-teal-600 bg-teal-50 border-teal-200' },
  other_out:       { icon: FileText, color: 'text-rose-600 bg-rose-50 border-rose-200' },
};

// Type filter: PoolTxType + virtual 'from_project'
type FilterType = PoolTxType | 'from_project' | 'all';

// Unified list item: manual pool_tx OR distribution จากโครงการ
type ListItem =
  | { kind: 'pool_tx'; date: string; tx: PoolTransaction }
  | { kind: 'from_project'; date: string; dist: DistributionRecord; project: Project | null };

export default function PoolPage() {
  const hydrated = useHydrated();
  const {
    poolTransactions,
    _allDistributions,
    _allProjects,
    addPoolTransaction, updatePoolTransaction, deletePoolTransaction,
    fetchSlipsFor, editMode,
  } = useStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TxFormState>(emptyForm());
  const [viewSlipUrl, setViewSlipUrl] = useState<string | null>(null);
  const [loadingSlipId, setLoadingSlipId] = useState<string | null>(null);

  // Lazy-fetch + view slip helper สำหรับทั้ง pool_tx และ distribution
  const handleViewFirstSlip = async (kind: 'pool_tx' | 'distribution', recordId: string, currentSlips: string[]) => {
    if (currentSlips.length > 0) {
      setViewSlipUrl(currentSlips[0]);
      return;
    }
    setLoadingSlipId(recordId);
    try {
      const slips = await fetchSlipsFor(kind, recordId);
      if (slips.length === 0) {
        toast.info('ไม่มี slip แนบไว้');
      } else {
        setViewSlipUrl(slips[0]);
      }
    } finally {
      setLoadingSlipId(null);
    }
  };

  // Filters
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all'); // 'yyyy-mm' or 'all'

  const openAdd = (type: PoolTxType) => {
    setEditingId(null);
    setForm(emptyForm(type));
    setModalOpen(true);
  };

  const openEdit = (tx: PoolTransaction) => {
    setEditingId(tx.id);
    setForm({
      type: tx.type,
      amount: tx.amount,
      date: tx.date,
      source: tx.source || '',
      category: tx.category || '',
      recipientMemberId: tx.recipientMemberId,
      recipientName: tx.recipientName || '',
      description: tx.description,
      slipUrls: tx.slipUrls || [],
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!form.amount || form.amount <= 0) { toast.error('กรุณาระบุจำนวนเงินที่มากกว่า 0'); return; }
    if (!form.date) { toast.error('กรุณาระบุวันที่'); return; }
    if (form.type === 'to_member' && !form.recipientMemberId) { toast.error('กรุณาเลือกสมาชิกผู้รับ'); return; }
    if (form.type === 'to_other' && !form.recipientName?.trim()) { toast.error('กรุณาระบุชื่อผู้รับ'); return; }

    if (editingId) {
      updatePoolTransaction(editingId, form);
      toast.success('แก้ไขรายการเรียบร้อย');
    } else {
      addPoolTransaction(form);
      const dir = getPoolTxDirection(form.type);
      const sign = dir === 'in' ? '+' : '-';
      toast.success(`บันทึกรายการ ${POOL_TX_LABELS[form.type]} ${sign}${formatCurrency(form.amount)}`);
    }
    setModalOpen(false);
    setEditingId(null);
  };

  const handleDelete = (tx: PoolTransaction) => {
    if (!confirm(`ลบรายการ "${POOL_TX_LABELS[tx.type]} ${formatCurrency(tx.amount)}"?`)) return;
    deletePoolTransaction(tx.id);
    toast.success('ลบรายการเรียบร้อย');
  };

  // ============ derived state ============
  const balance = useMemo(
    () => calcPoolBalance(poolTransactions, _allDistributions),
    [poolTransactions, _allDistributions],
  );

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let inThisMonth = 0;
    let outThisMonth = 0;
    for (const t of poolTransactions) {
      if (!t.date.startsWith(thisMonth)) continue;
      if (getPoolTxDirection(t.type) === 'in') inThisMonth += t.amount;
      else outThisMonth += t.amount;
    }
    // + distributions ไป pool ในเดือนนี้ (auto inflow)
    const distFromProjects = _allDistributions
      .filter((d) => d.recipientId === 'pool' && d.paidDate.startsWith(thisMonth))
      .reduce((s, d) => s + d.amount, 0);
    return { in: inThisMonth + distFromProjects, out: outThisMonth };
  }, [poolTransactions, _allDistributions]);

  const totalInflow = useMemo(() => {
    const fromTx = poolTransactions.filter((t) => getPoolTxDirection(t.type) === 'in').reduce((s, t) => s + t.amount, 0);
    const fromDist = _allDistributions.filter((d) => d.recipientId === 'pool').reduce((s, d) => s + d.amount, 0);
    return { fromTx, fromDist, total: fromTx + fromDist };
  }, [poolTransactions, _allDistributions]);

  const totalOutflow = useMemo(
    () => poolTransactions.filter((t) => getPoolTxDirection(t.type) === 'out').reduce((s, t) => s + t.amount, 0),
    [poolTransactions],
  );

  // รวมรายการ manual pool_tx + distribution ที่ recipient='pool' (auto จากโครงการ)
  const allItems = useMemo<ListItem[]>(() => {
    const manual: ListItem[] = poolTransactions.map((tx) => ({
      kind: 'pool_tx' as const,
      date: tx.date,
      tx,
    }));
    const fromProjects: ListItem[] = _allDistributions
      .filter((d) => d.recipientId === 'pool')
      .map((d) => ({
        kind: 'from_project' as const,
        date: d.paidDate,
        dist: d,
        project: _allProjects.find((p) => p.id === d.projectId) || null,
      }));
    return [...manual, ...fromProjects];
  }, [poolTransactions, _allDistributions, _allProjects]);

  // Month options — รวมทั้ง manual + distribution
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    allItems.forEach((it) => { if (it.date) months.add(it.date.slice(0, 7)); });
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [allItems]);

  // helper: createdAt สำหรับ tie-breaker (เมื่อวันที่ธุรกรรมตรงกัน)
  const getItemCreatedAt = (it: ListItem): string => {
    if (it.kind === 'pool_tx') return it.tx.createdAt || '';
    return it.dist.createdAt || '';
  };

  // Filter + sort:
  //   primary   → date desc (วันที่เกิดธุรกรรม, ใหม่ล่าสุดบนสุด)
  //   secondary → createdAt desc (ถ้าวันเดียวกัน — บันทึกล่าสุดขึ้นก่อน)
  const filtered = useMemo(() => {
    return allItems
      .filter((it) => {
        if (typeFilter === 'all') return true;
        if (typeFilter === 'from_project') return it.kind === 'from_project';
        return it.kind === 'pool_tx' && it.tx.type === typeFilter;
      })
      .filter((it) => (monthFilter === 'all' || (it.date || '').startsWith(monthFilter)))
      .sort((a, b) => {
        const byDate = (b.date || '').localeCompare(a.date || '');
        if (byDate !== 0) return byDate;
        return (getItemCreatedAt(b)).localeCompare(getItemCreatedAt(a));
      });
  }, [allItems, typeFilter, monthFilter]);

  // signed amount ของแต่ละ item (+ = in, − = out)
  const getItemSignedAmount = (it: ListItem): number => {
    if (it.kind === 'from_project') return it.dist.amount; // จากโครงการ = in เสมอ
    return getPoolTxSignedAmount(it.tx);
  };

  // Running balance สำหรับแสดงข้างขวาของแต่ละแถว
  const filteredWithBalance = useMemo(() => {
    const rows: Array<{ item: ListItem; balanceAfter: number }> = [];
    let running = balance;
    for (const item of filtered) {
      rows.push({ item, balanceAfter: running });
      running -= getItemSignedAmount(item);
    }
    return rows;
  }, [filtered, balance]);

  if (!hydrated) return <div className="flex items-center justify-center h-64 text-gray-400">กำลังโหลด...</div>;

  const dir = getPoolTxDirection(form.type);
  const TypeIcon = TYPE_META[form.type].icon;

  return (
    <div className="space-y-6">
      {/* Balance card */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-500 to-purple-600 rounded-2xl shadow-lg p-6 text-white">
        <div className="flex items-center gap-2 mb-2 opacity-90">
          <Wallet size={18} />
          <span className="text-sm">ยอดคงเหลือปัจจุบัน (Pool money)</span>
        </div>
        <InfoTip
          content={(
            <div className="space-y-1 min-w-[260px]">
              <p className="font-medium text-white mb-1.5 border-b border-gray-700 pb-1">ที่มาของยอด</p>
              <TooltipRow label="รับเข้าจากการโอนส่วนแบ่ง (Distribution → pool)" value={formatCurrency(totalInflow.fromDist)} accent="green" />
              <TooltipRow label="ยกยอดเข้า/อื่น ๆ (รายการนี้)" value={formatCurrency(totalInflow.fromTx)} accent="green" />
              <TooltipRow label="จ่ายออกทั้งหมด" value={`−${formatCurrency(totalOutflow)}`} accent="rose" />
              <div className="border-t border-gray-700 mt-1 pt-1">
                <TooltipRow label="ยอดคงเหลือ" value={formatCurrency(balance)} />
              </div>
            </div>
          )}
        >
          <p className="text-4xl font-bold tabular-nums cursor-help underline decoration-dotted decoration-white/40 underline-offset-4">
            {formatCurrency(balance)}
          </p>
        </InfoTip>
        <div className="flex flex-wrap gap-4 mt-4 text-sm">
          <div className="flex items-center gap-1.5">
            <TrendingUp size={14} className="text-emerald-300" />
            <span className="opacity-80">รับเข้าเดือนนี้:</span>
            <span className="font-semibold">{formatCurrency(monthlyStats.in)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingDown size={14} className="text-rose-300" />
            <span className="opacity-80">จ่ายออกเดือนนี้:</span>
            <span className="font-semibold">{formatCurrency(monthlyStats.out)}</span>
          </div>
        </div>
      </div>

      {/* Quick action buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {([
          { type: 'transfer_in', label: 'ยกยอดเข้า', color: 'from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700' },
          { type: 'spending', label: 'จ่ายค่าใช้จ่าย', color: 'from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700' },
          { type: 'to_member', label: 'โอนให้สมาชิก', color: 'from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700' },
          { type: 'to_other', label: 'โอนให้บุคคลอื่น', color: 'from-purple-500 to-fuchsia-600 hover:from-purple-600 hover:to-fuchsia-700' },
          { type: 'other_out', label: 'อื่น ๆ', color: 'from-gray-500 to-slate-600 hover:from-gray-600 hover:to-slate-700' },
        ] as { type: PoolTxType; label: string; color: string }[]).map((btn) => (
          <button
            key={btn.type}
            onClick={() => openAdd(btn.type)}
            className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-white rounded-lg shadow bg-gradient-to-br ${btn.color} transition-colors`}
          >
            <Plus size={14} /> {btn.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">ประเภท:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as FilterType)}
            className="border rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">ทุกประเภท</option>
            <option value="from_project">📥 จากโครงการ (auto)</option>
            {(Object.keys(POOL_TX_LABELS) as PoolTxType[]).map((t) => (
              <option key={t} value={t}>{POOL_TX_ICONS[t]} {POOL_TX_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">เดือน:</span>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="border rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">ทั้งหมด</option>
            {monthOptions.map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} รายการ</span>
      </div>

      {/* Transactions list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          {typeFilter === 'all' && monthFilter === 'all'
            ? 'ยังไม่มีรายการ Pool money — กดปุ่มด้านบนเพื่อเริ่มบันทึก'
            : 'ไม่พบรายการที่ตรงกับ filter'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 text-left">
                  <th className="px-4 py-2 font-medium">วันที่</th>
                  <th className="px-4 py-2 font-medium">ประเภท</th>
                  <th className="px-4 py-2 font-medium">รายละเอียด</th>
                  <th className="px-4 py-2 font-medium text-right">จำนวน</th>
                  <th className="px-4 py-2 font-medium text-right">ยอดคงเหลือ</th>
                  <th className="px-4 py-2 font-medium text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredWithBalance.map(({ item, balanceAfter }) => {
                  // === row: จากโครงการ (Distribution) ===
                  if (item.kind === 'from_project') {
                    const { dist, project } = item;
                    const slips = getSlips(dist);
                    return (
                      <tr key={`d-${dist.id}`} className="border-t border-gray-100 hover:bg-gray-50/50 bg-green-50/20">
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{dist.paidDate ? formatDate(dist.paidDate) : '-'}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border text-green-700 bg-green-50 border-green-200">
                            <FolderKanban size={11} /> จากโครงการ
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">
                          <div className="flex flex-col">
                            <span>
                              {project ? (
                                <>
                                  <span className="font-mono text-xs text-gray-500 mr-1">{project.projectCode}</span>
                                  {project.name}
                                </>
                              ) : (
                                <span className="text-gray-400 italic">โครงการถูกลบ</span>
                              )}
                            </span>
                            <span className="text-xs text-gray-500">
                              {project?.client && `ผู้วิจัย: ${project.client}`}
                              {dist.note && ` • ${dist.note}`}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-green-600 whitespace-nowrap">
                          {`+${formatCurrency(dist.amount)}`}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums whitespace-nowrap">{formatCurrency(balanceAfter)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {recordHasSlip(dist) && (
                              <button
                                onClick={() => handleViewFirstSlip('distribution', dist.id, slips)}
                                disabled={loadingSlipId === dist.id}
                                className="p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-50"
                                title={loadingSlipId === dist.id ? 'กำลังโหลด...' : 'ดู Slip'}
                              >
                                <ImageIcon size={13} />
                              </button>
                            )}
                            {project && (
                              <Link href={`/projects?id=${project.id}`} className="p-1 text-gray-400 hover:text-indigo-600" title="ไปที่โครงการ">
                                <ExternalLink size={13} />
                              </Link>
                            )}
                            {editMode && (
                            <span className="p-1 text-gray-300" title="แก้ไขในหน้าโครงการเท่านั้น">
                              <Trash2 size={13} />
                            </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  // === row: manual pool_tx ===
                  const { tx } = item;
                  const isIn = getPoolTxDirection(tx.type) === 'in';
                  const meta = TYPE_META[tx.type];
                  const Icon = meta.icon;
                  const slips = tx.slipUrls || [];
                  return (
                    <tr key={`t-${tx.id}`} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{tx.date ? formatDate(tx.date) : '-'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${meta.color}`}>
                          <Icon size={11} /> {POOL_TX_LABELS[tx.type]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">
                        <div className="flex flex-col">
                          <span>{tx.description || <span className="text-gray-400 italic">ไม่มีรายละเอียด</span>}</span>
                          <span className="text-xs text-gray-500">
                            {tx.type === 'transfer_in' && tx.source && `จาก: ${tx.source}`}
                            {tx.type === 'spending' && tx.category && `หมวด: ${tx.category}`}
                            {tx.type === 'to_member' && tx.recipientMemberId && `→ ${MEMBERS.find((m) => m.id === tx.recipientMemberId)?.name || tx.recipientMemberId}`}
                            {tx.type === 'to_other' && tx.recipientName && `→ ${tx.recipientName}`}
                          </span>
                        </div>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap ${isIn ? 'text-green-600' : 'text-rose-600'}`}>
                        {`${isIn ? '+' : '−'}${formatCurrency(tx.amount)}`}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 tabular-nums whitespace-nowrap">{formatCurrency(balanceAfter)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {recordHasSlip(tx) && (
                            <button
                              onClick={() => handleViewFirstSlip('pool_tx', tx.id, slips)}
                              disabled={loadingSlipId === tx.id}
                              className="p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-50"
                              title={loadingSlipId === tx.id ? 'กำลังโหลด...' : 'ดู Slip'}
                            >
                              <ImageIcon size={13} />
                            </button>
                          )}
                          {editMode && <button onClick={() => openEdit(tx)} className="p-1 text-gray-400 hover:text-gray-600" title="แก้ไข"><Pencil size={13} /></button>}
                          {editMode && <button onClick={() => handleDelete(tx)} className="p-1 text-gray-400 hover:text-red-500" title="ลบ"><Trash2 size={13} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold text-gray-700">
                  <td className="px-4 py-2.5" colSpan={3}>รวมที่แสดง</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {(() => {
                      let inSum = 0, outSum = 0;
                      for (const it of filtered) {
                        const amt = getItemSignedAmount(it);
                        if (amt >= 0) inSum += amt;
                        else outSum += -amt;
                      }
                      const net = inSum - outSum;
                      return <span className={`whitespace-nowrap ${net >= 0 ? 'text-green-600' : 'text-rose-600'}`}>{`${net >= 0 ? '+' : ''}${formatCurrency(net)}`}</span>;
                    })()}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-500 text-xs">ยอด ณ ปัจจุบัน: <strong className="text-gray-700">{formatCurrency(balance)}</strong></td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="md"
        title={(
          <span className="flex items-center gap-2">
            <TypeIcon size={16} className={dir === 'in' ? 'text-green-600' : 'text-rose-600'} />
            {editingId ? 'แก้ไขรายการ' : 'เพิ่มรายการ'}: {POOL_TX_LABELS[form.type]}
          </span>
        )}
        footer={(
          <>
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">ยกเลิก</button>
            <button
              onClick={handleSave}
              className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium shadow bg-gradient-to-r ${dir === 'in' ? 'from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700' : 'from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700'}`}
            >
              <Save size={16} /> บันทึก
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          {/* Type selector */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">ประเภทรายการ</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as PoolTxType })}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {(Object.keys(POOL_TX_LABELS) as PoolTxType[]).map((t) => (
                <option key={t} value={t}>{POOL_TX_ICONS[t]} {POOL_TX_LABELS[t]} ({getPoolTxDirection(t) === 'in' ? 'รับเข้า' : 'จ่ายออก'})</option>
              ))}
            </select>
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">จำนวนเงิน (บาท) *</label>
              <input
                type="number"
                min={0}
                value={form.amount || ''}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">วันที่ *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Type-specific fields */}
          {form.type === 'transfer_in' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">โอนมาจาก (บัญชี/แหล่ง)</label>
              <input
                type="text"
                value={form.source || ''}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="เช่น KBANK ***1234"
              />
            </div>
          )}
          {form.type === 'spending' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">หมวดค่าใช้จ่าย</label>
              <input
                type="text"
                value={form.category || ''}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="เช่น office, travel, subscription"
              />
            </div>
          )}
          {form.type === 'to_member' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">โอนให้สมาชิก *</label>
              <select
                value={form.recipientMemberId || ''}
                onChange={(e) => setForm({ ...form, recipientMemberId: (e.target.value || undefined) as MemberId | undefined })}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- เลือกสมาชิก --</option>
                {MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
              </select>
            </div>
          )}
          {form.type === 'to_other' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">ชื่อผู้รับ *</label>
              <input
                type="text"
                value={form.recipientName || ''}
                onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="ชื่อบุคคล/บริษัทที่รับเงิน"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">รายละเอียด</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="หมายเหตุ..."
            />
          </div>

          {/* Slip uploader */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Slip / หลักฐาน (ถ้ามี)</label>
            <SlipUploader
              values={form.slipUrls || []}
              onChange={(urls) => setForm({ ...form, slipUrls: urls })}
              onPreview={(url) => setViewSlipUrl(url)}
              color="indigo"
            />
          </div>
        </div>
      </Modal>

      {/* Slip viewer */}
      {viewSlipUrl && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={() => setViewSlipUrl(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl max-h-[90vh] overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-gray-900">Slip</h3>
              <button onClick={() => setViewSlipUrl(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewSlipUrl} alt="Slip" className="max-w-full h-auto rounded" />
          </div>
        </div>
      )}
    </div>
  );
}
