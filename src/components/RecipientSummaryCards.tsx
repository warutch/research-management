'use client';

import { RecipientId, MemberId, Project, DistributionRecord, getCommission } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { Download, Plus } from 'lucide-react';

export interface SummaryMemberRow {
  id: MemberId;
  name: string;
  shortName: string;
  color: string;
  total: number;
  shouldPayNow: number;
  reimburseTotal: number;
}

interface Props {
  project: Project;
  distributions: DistributionRecord[];
  memberShares: SummaryMemberRow[];
  totalPaidReal: number;
  grandTotal: number;
  horseShouldPayNow: number;
  horseTotal: number;
  poolShouldPayNow: number;
  poolTotal: number;
  commissionShouldPay: number;
  editMode: boolean;
  onExportPdf: () => void;
  onExportXlsx: () => void;
  onAddDistribution: () => void;
}

// การ์ดสรุปส่วนแบ่งรายผู้รับ (สมาชิก + Manager + Pool + Commission) — แยกจาก projects/page (R3)
export default function RecipientSummaryCards({
  project, distributions, memberShares, totalPaidReal, grandTotal,
  horseShouldPayNow, horseTotal, poolShouldPayNow, poolTotal, commissionShouldPay,
  editMode, onExportPdf, onExportXlsx, onAddDistribution,
}: Props) {
  const projDists = distributions.filter((d) => d.projectId === project.id);
  const distPaid = (rid: RecipientId) => projDists.filter((d) => d.recipientId === rid).reduce((s, d) => s + d.amount, 0);
  const hasCommission = getCommission(project) > 0;

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h5 className="text-sm font-semibold text-gray-700">สรุปส่วนแบ่ง (จากเงินที่รับมาแล้ว {formatCurrency(totalPaidReal)})</h5>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onExportPdf} title="Export PDF A4 (สำหรับปริ้น)" className="flex items-center gap-1 px-3 py-1.5 text-xs border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50"><Download size={14} /> PDF</button>
          <button onClick={onExportXlsx} title="Export Excel เงินที่ต้องโอนของโครงการนี้" className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"><Download size={14} /> Excel</button>
          {editMode && <button onClick={onAddDistribution} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"><Plus size={14} /> เพิ่มรายการโอน</button>}
        </div>
      </div>
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${hasCommission ? 'lg:grid-cols-6' : 'lg:grid-cols-5'} gap-3`}>
        {memberShares.map((m) => {
          const shouldPay = m.shouldPayNow; // rounded
          const alreadyPaid = distPaid(m.id);
          const remaining = Math.max(0, shouldPay - alreadyPaid);
          const fullyPaid = alreadyPaid >= m.total && m.total > 0;
          return (
            <div key={m.id} className={`rounded-lg border p-3 text-center ${fullyPaid ? 'bg-green-50 border-green-200' : ''}`} style={{ borderColor: fullyPaid ? undefined : `${m.color}40`, background: fullyPaid ? undefined : `${m.color}08` }}>
              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: m.color }}>{m.shortName}</div>
              <p className="text-sm text-gray-700 font-medium">{m.name}</p>
              <p className="text-lg font-bold mt-1" style={{ color: m.color }}>{formatCurrency(m.total)}</p>
              <p className="text-xs text-gray-400">ส่วนแบ่งทั้งโครงการ</p>
              {m.reimburseTotal > 0 && (
                <p className="text-[11px] text-amber-600 mt-0.5">↩ รวมจ่ายคืน +{formatCurrency(m.reimburseTotal)}</p>
              )}
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
        {/* Manager — ไม่โดน commission, ใช้ rounded shouldPay */}
        {(() => {
          const hPaid = distPaid('horse');
          const hRemaining = Math.max(0, horseShouldPayNow - hPaid);
          const hFull = hPaid >= horseTotal && horseTotal > 0;
          return (
            <div className={`rounded-lg border p-3 text-center ${hFull ? 'bg-green-50 border-green-200' : 'border-amber-200 bg-amber-50'}`}>
              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center bg-amber-500 text-white font-bold text-sm">MG</div>
              <p className="text-sm text-gray-700 font-medium">Manager</p>
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
        {/* Pool money — ไม่โดน commission, ใช้ rounded shouldPay */}
        {(() => {
          const pPaid = distPaid('pool');
          const pRemaining = Math.max(0, poolShouldPayNow - pPaid);
          const pFull = pPaid >= poolTotal && poolTotal > 0;
          return (
            <div className={`rounded-lg border p-3 text-center ${pFull ? 'bg-green-50 border-green-200' : 'border-gray-200 bg-gray-50'}`}>
              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center bg-gray-500 text-white font-bold text-sm">PM</div>
              <p className="text-sm text-gray-700 font-medium">Pool money</p>
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
        {/* Commission (เฉพาะโครงการที่กำหนด commission > 0) */}
        {getCommission(project) > 0 && (() => {
          const commTotal = getCommission(project);
          const cPaid = distPaid('commission');
          const cFull = cPaid >= commTotal;
          // commission-first: ต้องโอนจริง = min(commission, ที่ลูกค้าจ่ายมาแล้ว) − โอนแล้ว
          const cRemaining = Math.max(0, commissionShouldPay - cPaid);
          return (
            <div className={`rounded-lg border p-3 text-center ${cFull ? 'bg-green-50 border-green-200' : 'border-rose-200 bg-rose-50'}`}>
              <div className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center bg-rose-500 text-white font-bold text-sm">CM</div>
              <p className="text-sm text-gray-700 font-medium">Commission</p>
              <p className="text-lg font-bold text-rose-600 mt-1">{formatCurrency(commTotal)}</p>
              <p className="text-xs text-gray-400">หักก่อนเป็นอันดับแรก</p>
              {cPaid > 0 && <p className="text-xs text-green-600 mt-1">โอนแล้ว: {formatCurrency(cPaid)}</p>}
              {totalPaidReal > 0 && !cFull && cRemaining > 0 && (
                <div className="mt-2 px-2 py-1.5 bg-blue-50 rounded-md">
                  <p className="text-sm text-blue-700 font-bold">ต้องโอน: {formatCurrency(cRemaining)}</p>
                </div>
              )}
              {cFull && <p className="text-sm text-green-600 font-bold mt-2">✅ โอนครบแล้ว</p>}
            </div>
          );
        })()}
      </div>
      {totalPaidReal > 0 && (
        <div className="mt-3 p-3 bg-indigo-50 rounded-lg flex items-center justify-between text-sm">
          <span className="text-indigo-700">เงินที่รับมาแล้ว: <strong>{formatCurrency(totalPaidReal)}</strong> จากทั้งหมด <strong>{formatCurrency(grandTotal)}</strong> ({grandTotal > 0 ? Math.round((totalPaidReal / grandTotal) * 100) : 0}%)</span>
          <span className={totalPaidReal >= grandTotal ? 'text-green-600 font-bold' : 'text-yellow-600'}>{totalPaidReal >= grandTotal ? '✅ รับครบแล้ว' : `คงค้าง ${formatCurrency(grandTotal - totalPaidReal)}`}</span>
        </div>
      )}
    </div>
  );
}
