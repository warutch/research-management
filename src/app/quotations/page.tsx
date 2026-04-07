'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Quotation, QuotationItem } from '@/types';
import { formatCurrency, formatDate, generateQuotationNumber } from '@/lib/utils';
import { generateQuotationPdf } from '@/lib/generatePdf';
import { Plus, Trash2, Pencil, FileDown, Eye, X, Save, FileText } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useHydrated } from '@/lib/useHydrated';

type QuotationForm = Omit<Quotation, 'id' | 'createdAt'>;

const emptyItem = (): QuotationItem => ({
  id: uuidv4(),
  description: '',
  quantity: 1,
  unit: 'งาน',
  unitPrice: 0,
  amount: 0,
});

export default function QuotationsPage() {
  const hydrated = useHydrated();
  const { quotations, projects, addQuotation, updateQuotation, deleteQuotation } = useStore();

  const createEmptyForm = (): QuotationForm => ({
    quotationNumber: generateQuotationNumber(quotations.map((q) => q.quotationNumber)),
    projectId: '',
    clientName: '',
    clientAddress: '',
    clientPhone: '',
    items: [emptyItem()],
    date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
    validUntil: (() => { const d = new Date(Date.now() + 7 * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
    notes: 'รายละเอียดการชำระเงิน\nงวดที่ 1: ส่ง draft มัดจำ 50%\nงวดที่ 2: ส่งบทความฉบับสมบูรณ์\nงวดที่ 3: ส่ง Submit วารสาร\n*ค่าใช้จ่ายทั้งหมดไม่รวมค่าธรรมเนียมตีพิมพ์วารสาร',
    discount: 0,
  });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<QuotationForm>(createEmptyForm());
  const [previewQuotation, setPreviewQuotation] = useState<Quotation | null>(null);

  const handleProjectSelect = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      setForm({ ...form, projectId });
      return;
    }
    const items: QuotationItem[] = project.activities.map((activity) => ({
      id: uuidv4(),
      description: activity.name,
      quantity: 1,
      unit: 'งาน',
      unitPrice: activity.cost,
      amount: activity.cost,
    }));
    // สร้างหมายเหตุจากงวดเงินของโครงการ
    const installments = (project.installments || []).sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0));
    const DISCLAIMER = '*ค่าใช้จ่ายทั้งหมดไม่รวมค่าธรรมเนียมตีพิมพ์วารสาร';
    const instNotes = installments.length > 0
      ? 'รายละเอียดการชำระเงิน\n' + installments.map((inst) => `งวดที่ ${inst.installmentNumber}: ${inst.name}${inst.amount > 0 ? ` (${formatCurrency(inst.amount)})` : ''}`).join('\n') + '\n' + DISCLAIMER
      : form.notes;
    setForm({
      ...form,
      projectId,
      clientName: project.client,
      items: items.length > 0 ? items : [emptyItem()],
      notes: instNotes,
    });
  };

  const updateItem = (index: number, field: keyof QuotationItem, value: string | number) => {
    const newItems = [...form.items];
    const item = { ...newItems[index], [field]: value };
    if (field === 'quantity' || field === 'unitPrice') {
      item.amount = item.quantity * item.unitPrice;
    }
    newItems[index] = item;
    setForm({ ...form, items: newItems });
  };

  const addItem = () => {
    setForm({ ...form, items: [...form.items, emptyItem()] });
  };

  const removeItem = (index: number) => {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, i) => i !== index) });
  };

  const handleSave = () => {
    if (!form.clientName.trim()) {
      alert('กรุณาระบุชื่อลูกค้า');
      return;
    }
    if (editingId) {
      updateQuotation(editingId, form);
    } else {
      addQuotation(form);
    }
    setForm(createEmptyForm());
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (q: Quotation) => {
    setForm({
      quotationNumber: q.quotationNumber,
      projectId: q.projectId,
      clientName: q.clientName,
      clientAddress: q.clientAddress,
      clientPhone: q.clientPhone,
      items: q.items,
      date: q.date,
      validUntil: q.validUntil,
      notes: q.notes,
      discount: q.discount,
    });
    setEditingId(q.id);
    setShowForm(true);
  };

  const getSubtotal = (items: QuotationItem[]) => items.reduce((sum, i) => sum + i.amount, 0);

  if (!hydrated) return <div className="flex items-center justify-center h-64 text-gray-400">กำลังโหลด...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ใบเสนอราคา</h1>
          <p className="text-gray-500 text-sm mt-1">สร้างและจัดการใบเสนอราคาสำหรับลูกค้า</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setForm(createEmptyForm()); setEditingId(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          <Plus size={16} /> สร้างใบเสนอราคา
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-900">
                {editingId ? 'แก้ไขใบเสนอราคา' : 'สร้างใบเสนอราคาใหม่'}
              </h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); }}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เลขที่ใบเสนอราคา</label>
                  <input
                    type="text"
                    value={form.quotationNumber}
                    onChange={(e) => setForm({ ...form, quotationNumber: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">โครงการ (ดึงข้อมูลอัตโนมัติ)</label>
                  <select
                    value={form.projectId}
                    onChange={(e) => handleProjectSelect(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- ไม่ผูกโครงการ --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อลูกค้า *</label>
                  <input
                    type="text"
                    value={form.clientName}
                    onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ที่อยู่</label>
                  <input
                    type="text"
                    value={form.clientAddress}
                    onChange={(e) => setForm({ ...form, clientAddress: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">เบอร์โทร</label>
                  <input
                    type="text"
                    value={form.clientPhone}
                    onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ใช้ได้ถึง</label>
                  <input
                    type="date"
                    value={form.validUntil}
                    onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">รายการ</label>
                  <button onClick={addItem} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700">
                    <Plus size={14} /> เพิ่มรายการ
                  </button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, index) => (
                    <div key={item.id} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        {index === 0 && <span className="text-xs text-gray-500">รายละเอียด</span>}
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(index, 'description', e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="รายละเอียด"
                        />
                      </div>
                      <div className="col-span-1">
                        {index === 0 && <span className="text-xs text-gray-500">จำนวน</span>}
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                          className="w-full border rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="col-span-2">
                        {index === 0 && <span className="text-xs text-gray-500">หน่วย</span>}
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => updateItem(index, 'unit', e.target.value)}
                          className="w-full border rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="col-span-2">
                        {index === 0 && <span className="text-xs text-gray-500">ราคา/หน่วย</span>}
                        <input
                          type="number"
                          min={0}
                          value={item.unitPrice || ''}
                          onChange={(e) => updateItem(index, 'unitPrice', Number(e.target.value))}
                          className="w-full border rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div className="col-span-1">
                        {index === 0 && <span className="text-xs text-gray-500">รวม</span>}
                        <p className="py-2 text-sm text-gray-700 text-right">{item.amount.toLocaleString()}</p>
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button onClick={() => removeItem(index)} className="p-1 text-gray-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="flex justify-end">
                <div className="w-60 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">รวม</span>
                    <span>{formatCurrency(getSubtotal(form.items))}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-gray-500">ส่วนลด (%)</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.discount || ''}
                      onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })}
                      className="w-20 border rounded px-2 py-1 text-sm text-right outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>รวมสุทธิ</span>
                    <span className="text-indigo-600">
                      {formatCurrency(getSubtotal(form.items) * (1 - form.discount / 100))}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  placeholder="หมายเหตุเพิ่มเติม..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t">
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 text-sm text-gray-600">
                ยกเลิก
              </button>
              <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                <Save size={16} /> บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewQuotation && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-900">Preview ใบเสนอราคา</h2>
              <button onClick={() => setPreviewQuotation(null)}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="p-8">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">QUOTATION</h1>
                <p className="text-sm text-gray-500">Research Management Co., Ltd.</p>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                <div>
                  <p className="text-gray-500">No: {previewQuotation.quotationNumber}</p>
                  <p className="text-gray-500">Date: {formatDate(previewQuotation.date)}</p>
                  <p className="text-gray-500">Valid: {formatDate(previewQuotation.validUntil)}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{previewQuotation.clientName}</p>
                  <p className="text-gray-500">{previewQuotation.clientAddress}</p>
                  {previewQuotation.clientPhone && (
                    <p className="text-gray-500">Tel: {previewQuotation.clientPhone}</p>
                  )}
                </div>
              </div>
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="bg-indigo-600 text-white">
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-center">Qty</th>
                    <th className="px-3 py-2 text-center">Unit</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {previewQuotation.items.map((item, i) => (
                    <tr key={item.id} className="border-b">
                      <td className="px-3 py-2">{i + 1}</td>
                      <td className="px-3 py-2">{item.description}</td>
                      <td className="px-3 py-2 text-center">{item.quantity}</td>
                      <td className="px-3 py-2 text-center">{item.unit}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end">
                <div className="w-60 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCurrency(getSubtotal(previewQuotation.items))}</span>
                  </div>
                  {previewQuotation.discount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Discount ({previewQuotation.discount}%)</span>
                      <span>-{formatCurrency(getSubtotal(previewQuotation.items) * previewQuotation.discount / 100)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg border-t pt-1">
                    <span>Total</span>
                    <span className="text-indigo-600">
                      {formatCurrency(getSubtotal(previewQuotation.items) * (1 - previewQuotation.discount / 100))}
                    </span>
                  </div>
                </div>
              </div>
              {previewQuotation.notes && (
                <div className="mt-4 text-sm text-gray-600">
                  <p className="font-medium">หมายเหตุ:</p>
                  {previewQuotation.notes.split('\n').map((line, i) => (
                    <p key={i} className={line.startsWith('*') ? 'text-red-600 font-medium' : ''}>{line}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-5 border-t">
              <button onClick={() => setPreviewQuotation(null)} className="px-4 py-2 text-sm text-gray-600">
                ปิด
              </button>
              <button
                onClick={() => generateQuotationPdf(previewQuotation)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                <FileDown size={16} /> Export PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quotations List */}
      {quotations.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <FileText size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 mb-1">ยังไม่มีใบเสนอราคา</p>
          <p className="text-gray-400 text-sm">กดปุ่ม &quot;สร้างใบเสนอราคา&quot; เพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 bg-gradient-to-r from-gray-50 to-gray-100 border-b">
                  <th className="px-5 py-3 font-medium">เลขที่</th>
                  <th className="px-5 py-3 font-medium">ลูกค้า</th>
                  <th className="px-5 py-3 font-medium">โครงการ</th>
                  <th className="px-5 py-3 font-medium">วันที่</th>
                  <th className="px-5 py-3 font-medium text-right">ยอดรวม</th>
                  <th className="px-5 py-3 font-medium text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {[...quotations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((q) => {
                  const subtotal = getSubtotal(q.items);
                  const total = subtotal * (1 - q.discount / 100);
                  const projectName = projects.find((p) => p.id === q.projectId)?.name;
                  return (
                    <tr key={q.id} className="border-b border-gray-50 hover:bg-indigo-50/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-700">{q.quotationNumber}</td>
                      <td className="px-5 py-3 text-gray-700">{q.clientName}</td>
                      <td className="px-5 py-3 text-gray-500">{projectName || '-'}</td>
                      <td className="px-5 py-3 text-gray-500">{formatDate(q.date)}</td>
                      <td className="px-5 py-3 text-right font-medium text-gray-700">{formatCurrency(total)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setPreviewQuotation(q)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded hover:bg-gray-100" title="Preview">
                            <Eye size={15} />
                          </button>
                          <button onClick={() => generateQuotationPdf(q)} className="p-1.5 text-gray-400 hover:text-green-600 rounded hover:bg-gray-100" title="Export PDF">
                            <FileDown size={15} />
                          </button>
                          <button onClick={() => handleEdit(q)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100" title="Edit">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => { if (confirm('ลบใบเสนอราคานี้?')) deleteQuotation(q.id); }} className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-gray-100" title="Delete">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
