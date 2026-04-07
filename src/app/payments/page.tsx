'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { useHydrated } from '@/lib/useHydrated';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Banknote, Filter, X, Image } from 'lucide-react';

export default function PaymentsPage() {
  const hydrated = useHydrated();
  const { payments, projects } = useStore();
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [viewSlipUrl, setViewSlipUrl] = useState<string | null>(null);

  if (!hydrated) return <div className="flex items-center justify-center h-64 text-gray-400">...</div>;

  const filteredPayments = (filterProjectId === 'all'
    ? payments
    : payments.filter((p) => p.projectId === filterProjectId)
  ).sort((a, b) => new Date(b.paidDate || b.createdAt).getTime() - new Date(a.paidDate || a.createdAt).getTime());

  const totalAmount = filteredPayments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ประวัติการชำระเงิน</h1>
          <p className="text-gray-500 text-sm mt-1">ดูรายการชำระเงินจากลูกค้าทั้งหมดของทุกโครงการ</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">ทุกโครงการ</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200 p-5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md">
            <Banknote size={20} className="text-white" />
          </div>
          <span className="font-medium text-green-900">ยอดชำระรวม ({filteredPayments.length} รายการ)</span>
        </div>
        <span className="text-2xl font-bold text-green-700">{formatCurrency(totalAmount)}</span>
      </div>

      {/* Table */}
      {filteredPayments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <Banknote size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 mb-1">ยังไม่มีรายการชำระเงิน</p>
          <p className="text-gray-400 text-sm">เพิ่มรายการชำระได้ที่หน้าจัดการโครงการ</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-gradient-to-r from-gray-50 to-gray-100 border-b">
                  <th className="px-5 py-3 font-medium">วันที่</th>
                  <th className="px-5 py-3 font-medium">โครงการ</th>
                  <th className="px-5 py-3 font-medium">งวด</th>
                  <th className="px-5 py-3 font-medium text-right">จำนวนเงิน</th>
                  <th className="px-5 py-3 font-medium text-center">Slip</th>
                  <th className="px-5 py-3 font-medium">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => {
                  const project = projects.find((p) => p.id === payment.projectId);
                  const installment = project?.installments?.find((i) => i.id === payment.installmentId);
                  return (
                    <tr key={payment.id} className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                      <td className="px-5 py-3 text-gray-700">{payment.paidDate ? formatDate(payment.paidDate) : '-'}</td>
                      <td className="px-5 py-3 font-medium text-gray-700">{project?.name || '-'}</td>
                      <td className="px-5 py-3 text-gray-500">
                        {installment ? `งวดที่ ${installment.installmentNumber}: ${installment.name}` : '-'}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-green-600">{formatCurrency(payment.amount)}</td>
                      <td className="px-5 py-3 text-center">
                        {payment.slipUrl ? (
                          <button onClick={() => setViewSlipUrl(payment.slipUrl)} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
                            <Image size={14} /> ดู
                          </button>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{payment.note || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold text-gray-900 border-t-2 border-gray-300">
                  <td className="px-5 py-3" colSpan={3}>รวมทั้งหมด</td>
                  <td className="px-5 py-3 text-right text-green-600">{formatCurrency(totalAmount)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Slip viewer modal */}
      {viewSlipUrl && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setViewSlipUrl(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg max-h-[80vh] overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-gray-900">Slip การชำระเงิน</h3>
              <button onClick={() => setViewSlipUrl(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <img src={viewSlipUrl} alt="Payment slip" className="w-full rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
