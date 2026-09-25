'use client';

import { MEMBERS, MemberId, Project, PaymentInstallment, PaymentRecord, RoundedShares,
  getHorsePercent, getPoolPercent, calcNetRatio, calcRoundedShares, calcRoundedSharesDelta } from '@/types';
import { formatCurrency } from '@/lib/utils';

// แถวข้อมูลสมาชิกที่ตารางต้องใช้ (subset ของ memberShares ในหน้าโครงการ)
export interface MemberShareRow {
  id: MemberId;
  color: string;
  rawTotal: number;
  total: number;
  reimburseTotal: number;
}

// ---- ตารางแบ่งตามกิจกรรม + สรุปหัก commission / จ่ายคืน ----
export function ActivityShareTable({
  project, memberShares, totalCost, netTotal, discountPercent, commissionAmount, hasReimburse, reimburseSum,
  horseRawTotal, poolRawTotal, horseTotal, poolTotal, roundedExpected,
}: {
  project: Project;
  memberShares: MemberShareRow[];
  totalCost: number;
  netTotal: number;
  discountPercent: number;
  commissionAmount: number;
  hasReimburse: boolean;
  reimburseSum: number;
  horseRawTotal: number;
  poolRawTotal: number;
  horseTotal: number;
  poolTotal: number;
  roundedExpected: RoundedShares;
}) {
  const hasDiscount = discountPercent > 0;
  const discountAmount = Math.max(0, totalCost - netTotal); // ยอดส่วนลด (บาท)
  const hasAdjust = commissionAmount > 0 || hasReimburse || hasDiscount;
  // ป้ายกำกับแถว "หัก" ตามรายการที่ถูกหักจริง
  const deductLabels: string[] = [];
  if (commissionAmount > 0) deductLabels.push(`Commission ${Math.round((1 - calcNetRatio(project)) * 10000) / 100}%`);
  if (hasReimburse) deductLabels.push('สำรองค่าดำเนินการ');
  if (hasDiscount) deductLabels.push(`ส่วนลด ${discountPercent}%`);
  const deductLabel = 'หัก ' + deductLabels.join(' + ');
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b bg-gradient-to-r from-gray-50 to-gray-100">
            <th className="px-3 py-2 font-medium">กิจกรรม</th>
            <th className="px-3 py-2 font-medium text-right">ค่าบริการ</th>
            {MEMBERS.map((m) => <th key={m.id} className="px-3 py-2 font-medium text-center">{m.name}</th>)}
            <th className="px-3 py-2 font-medium text-center">Manager</th>
            <th className="px-3 py-2 font-medium text-center">Pool money</th>
          </tr>
        </thead>
        <tbody>
          {project.activities.map((a) => (
            <tr key={a.id} className="border-b border-gray-50">
              <td className="px-3 py-2 text-gray-700">{a.name}</td>
              <td className="px-3 py-2 text-right font-medium">{formatCurrency(a.cost)}</td>
              {MEMBERS.map((m) => (
                <td key={m.id} className="px-3 py-2 text-center">
                  <span className="text-gray-500 text-xs">{a.sharePercent[m.id] || 0}%</span>
                  <br />
                  <span className="font-medium">{formatCurrency((a.cost * (a.sharePercent[m.id] || 0)) / 100)}</span>
                </td>
              ))}
              <td className="px-3 py-2 text-center">
                <span className="text-gray-500 text-xs">{getHorsePercent(a)}%</span><br />
                <span className="font-medium text-amber-600">{formatCurrency((a.cost * getHorsePercent(a)) / 100)}</span>
              </td>
              <td className="px-3 py-2 text-center">
                <span className="text-gray-500 text-xs">{getPoolPercent(a)}%</span><br />
                <span className="font-medium text-gray-500">{formatCurrency((a.cost * getPoolPercent(a)) / 100)}</span>
              </td>
            </tr>
          ))}
          <tr className="font-bold text-gray-900 bg-gray-50 border-t-2 border-gray-300">
            <td className="px-3 py-2">{hasAdjust ? 'รวมส่วนแบ่งกิจกรรม' : 'รวมทั้งหมด'}</td>
            <td className="px-3 py-2 text-right">{formatCurrency(totalCost)}</td>
            {memberShares.map((m) => <td key={m.id} className="px-3 py-2 text-center" style={{ color: m.color }}>{formatCurrency(m.rawTotal)}</td>)}
            <td className="px-3 py-2 text-center text-amber-600">{formatCurrency(horseRawTotal)}</td>
            <td className="px-3 py-2 text-center text-gray-500">{formatCurrency(poolRawTotal)}</td>
          </tr>
          {hasAdjust && (
            <>
              {/* หัก = commission + สำรองค่าดำเนินการ + ส่วนลด (netAfterAdjust = rawTotal − หัก) */}
              <tr className="text-rose-700 bg-rose-50">
                <td className="px-3 py-1.5 text-xs">{deductLabel}</td>
                <td className="px-3 py-1.5 text-right text-xs">−{formatCurrency(commissionAmount + reimburseSum + discountAmount)}</td>
                {memberShares.map((m) => <td key={m.id} className="px-3 py-1.5 text-center text-xs">−{formatCurrency(m.rawTotal - roundedExpected.members[m.id])}</td>)}
                <td className="px-3 py-1.5 text-center text-xs">−{formatCurrency(horseRawTotal - roundedExpected.horse)}</td>
                <td className="px-3 py-1.5 text-center text-xs">−{formatCurrency(poolRawTotal - roundedExpected.pool)}</td>
              </tr>
              {hasReimburse && (
                <tr className="text-emerald-700 bg-emerald-50">
                  <td className="px-3 py-1.5 text-xs">จ่ายคืนค่าดำเนินการ (ให้ผู้สำรอง)</td>
                  <td className="px-3 py-1.5 text-right text-xs">+{formatCurrency(reimburseSum)}</td>
                  {memberShares.map((m) => <td key={m.id} className="px-3 py-1.5 text-center text-xs">{m.reimburseTotal > 0 ? `+${formatCurrency(m.reimburseTotal)}` : '—'}</td>)}
                  <td className="px-3 py-1.5 text-center text-xs">{roundedExpected.reimburse.horse > 0 ? `+${formatCurrency(roundedExpected.reimburse.horse)}` : '—'}</td>
                  <td className="px-3 py-1.5 text-center text-xs">{roundedExpected.reimburse.pool > 0 ? `+${formatCurrency(roundedExpected.reimburse.pool)}` : '—'}</td>
                </tr>
              )}
              <tr className="font-bold text-indigo-900 bg-indigo-50 border-t-2 border-indigo-200">
                <td className="px-3 py-2">รวมสุทธิ (ที่ต้องโอน){hasDiscount && <span className="font-normal text-[11px] text-rose-400"> หลังหักส่วนลด {discountPercent}%</span>}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(netTotal - commissionAmount)}</td>
                {memberShares.map((m) => <td key={m.id} className="px-3 py-2 text-center" style={{ color: m.color }}>{formatCurrency(m.total)}</td>)}
                <td className="px-3 py-2 text-center text-amber-600">{formatCurrency(horseTotal)}</td>
                <td className="px-3 py-2 text-center text-gray-500">{formatCurrency(poolTotal)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---- แผนการโอนเงินแยกรายงวด (delta ต่องวด + แถวรวม) ----
export function InstallmentPlanTable({
  project, installments, projectPaymentsAll, memberShares, commissionAmount, totalInstallments, totalPaidReal,
}: {
  project: Project;
  installments: PaymentInstallment[];
  projectPaymentsAll: PaymentRecord[];
  memberShares: MemberShareRow[];
  commissionAmount: number;
  totalInstallments: number;
  totalPaidReal: number;
}) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <h5 className="text-sm font-semibold text-gray-700 mb-3">แผนการโอนเงินแยกรายงวด {commissionAmount > 0 && <span className="text-xs font-normal text-gray-500">(Commission ตัดก่อนเป็นอันดับแรก แล้วค่อยกระจายให้สมาชิก)</span>}</h5>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="px-3 py-2 font-medium">งวด</th>
              <th className="px-3 py-2 font-medium text-right">จำนวนเงิน</th>
              <th className="px-3 py-2 font-medium text-right">รับแล้ว</th>
              {MEMBERS.map((m) => <th key={m.id} className="px-3 py-2 font-medium text-center">{m.name}</th>)}
              <th className="px-3 py-2 font-medium text-center">Manager</th>
              <th className="px-3 py-2 font-medium text-center">Pool money</th>
              {commissionAmount > 0 && <th className="px-3 py-2 font-medium text-center text-rose-600">Commission</th>}
            </tr>
          </thead>
          <tbody>
            {(() => {
              // ใช้ calcRoundedSharesDelta — ทุกยอดเป็นจำนวนเต็มบาท
              // cumulative paid up to each installment → delta คือยอดของงวดนั้น
              const sortedInsts = [...installments].sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0));
              let cumulative = 0;
              return sortedInsts.map((inst) => {
                const instPaid = projectPaymentsAll.filter((p) => p.installmentId === inst.id).reduce((s, p) => s + p.amount, 0);
                const before = cumulative;
                cumulative += inst.amount;
                const delta = calcRoundedSharesDelta(project, before, cumulative);
                return (
                  <tr key={inst.id} className="border-b border-gray-50">
                    <td className="px-3 py-2 text-gray-700">งวดที่ {inst.installmentNumber}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(inst.amount)}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={instPaid >= inst.amount && inst.amount > 0 ? 'text-green-600 font-medium' : instPaid > 0 ? 'text-blue-600' : 'text-gray-400'}>{formatCurrency(instPaid)}</span>
                    </td>
                    {memberShares.map((m) => (
                      <td key={m.id} className="px-3 py-2 text-center text-xs" style={{ color: m.color }}>{formatCurrency(delta.members[m.id] + (delta.reimburse[m.id] || 0))}</td>
                    ))}
                    <td className="px-3 py-2 text-center text-xs text-amber-600">{formatCurrency(delta.horse + (delta.reimburse.horse || 0))}</td>
                    <td className="px-3 py-2 text-center text-xs text-gray-500">{formatCurrency(delta.pool + (delta.reimburse.pool || 0))}</td>
                    {commissionAmount > 0 && <td className="px-3 py-2 text-center text-xs text-rose-600">{formatCurrency(delta.commission)}</td>}
                  </tr>
                );
              });
            })()}
            {(() => {
              // แถวรวมต้องตรงกับผลรวมของ delta ด้านบน = shares เมื่อจ่ายครบตามยอดงวด (ไม่ใช่ตาม cost)
              const rInst = calcRoundedShares(project, totalInstallments);
              return (
                <tr className="font-bold text-gray-900 bg-gray-50 border-t-2 border-gray-300">
                  <td className="px-3 py-2">รวม</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(totalInstallments)}</td>
                  <td className="px-3 py-2 text-right text-green-600">{formatCurrency(totalPaidReal)}</td>
                  {memberShares.map((m) => <td key={m.id} className="px-3 py-2 text-center" style={{ color: m.color }}>{formatCurrency(rInst.members[m.id] + rInst.reimburse[m.id])}</td>)}
                  <td className="px-3 py-2 text-center text-amber-600">{formatCurrency(rInst.horse + rInst.reimburse.horse)}</td>
                  <td className="px-3 py-2 text-center text-gray-500">{formatCurrency(rInst.pool + rInst.reimburse.pool)}</td>
                  {commissionAmount > 0 && <td className="px-3 py-2 text-center text-rose-600">{formatCurrency(rInst.commission)}</td>}
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
