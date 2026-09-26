'use client';

import { MEMBERS, MemberId, Project, PaymentInstallment, PaymentRecord, RoundedShares,
  getHorsePercent, getPoolPercent, calcRoundedShares, calcRoundedSharesDelta } from '@/types';
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
  project, memberShares, totalCost, teamNetTotal, discountPercent, companyPassThrough, commissionAmount, hasReimburse, reimburseSum,
  horseRawTotal, poolRawTotal, horseTotal, poolTotal, roundedExpected,
}: {
  project: Project;
  memberShares: MemberShareRow[];
  totalCost: number;
  teamNetTotal: number; // ยอดสุทธิที่ทีมได้จริง (หลังส่วนลด + หลังผ่านบริษัท)
  discountPercent: number;
  companyPassThrough: boolean;
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
  const reductionAmount = Math.max(0, totalCost - teamNetTotal); // ส่วนลด/ผ่านบริษัท (ไม่รวม commission)
  const hasReduction = reductionAmount > 0.5;
  const hasAdjust = commissionAmount > 0 || hasReimburse || hasReduction;
  // สัดส่วนที่ทีมเหลือ (หลังส่วนลด/ผ่านบริษัท) — ใช้แยกส่วน "หักจ่ายบริษัท" ออกจาก "หัก Commission"
  const reductionRatio = totalCost > 0 ? teamNetTotal / totalCost : 1;
  const afterRed = (raw: number) => Math.round(raw * reductionRatio); // ยอดหลังหักบริษัท/ส่วนลด (ก่อน commission)
  const reductionLabel = companyPassThrough
    ? 'หักจ่ายบริษัท (VAT + ภาษี + ค่าบริษัท)'
    : `หัก ส่วนลด ${discountPercent}%`;
  return (
    <div>
      <div className="mb-2">
        <h5 className="text-sm font-semibold text-gray-700">แบ่งตามกิจกรรม</h5>
        <p className="text-xs text-gray-400">งานและส่วนแบ่งทีมตามบทบาท — บอกว่า &ldquo;ใครได้เท่าไร&rdquo; ของทั้งโครงการ (ไม่ใช่กำหนดชำระ)</p>
      </div>
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
              {/* แถวที่ 1: หักจ่ายบริษัท / ส่วนลด (แยกจาก commission เพื่อไม่สับสน) */}
              {hasReduction && (
                <tr className="text-sky-700 bg-sky-50">
                  <td className="px-3 py-1.5 text-xs">{reductionLabel}</td>
                  <td className="px-3 py-1.5 text-right text-xs">−{formatCurrency(reductionAmount)}</td>
                  {memberShares.map((m) => <td key={m.id} className="px-3 py-1.5 text-center text-xs">−{formatCurrency(m.rawTotal - afterRed(m.rawTotal))}</td>)}
                  <td className="px-3 py-1.5 text-center text-xs">−{formatCurrency(horseRawTotal - afterRed(horseRawTotal))}</td>
                  <td className="px-3 py-1.5 text-center text-xs">−{formatCurrency(poolRawTotal - afterRed(poolRawTotal))}</td>
                </tr>
              )}
              {/* แถวที่ 2: หัก Commission (เฉพาะ 3 สมาชิกหลัก — Manager/Pool ไม่โดน) */}
              {commissionAmount > 0 && (
                <tr className="text-rose-700 bg-rose-50">
                  <td className="px-3 py-1.5 text-xs">หัก Commission</td>
                  <td className="px-3 py-1.5 text-right text-xs">−{formatCurrency(commissionAmount)}</td>
                  {memberShares.map((m) => <td key={m.id} className="px-3 py-1.5 text-center text-xs">−{formatCurrency(Math.max(0, afterRed(m.rawTotal) - roundedExpected.members[m.id]))}</td>)}
                  <td className="px-3 py-1.5 text-center text-xs">−฿0</td>
                  <td className="px-3 py-1.5 text-center text-xs">−฿0</td>
                </tr>
              )}
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
                <td className="px-3 py-2">รวมสุทธิ (ที่ต้องโอน){companyPassThrough ? <span className="font-normal text-[11px] text-sky-500"> เงินที่ทีมได้หลังผ่านบริษัท</span> : hasDiscount ? <span className="font-normal text-[11px] text-rose-400"> หลังหักส่วนลด {discountPercent}%</span> : null}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(teamNetTotal - commissionAmount)}</td>
                {memberShares.map((m) => <td key={m.id} className="px-3 py-2 text-center" style={{ color: m.color }}>{formatCurrency(m.total)}</td>)}
                <td className="px-3 py-2 text-center text-amber-600">{formatCurrency(horseTotal)}</td>
                <td className="px-3 py-2 text-center text-gray-500">{formatCurrency(poolTotal)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      </div>
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
      <h5 className="text-sm font-semibold text-gray-700">แผนการโอนเงินแยกรายงวด {commissionAmount > 0 && <span className="text-xs font-normal text-gray-500">(Commission ตัดก่อนเป็นอันดับแรก แล้วค่อยกระจายให้สมาชิก)</span>}</h5>
      <p className="text-xs text-gray-400 mb-3">กำหนดชำระของลูกค้า — ยอดสมาชิกแต่ละงวดคำนวณตามสัดส่วนเงินที่จ่าย ไม่ได้ผูกกับกิจกรรมโดยตรง (งวดที่ 1 ≠ กิจกรรมที่ 1)</p>
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
              return sortedInsts.map((inst, idx) => {
                const instPaid = projectPaymentsAll.filter((p) => p.installmentId === inst.id).reduce((s, p) => s + p.amount, 0);
                // ยอดสะสมก่อนงวดนี้ (ไม่ mutate ตัวแปรระหว่าง render)
                const before = sortedInsts.slice(0, idx).reduce((s, x) => s + x.amount, 0);
                const after = before + inst.amount;
                const delta = calcRoundedSharesDelta(project, before, after);
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
