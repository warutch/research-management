import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Quotation } from '@/types';

async function loadFont(doc: jsPDF) {
  try {
    const res = await fetch('https://cdn.jsdelivr.net/gh/nicksrg/jsPDF-CustomFonts-support@master/dist/default_vfs.js');
    if (!res.ok) throw new Error('font CDN fail');
  } catch {
    // fallback: no custom font
  }
  // Use Sarabun from local file
  const { THSarabunNew, THSarabunNewBold } = await import('./thaiFont');
  doc.addFileToVFS('Sarabun-Regular.ttf', THSarabunNew);
  doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
  doc.addFileToVFS('Sarabun-Bold.ttf', THSarabunNewBold);
  doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');
  doc.setFont('Sarabun');
}

export async function generateQuotationPdf(quotation: Quotation) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  let fontName = 'helvetica';
  try {
    await loadFont(doc);
    fontName = 'Sarabun';
  } catch {
    // fallback to helvetica
  }

  const setNormal = () => doc.setFont(fontName, 'normal');
  const setBold = () => doc.setFont(fontName, 'bold');

  // Header
  doc.setFontSize(22);
  setBold();
  doc.text('ใบเสนอราคา / Quotation', pageWidth / 2, 25, { align: 'center' });
  doc.setFontSize(12);
  setNormal();
  doc.text('Research Management', pageWidth / 2, 33, { align: 'center' });

  // Quotation info
  doc.setFontSize(11);
  doc.text(`เลขที่: ${quotation.quotationNumber}`, 15, 48);
  doc.text(`วันที่: ${quotation.date}`, 15, 55);
  doc.text(`ใช้ได้ถึง: ${quotation.validUntil}`, 15, 62);

  // Client info
  doc.text('เรียน:', pageWidth - 85, 48);
  setBold();
  doc.text(quotation.clientName || '-', pageWidth - 85, 55);
  setNormal();
  if (quotation.clientAddress) {
    const addressLines = doc.splitTextToSize(quotation.clientAddress, 70);
    doc.text(addressLines, pageWidth - 85, 62);
  }
  if (quotation.clientPhone) {
    doc.text(`โทร: ${quotation.clientPhone}`, pageWidth - 85, quotation.clientAddress ? 72 : 62);
  }

  // Line
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.5);
  doc.line(15, 75, pageWidth - 15, 75);

  // Items table
  const tableData = quotation.items.map((item, index) => [
    (index + 1).toString(),
    item.description,
    item.quantity.toString(),
    item.unit,
    fmtNum(item.unitPrice),
    fmtNum(item.amount),
  ]);

  const subtotal = quotation.items.reduce((sum, item) => sum + item.amount, 0);
  const discountAmount = (subtotal * quotation.discount) / 100;
  const total = subtotal - discountAmount;

  autoTable(doc, {
    startY: 80,
    head: [['#', 'รายการ', 'จำนวน', 'หน่วย', 'ราคา/หน่วย', 'รวม']],
    body: tableData,
    theme: 'grid',
    styles: { font: fontName, fontSize: 11 },
    headStyles: { fillColor: [79, 70, 229], fontSize: 11, font: fontName, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 11, font: fontName },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      1: { cellWidth: 'auto' },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'right', cellWidth: 30 },
      5: { halign: 'right', cellWidth: 30 },
    },
    margin: { left: 15, right: 15 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  const summaryX = pageWidth - 85;
  doc.setFontSize(11);
  setNormal();
  doc.text('รวม:', summaryX, finalY);
  doc.text(`${fmtNum(subtotal)} บาท`, pageWidth - 15, finalY, { align: 'right' });

  if (quotation.discount > 0) {
    doc.text(`ส่วนลด (${quotation.discount}%):`, summaryX, finalY + 7);
    doc.text(`-${fmtNum(discountAmount)} บาท`, pageWidth - 15, finalY + 7, { align: 'right' });
  }

  const totalY = quotation.discount > 0 ? finalY + 18 : finalY + 11;
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.5);
  doc.line(summaryX, totalY - 3, pageWidth - 15, totalY - 3);
  doc.setFontSize(14);
  setBold();
  doc.text('รวมสุทธิ:', summaryX, totalY + 4);
  doc.text(`${fmtNum(total)} บาท`, pageWidth - 15, totalY + 4, { align: 'right' });

  // Notes
  if (quotation.notes) {
    doc.setFontSize(11);
    setNormal();
    doc.text('หมายเหตุ:', 15, totalY + 20);
    const noteLines = quotation.notes.split('\n');
    noteLines.forEach((line, i) => {
      doc.text(line, 15, totalY + 27 + i * 6);
    });
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 30;
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(15, footerY, pageWidth - 15, footerY);
  doc.setFontSize(10);
  setNormal();
  doc.text('ขอบคุณที่ไว้วางใจ', pageWidth / 2, footerY + 8, { align: 'center' });

  doc.save(`${quotation.quotationNumber}.pdf`);
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
