'use client';

import { MEMBERS, MemberId, RecipientId, Project, DistributionRecord,
  ALL_SHORT_NAMES, ALL_SHARE_NAMES, getSlips, recordHasSlip } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Image, Loader2, Trash2 } from 'lucide-react';

interface Props {
  project: Project;
  distributions: DistributionRecord[];
  memberShares: { id: MemberId; name: string; total: number }[];
  horseTotal: number;
  poolTotal: number;
  commissionAmount: number;
  editMode: boolean;
  loadingSlipId: string | null;
  onViewSlip: (distId: string, slips: string[]) => void;
  onDelete: (distId: string) => void;
}

// รายการโอนเงินที่บันทึกแล้ว + สรุปยอดแยกตามผู้รับ — แยกจาก projects/page (R3)
export default function DistributionHistoryList({
  project, distributions, memberShares, horseTotal, poolTotal, commissionAmount, editMode, loadingSlipId, onViewSlip, onDelete,
}: Props) {
  const projDists = distributions.filter((d) => d.projectId === project.id).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  // สรุปโอนแล้วแยกตามผู้รับ
  const distByRecipient = (rid: RecipientId) => projDists.filter((d) => d.recipientId === rid).reduce((s, d) => s + d.amount, 0);
  const totalDist = projDists.reduce((s, d) => s + d.amount, 0);

  if (projDists.length === 0) {
    return <p className="text-gray-400 text-sm text-center py-3">ยังไม่มีรายการโอนเงินให้สมาชิก</p>;
  }

  return (
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
                  onClick={() => onViewSlip(dist.id, slips)}
                  disabled={isLoading}
                  className="relative p-1 text-gray-400 hover:text-indigo-600 disabled:opacity-50"
                  title={isLoading ? 'กำลังโหลด slip...' : `ดู Slip${slips.length > 0 ? ` (${slips.length} รูป)` : ''}`}
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin text-green-600" /> : <Image size={16} />}
                  {slips.length > 1 && (
                    <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">{slips.length}</span>
                  )}
                </button>
              );
            })()}
            {editMode && <button onClick={() => onDelete(dist.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>}
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
  );
}
