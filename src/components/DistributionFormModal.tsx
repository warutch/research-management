'use client';

import { MEMBERS, RecipientId, Project, PaymentRecord, DistributionRecord,
  getCommission, calcRoundedShares, getClientPaid, getDistributed, getOutstanding, recipientShare } from '@/types';
import { formatCurrency } from '@/lib/utils';
import SlipUploader from '@/components/SlipUploader';
import { Banknote, X, Save } from 'lucide-react';

// สถานะฟอร์มโอนเงินให้สมาชิก (ใช้ร่วมกับหน้าโครงการ)
export interface DistFormState {
  projectId: string;
  recipientId: RecipientId | '';
  amount: number;
  paidDate: string;
  slipUrl: string;
  slipUrls: string[];
  note: string;
}

interface Props {
  project: Project;
  distForm: DistFormState;
  setDistForm: (f: DistFormState) => void;
  payments: PaymentRecord[];
  distributions: DistributionRecord[];
  onClose: () => void;
  onSave: () => void;
  onPreviewSlip: (url: string) => void;
}

// Modal เพิ่มรายการโอนเงินให้สมาชิก — แยกออกจาก projects/page เพื่อลดขนาดไฟล์ (R3)
export default function DistributionFormModal({ project, distForm, setDistForm, payments, distributions, onClose, onSave, onPreviewSlip }: Props) {
  const commission = getCommission(project);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50 rounded-t-xl">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow">
              <Banknote size={18} className="text-white" />
            </div>
            <h2 className="font-semibold text-gray-900">เพิ่มรายการโอนเงินให้สมาชิก</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-white/60">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ผู้รับเงิน *</label>
            <select
              value={distForm.recipientId}
              onChange={(e) => {
                const rid = e.target.value as RecipientId | '';
                // Prefill = ยอดคงค้างที่ต้องโอน (rounded shouldPay − โอนแล้ว) จาก selector กลาง
                const prefillAmount = rid ? getOutstanding(project, rid, payments, distributions) : distForm.amount;
                setDistForm({ ...distForm, recipientId: rid, amount: prefillAmount });
              }}
              className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">-- เลือกผู้รับเงิน --</option>
              {MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              <option value="horse">Manager</option>
              <option value="pool">Pool money</option>
              {commission > 0 && (
                <option value="commission">Commission ({formatCurrency(commission)})</option>
              )}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">จำนวนเงิน (บาท) *</label>
              <input type="number" value={distForm.amount || ''} onChange={(e) => setDistForm({ ...distForm, amount: Number(e.target.value) })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่โอน</label>
              <input type="date" value={distForm.paidDate} onChange={(e) => setDistForm({ ...distForm, paidDate: e.target.value })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>
          {distForm.recipientId && (() => {
            const rid = distForm.recipientId as RecipientId;
            const rs = calcRoundedShares(project, getClientPaid(project.id, payments));
            const reimb = rs.reimburse[rid] || 0;
            const shouldReceive = recipientShare(rs, rid);
            const profit = shouldReceive - reimb;
            const alreadyPaid = getDistributed(project.id, rid, distributions);
            const remaining = Math.max(0, shouldReceive - alreadyPaid);
            if (shouldReceive <= 0) return null;
            return (
              <div className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-y-0.5">
                <div className="flex items-center justify-between text-gray-700">
                  <span>ส่วนแบ่งกำไร (จากที่ลูกค้าจ่ายแล้ว)</span>
                  <span className="font-medium tabular-nums">{formatCurrency(profit)}</span>
                </div>
                {reimb > 0 && (
                  <div className="flex items-center justify-between text-amber-700">
                    <span>↩ จ่ายคืนค่าดำเนินการ (ออกไปก่อน)</span>
                    <span className="font-medium tabular-nums">{formatCurrency(reimb)}</span>
                  </div>
                )}
                {alreadyPaid > 0 && (
                  <div className="flex items-center justify-between text-green-600">
                    <span>โอนไปแล้ว</span>
                    <span className="font-medium tabular-nums">−{formatCurrency(alreadyPaid)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1 mt-1">
                  <span>ยอดที่แนะนำโอน</span>
                  <span className="tabular-nums">{formatCurrency(remaining)}</span>
                </div>
              </div>
            );
          })()}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">อัพโหลด Slip</label>
            <SlipUploader
              values={distForm.slipUrls || []}
              onChange={(urls) => setDistForm({ ...distForm, slipUrls: urls, slipUrl: urls[0] || '' })}
              onPreview={(url) => onPreviewSlip(url)}
              color="green"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
            <input type="text" value={distForm.note} onChange={(e) => setDistForm({ ...distForm, note: e.target.value })} className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" placeholder="หมายเหตุเพิ่มเติม..." />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">ยกเลิก</button>
          <button onClick={onSave} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg text-sm font-medium hover:from-green-700 hover:to-emerald-700 shadow">
            <Save size={16} /> บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
