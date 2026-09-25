'use client';

import { Project, calcCompanyBreakdown, calcProjectNetTotal } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { Building2 } from 'lucide-react';

// กล่องสรุป "เงินผ่านบริษัท" — แสดง waterfall จากยอดเรียกเก็บ → เหลือแบ่งทีม
export default function CompanyTaxBreakdown({ project, received }: { project: Project; received?: number }) {
  if (!project.companyPassThrough) return null;
  const gross = calcProjectNetTotal(project); // ยอดเรียกเก็บเต็ม (หลังส่วนลด ถ้ามี)
  const b = calcCompanyBreakdown(project, gross);
  const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rows: { label: string; value: string; hint?: string; tone?: 'head' | 'net' }[] = [
    { tone: 'head', label: 'ยอดเรียกเก็บ (รวม VAT)', value: fmt(b.gross) },
    { label: 'ค่าบริการก่อน VAT', value: fmt(b.preVat) },
    { label: 'VAT', hint: `${b.vatRate}%`, value: fmt(b.vat) },
    { label: 'หัก ณ ที่จ่าย', hint: `${b.whtRate}%`, value: `− ${fmt(b.wht)}` },
    { label: 'บริษัทได้หลังหัก ณ ที่จ่าย', value: fmt(b.afterWht) },
    { label: 'หลังบริษัทส่ง VAT', value: fmt(b.afterVat) },
    { label: 'ค่าดำเนินการบริษัท', hint: `${b.feeRate}%`, value: `− ${fmt(b.companyFee)}` },
    { tone: 'net', label: 'เหลือแบ่งทีม', value: fmt(b.net) },
  ];

  return (
    <div className="bg-white rounded-lg border p-4">
      <h5 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1.5"><Building2 size={15} className="text-sky-600" /> เงินผ่านบริษัท (หักภาษี/ค่าบริษัทก่อนแบ่งทีม)</h5>
      <p className="text-xs text-gray-400 mb-3">ลูกค้าโอนยอดเรียกเก็บ (รวม VAT) → ผ่านบริษัทหัก VAT + หัก ณ ที่จ่าย + ค่าดำเนินการ → เหลือเป็นเงินที่นำมาแบ่งทีม</p>
      <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {rows.map((r, i) => (
          <div key={i} className={`flex items-center justify-between px-3 py-1.5 text-sm ${r.tone === 'head' ? 'bg-sky-50 font-semibold text-gray-800' : r.tone === 'net' ? 'bg-emerald-50 font-bold text-emerald-800' : 'text-gray-600'}`}>
            <span>{r.label}{r.hint && <span className="text-xs text-gray-400"> {r.hint}</span>}</span>
            <span className="tabular-nums">{r.value} <span className="text-xs text-gray-400">บาท</span></span>
          </div>
        ))}
      </div>
      {received !== undefined && received > 0 && received < gross && (
        <p className="text-xs text-amber-600 mt-2">* ตอนนี้ลูกค้าโอนมาแล้ว {formatCurrency(received)} จาก {formatCurrency(gross)} — เงินที่แบ่งได้จะคิดตามสัดส่วนที่รับจริง</p>
      )}
    </div>
  );
}
