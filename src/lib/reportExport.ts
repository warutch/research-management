import { toast } from '@/components/Toast';
import type { XlsxReportOptions } from './exportXlsx';

// รวม logic การ export รายงาน (Excel / PDF) ไว้ที่เดียว — เดิมซ้ำในหน้า income + projects
// build: ฟังก์ชันสร้าง options (เรียกตอน export เพื่อให้ได้ข้อมูลล่าสุด)

export async function exportReportXlsx(build: () => XlsxReportOptions): Promise<void> {
  try {
    const { exportXlsxReport } = await import('./exportXlsx');
    await exportXlsxReport(build());
  } catch (e) {
    toast.error(`Export Excel ไม่สำเร็จ: ${(e as { message?: string })?.message || 'unknown'}`);
  }
}

export async function exportReportPdf(build: () => XlsxReportOptions): Promise<void> {
  try {
    const { exportTransferPdf } = await import('./exportTransferPdf');
    await exportTransferPdf(build());
  } catch (e) {
    toast.error(`Export PDF ไม่สำเร็จ: ${(e as { message?: string })?.message || 'unknown'}`);
  }
}
