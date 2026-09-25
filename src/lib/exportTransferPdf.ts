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
      ? `<div data-break style="background:${INDIGO_LT};color:#3730a3;font-weight:600;font-size:12px;padding:6px 10px;border-radius:6px;margin:14px 0 6px;">${esc(sec.title)}</div>`
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
    const scale = 2;
    const canvas = await html2canvas(container, { scale, backgroundColor: '#ffffff', useCORS: true });
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // เก็บ "เส้นแบ่งที่ตัดได้" — ขอบล่างของแต่ละแถว/หัวข้อ (canvas px) เพื่อไม่ตัดกลางแถว
    const cRectTop = container.getBoundingClientRect().top;
    const breakables = Array.from(container.querySelectorAll('tr, [data-break]')) as HTMLElement[];
    const boundaries = breakables
      .map((el) => (el.getBoundingClientRect().bottom - cRectTop) * scale)
      .filter((y) => y > 0 && y < canvas.height)
      .sort((a, b) => a - b);
    boundaries.push(canvas.height);

    const pageHeightPx = (pageH * canvas.width) / pageW; // ความสูง 1 หน้า A4 ในหน่วย canvas px
    let top = 0;
    let first = true;
    while (top < canvas.height - 1) {
      const maxBottom = top + pageHeightPx;
      // เลือกเส้นแบ่งที่ใหญ่สุดแต่ไม่เกินขอบหน้า (ถ้าไม่มี → ตัดตรงขอบหน้า กรณีแถวสูงกว่าหน้า)
      const candidates = boundaries.filter((b) => b > top + 10 && b <= maxBottom);
      let cut = candidates.length ? Math.max(...candidates) : Math.min(maxBottom, canvas.height);
      cut = Math.min(cut, canvas.height);
      const sliceH = Math.max(1, Math.round(cut - top));

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceH;
      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, sliceH);
        ctx.drawImage(canvas, 0, Math.round(top), canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      }
      const img = pageCanvas.toDataURL('image/png');
      const imgHmm = (sliceH * pageW) / canvas.width;
      if (!first) pdf.addPage();
      pdf.addImage(img, 'PNG', 0, 0, pageW, imgHmm);
      first = false;
      top = cut;
    }
    pdf.save(opts.filename.replace(/\.xlsx$/i, '') + '.pdf');
  } finally {
    document.body.removeChild(container);
  }
}
