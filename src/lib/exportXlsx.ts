import ExcelJS from 'exceljs';

export interface XlsxSection {
  title?: string;                    // หัวข้อ section (merge ทั้งแถว)
  headers: string[];
  rows: (string | number)[][];
  moneyCols?: number[];              // index (0-based) ที่ format เป็นเงิน ฿
  totalRow?: (string | number)[];    // แถวรวม (ตัวหนา)
}

export interface XlsxReportOptions {
  filename: string;
  sheetName: string;
  title: string;
  meta?: [string, string][];         // บรรทัดข้อมูลหัว (label, value)
  sections: XlsxSection[];
}

const INDIGO = 'FF4F46E5';
const HEADER_TEXT = 'FFFFFFFF';
const SECTION_FILL = 'FFEEF2FF';   // indigo-50
const TOTAL_FILL = 'FFF3F4F6';     // gray-100
const BORDER = 'FFE5E7EB';         // gray-200
const MONEY_FMT = '#,##0" ฿"';

export async function exportXlsxReport(opts: XlsxReportOptions): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName, { views: [{ showGridLines: false }] });

  const colCount = Math.max(1, ...opts.sections.map((s) => s.headers.length));
  const thin = (): Partial<ExcelJS.Borders> => ({
    top: { style: 'thin', color: { argb: BORDER } },
    left: { style: 'thin', color: { argb: BORDER } },
    bottom: { style: 'thin', color: { argb: BORDER } },
    right: { style: 'thin', color: { argb: BORDER } },
  });

  let r = 1;
  // Title
  ws.mergeCells(r, 1, r, colCount);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = opts.title;
  titleCell.font = { bold: true, size: 14, color: { argb: HEADER_TEXT } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INDIGO } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(r).height = 26;
  r += 1;

  // Meta lines
  for (const [label, value] of opts.meta || []) {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = { bold: true, color: { argb: 'FF6B7280' } };
    ws.mergeCells(r, 2, r, colCount);
    ws.getCell(r, 2).value = value;
    r += 1;
  }
  r += 1; // blank

  for (const section of opts.sections) {
    if (section.title) {
      ws.mergeCells(r, 1, r, colCount);
      const c = ws.getCell(r, 1);
      c.value = section.title;
      c.font = { bold: true, size: 11, color: { argb: 'FF3730A3' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_FILL } };
      c.alignment = { indent: 1 };
      ws.getRow(r).height = 20;
      r += 1;
    }
    // Header
    section.headers.forEach((h, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: HEADER_TEXT } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INDIGO } };
      c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right' };
      c.border = thin();
    });
    ws.getRow(r).height = 20;
    r += 1;
    // Data rows
    const money = new Set(section.moneyCols || []);
    section.rows.forEach((row, ri) => {
      row.forEach((v, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = v;
        c.border = thin();
        c.alignment = { horizontal: i === 0 ? 'left' : 'right' };
        if (money.has(i) && typeof v === 'number') c.numFmt = MONEY_FMT;
      });
      if (ri % 2 === 1) {
        for (let i = 0; i < section.headers.length; i++) {
          ws.getCell(r, i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
        }
      }
      r += 1;
    });
    // Total row
    if (section.totalRow) {
      section.totalRow.forEach((v, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = v;
        c.font = { bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
        c.border = thin();
        c.alignment = { horizontal: i === 0 ? 'left' : 'right' };
        if (money.has(i) && typeof v === 'number') c.numFmt = MONEY_FMT;
      });
      r += 1;
    }
    r += 1; // blank between sections
  }

  // Column widths — จากความยาวเนื้อหาสูงสุดในแต่ละคอลัมน์
  for (let i = 1; i <= colCount; i++) {
    let max = 10;
    ws.getColumn(i).eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > max) max = len;
    });
    ws.getColumn(i).width = Math.min(48, Math.max(12, i === 1 ? max + 2 : max + 4));
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.filename;
  a.click();
  URL.revokeObjectURL(url);
}
