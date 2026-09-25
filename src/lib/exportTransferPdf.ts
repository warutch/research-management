import jsPDF from 'jspdf';
import type { XlsxReportOptions } from './exportXlsx';

// สี (hex ล้วน — เลี่ยง oklch ของ Tailwind ที่ html2canvas 1.4.1 ไม่รองรับ)
const DARK = '#111827';
const MUTED = '#6b7280';
const INDIGO = '#4f46e5';
const INDIGO_LT = '#eef2ff';
const BORDER = '#e5e7eb';
const ZEBRA = '#fafafa';
const TOTAL_BG = '#f3f4f6';

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
const fmtMoney = (n: number) => `${Math.round(n).toLocaleString('en-US')} ฿`;

function buildHtml(opts: XlsxReportOptions): string {
  const meta = (opts.meta || []).map(([k, v]) =>
    `<div style="display:flex;gap:8px;font-size:12px;line-height:1.7;"><span style="color:${MUTED};min-width:110px;">${esc(k)}</span><span style="color:${DARK};font-weight:500;">${esc(v)}</span></div>`
  ).join('');

  const sections = opts.sections.map((sec) => {
    const money = new Set(sec.moneyCols || []);
    const cell = (v: string | number, i: number, opt: { bold?: boolean } = {}) => {
      const isMoney = money.has(i) && typeof v === 'number';
      const txt = isMoney ? fmtMoney(v) : esc(v);
      const align = i === 0 ? 'left' : 'right';
      return `<td style="padding:6px 10px;border:1px solid ${BORDER};text-align:${align};${opt.bold ? 'font-weight:700;' : ''}white-space:nowrap;">${txt}</td>`;
    };
    const head = sec.headers.map((h, i) =>
      `<th style="padding:7px 10px;background:${INDIGO};color:#fff;font-weight:600;text-align:${i === 0 ? 'left' : 'right'};border:1px solid ${INDIGO};white-space:nowrap;">${esc(h)}</th>`
    ).join('');
    const body = sec.rows.map((row, ri) =>
      `<tr style="${ri % 2 === 1 ? `background:${ZEBRA};` : ''}">${row.map((v, i) => cell(v, i)).join('')}</tr>`
    ).join('');
    const total = sec.totalRow
      ? `<tr style="background:${TOTAL_BG};">${sec.totalRow.map((v, i) => cell(v, i, { bold: true })).join('')}</tr>`
      : '';
    const title = sec.title
      ? `<div style="background:${INDIGO_LT};color:#3730a3;font-weight:600;font-size:12px;padding:6px 10px;border-radius:6px;margin:14px 0 6px;">${esc(sec.title)}</div>`
      : '';
    return `${title}<table style="width:100%;border-collapse:collapse;font-size:12px;color:${DARK};">${`<thead><tr>${head}</tr></thead>`}<tbody>${body}${total}</tbody></table>`;
  }).join('');

  return `
    <div style="background:${INDIGO};color:#fff;font-size:16px;font-weight:700;padding:12px 16px;border-radius:8px;">${esc(opts.title)}</div>
    <div style="margin:12px 2px 4px;">${meta}</div>
    ${sections}
    <div style="margin-top:16px;font-size:10px;color:${MUTED};text-align:right;">สร้างโดยระบบ Research Management</div>`;
}

export async function exportTransferPdf(opts: XlsxReportOptions): Promise<void> {
  const html2canvas = (await import('html2canvas')).default;
  const container = document.createElement('div');
  container.setAttribute('style',
    "position:fixed;left:-10000px;top:0;width:794px;padding:32px;box-sizing:border-box;" +
    "background:#ffffff;color:" + DARK + ";font-family:'Sarabun','Noto Sans Thai',sans-serif;");
  container.innerHTML = buildHtml(opts);
  document.body.appendChild(container);
  try {
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      try { await document.fonts.ready; } catch { /* ignore */ }
    }
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pageW) / canvas.width;
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(img, 'PNG', 0, position, pageW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(img, 'PNG', 0, position, pageW, imgH);
      heightLeft -= pageH;
    }
    pdf.save(opts.filename.replace(/\.xlsx$/i, '') + '.pdf');
  } finally {
    document.body.removeChild(container);
  }
}
