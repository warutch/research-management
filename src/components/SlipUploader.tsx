'use client';

import { useState, useRef } from 'react';
import { Upload, X, Eye, Plus } from 'lucide-react';

interface Props {
  values: string[];
  onChange: (urls: string[]) => void;
  onPreview?: (url: string) => void;
  color?: 'indigo' | 'green';
}

export default function SlipUploader({ values, onChange, onPreview, color = 'indigo' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [internalPreview, setInternalPreview] = useState<string | null>(null);

  const colorClasses = color === 'green'
    ? { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-300', hoverBorder: 'hover:border-green-400' }
    : { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-300', hoverBorder: 'hover:border-indigo-400' };

  const readFiles = (files: FileList) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    const readers = imageFiles.map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        })
    );
    Promise.all(readers).then((results) => onChange([...values, ...results]));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) readFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) readFiles(e.dataTransfer.files);
  };

  const handleRemove = (index: number) => {
    if (confirm('ลบ Slip นี้?')) {
      onChange(values.filter((_, i) => i !== index));
    }
  };

  const handlePreview = (url: string) => {
    if (onPreview) onPreview(url);
    else setInternalPreview(url);
  };

  return (
    <>
      {/* Upload zone (drag & drop) — show always */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
          dragOver
            ? `${colorClasses.border} ${colorClasses.bg}`
            : `border-gray-300 ${colorClasses.hoverBorder} hover:bg-gray-50`
        }`}
      >
        <div className="flex flex-col items-center gap-1.5">
          <div className={`w-9 h-9 rounded-full ${colorClasses.bg} flex items-center justify-center`}>
            <Upload size={16} className={colorClasses.text} />
          </div>
          <p className="text-sm font-medium text-gray-700">
            {values.length === 0 ? 'ลากรูปมาวางที่นี่ หรือ ' : 'เพิ่ม Slip อีก หรือ '}
            <span className={colorClasses.text}>คลิกเพื่อเลือก</span>
          </p>
          <p className="text-xs text-gray-400">เลือกได้หลายไฟล์ (PNG, JPG, JPEG)</p>
        </div>
        <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleFileInput} className="hidden" />
      </div>

      {/* Slip thumbnails grid */}
      {values.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-2">Slip ทั้งหมด ({values.length})</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {values.map((url, i) => (
              <div key={i} className="relative border rounded-lg overflow-hidden bg-gray-50 group aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`slip ${i + 1}`} className="w-full h-full object-cover" />
                <div className="absolute top-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                  {i + 1}
                </div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handlePreview(url); }}
                    className="p-1.5 bg-white text-gray-700 rounded-md text-xs hover:bg-gray-100 shadow"
                    title="ดูใหญ่"
                  >
                    <Eye size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemove(i); }}
                    className="p-1.5 bg-red-500 text-white rounded-md text-xs hover:bg-red-600 shadow"
                    title="ลบ"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
            {/* Add more button */}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg aspect-square text-gray-400 hover:${colorClasses.text} hover:${colorClasses.border} transition-colors`}
            >
              <Plus size={20} />
              <span className="text-xs mt-1">เพิ่ม</span>
            </button>
          </div>
        </div>
      )}

      {/* Internal preview modal */}
      {internalPreview && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl max-h-[90vh] overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-gray-900">Slip การโอนเงิน</h3>
              <button onClick={() => setInternalPreview(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={internalPreview} alt="Slip" className="w-full rounded-lg" />
          </div>
        </div>
      )}
    </>
  );
}
