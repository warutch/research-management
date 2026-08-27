import jsPDF from 'jspdf';
import { Quotation } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

// escape ข้อความจาก user กัน HTML injection ตอนสร้าง template
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

// สี (hex ล้วน — ตรงกับ preview และเลี่ยง oklch ของ Tailwind ที่ html2canvas 1.4.1 ไม่รองรับ)
const DARK = '#111827';   // gray-900
const MUTED = '#6b7280';  // gray-500
const NOTE = '#4b5563';   // gray-600
const INDIGO = '#4f46e5'; // indigo-600
const RED = '#dc2626';    // red-600
const BORDER = '#e5e7eb'; // gray-200

// สร้าง HTML ของใบเสนอราคา (ดีไซน์เดียวกับ preview) ด้วย inline style ทั้งหมด
function buildQuotationHtml(q: Quotation): string {
  const subtotal = q.items.reduce((s, it) => s + it.amount, 0);
  const discountAmt = (subtotal * (q.discount || 0)) / 100;
  const total = subtotal - discountAmt;

  const rows = q.items.map((it, i) => `
    <tr style="border-bottom:1px solid ${BORDER}; color:${DARK};">
      <td style="padding:8px 12px;">${i + 1}</td>
      <td style="padding:8px 12px;">${esc(it.description)}</td>
      <td style="padding:8px 12px; text-align:center;">${esc(it.quantity)}</td>
      <td style="padding:8px 12px; text-align:center;">${esc(it.unit)}</td>
      <td style="padding:8px 12px; text-align:right;">${esc(formatCurrency(it.unitPrice))}</td>
      <td style="padding:8px 12px; text-align:right;">${esc(formatCurrency(it.amount))}</td>
    </tr>`).join('');

  const discountRow = (q.discount || 0) > 0
    ? `<div style="display:flex; justify-content:space-between; padding:2px 0; color:${RED};">
         <span>Discount (${esc(q.discount)}%)</span><span>-${esc(formatCurrency(discountAmt))}</span>
       </div>`
    : '';

  const notesHtml = q.notes
    ? `<div style="margin-top:16px; font-size:13px; color:${NOTE}; line-height:1.7;">
         <div style="font-weight:500;">หมายเหตุ:</div>
         ${q.notes.split('\n').map((line) =>
           `<div style="${line.trim().startsWith('*') ? `color:${RED}; font-weight:500;` : ''}">${esc(line)}</div>`).join('')}
       </div>`
    : '';

  return `
    <div style="text-align:center; margin-bottom:24px;">
      <div style="font-size:26px; font-weight:700; color:${DARK}; letter-spacing:0.5px;">QUOTATION</div>
      <div style="font-size:13px; color:${MUTED};">Research Management Services</div>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:24px; font-size:13px; line-height:1.6;">
      <div style="color:${MUTED};">
        <div>No: ${esc(q.quotationNumber)}</div>
        <div>Date: ${esc(formatDate(q.date))}</div>
        <div>Valid: ${esc(formatDate(q.validUntil))}</div>
      </div>
      <div style="text-align:right;">
        <div style="color:${DARK}; font-weight:500;">${esc(q.clientName || '-')}</div>
        ${q.clientAddress ? `<div style="color:${MUTED};">${esc(q.clientAddress)}</div>` : ''}
        ${q.clientPhone ? `<div style="color:${MUTED};">Tel: ${esc(q.clientPhone)}</div>` : ''}
      </div>
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:16px;">
      <thead>
        <tr style="background:${INDIGO}; color:#ffffff;">
          <th style="padding:8px 12px; text-align:left;">#</th>
          <th style="padding:8px 12px; text-align:left;">Description</th>
          <th style="padding:8px 12px; text-align:center;">Qty</th>
          <th style="padding:8px 12px; text-align:center;">Unit</th>
          <th style="padding:8px 12px; text-align:right;">Price</th>
          <th style="padding:8px 12px; text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:flex; justify-content:flex-end;">
      <div style="width:240px; font-size:13px; color:${DARK};">
        <div style="display:flex; justify-content:space-between; padding:2px 0;">
          <span>Subtotal</span><span>${esc(formatCurrency(subtotal))}</span>
        </div>
        ${discountRow}
        <div style="display:flex; justify-content:space-between; font-weight:700; font-size:16px; border-top:1px solid ${BORDER}; padding-top:6px; margin-top:2px;">
          <span>Total</span><span style="color:${INDIGO};">${esc(formatCurrency(total))}</span>
        </div>
      </div>
    </div>
    ${notesHtml}`;
}

export async function generateQuotationPdf(quotation: Quotation) {
  // html2canvas ต้องรันฝั่ง client (ใช้ document) — dynamic import กัน SSR
  const html2canvas = (await import('html2canvas')).default;

  const container = document.createElement('div');
  container.setAttribute('style',
    "position:fixed; left:-10000px; top:0; width:760px; padding:40px; box-sizing:border-box; " +
    "background:#ffffff; color:" + DARK + "; font-family:'Sarabun','Noto Sans Thai',sans-serif;");
  container.innerHTML = buildQuotationHtml(quotation);
  document.body.appendChild(container);

  try {
    // รอ font โหลดเสร็จ เพื่อให้ภาษาไทย shape ถูกต้อง
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      try { await document.fonts.ready; } catch { /* ignore */ }
    }
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;

    // แบ่งหลายหน้าถ้าเนื้อหายาวเกิน 1 หน้า A4
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, pageW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pageW, imgH);
      heightLeft -= pageH;
    }
    pdf.save(`${quotation.quotationNumber}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
