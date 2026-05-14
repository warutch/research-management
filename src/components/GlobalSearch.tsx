'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { Modal } from './Modal';
import { Search, FolderKanban, FileText, Banknote, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

// GlobalSearch = popup ค้นข้าม page (โครงการ / ใบเสนอราคา / รับเงิน)
// Trigger: Cmd+K (Mac) / Ctrl+K (Win/Linux)
// Esc ปิด, Enter เลือกอันที่ highlight, Arrow up/down เปลี่ยน focus

type SearchResultType = 'project' | 'quotation' | 'payment';

interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle?: string;
  href: string;
}

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Pull data from store (already filtered by global filters — but search should be unfiltered)
  const allProjects = useStore((s) => s._allProjects);
  const allQuotations = useStore((s) => s._allQuotations);
  const allPayments = useStore((s) => s._allPayments);

  // คีย์ลัด: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input + reset เมื่อ open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      // delay focus หลัง modal animation
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // คำนวณ results (limit 8 ต่อประเภท)
  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matchesProject = allProjects
      .filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.projectCode || '').toLowerCase().includes(q) ||
        (p.client || '').toLowerCase().includes(q)
      )
      .slice(0, 8)
      .map<SearchResult>((p) => ({
        id: `p-${p.id}`,
        type: 'project',
        title: p.name,
        subtitle: [p.projectCode, p.client].filter(Boolean).join(' • '),
        href: `/projects?id=${p.id}`,
      }));
    const matchesQuotation = allQuotations
      .filter((q1) =>
        (q1.quotationNumber || '').toLowerCase().includes(q) ||
        (q1.clientName || '').toLowerCase().includes(q)
      )
      .slice(0, 6)
      .map<SearchResult>((q1) => ({
        id: `q-${q1.id}`,
        type: 'quotation',
        title: q1.clientName || '(ไม่มีชื่อลูกค้า)',
        subtitle: q1.quotationNumber,
        href: `/quotations?id=${q1.id}`,
      }));
    const matchesPayment = allPayments
      .filter((p) => (p.note || '').toLowerCase().includes(q))
      .slice(0, 4)
      .map<SearchResult>((p) => ({
        id: `pay-${p.id}`,
        type: 'payment',
        title: p.note || `รับเงิน ${formatCurrency(p.amount)}`,
        subtitle: `${formatCurrency(p.amount)} • ${p.paidDate || '-'}`,
        href: `/payments`,
      }));
    return [...matchesProject, ...matchesQuotation, ...matchesPayment];
  }, [query, allProjects, allQuotations, allPayments]);

  // Reset activeIdx เมื่อ results เปลี่ยน
  useEffect(() => { setActiveIdx(0); }, [results.length]);

  // Navigation keys
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && results[activeIdx]) {
        e.preventDefault();
        navigate(results[activeIdx]);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, results, activeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (r: SearchResult) => {
    setOpen(false);
    router.push(r.href);
  };

  return (
    <Modal open={open} onClose={() => setOpen(false)} size="lg" bare>
      <div className="flex items-center gap-3 p-4 border-b border-gray-100">
        <Search size={18} className="text-gray-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาโครงการ ใบเสนอราคา การชำระเงิน..."
          className="flex-1 outline-none text-sm text-gray-700 placeholder:text-gray-400"
        />
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-mono">ESC</span>
      </div>
      <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
        {query.trim() === '' ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            <p className="mb-2">พิมพ์เพื่อค้นหา</p>
            <p className="text-xs">⌘K / Ctrl+K เปิด-ปิดได้</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">ไม่พบผลลัพธ์สำหรับ &quot;{query}&quot;</div>
        ) : (
          <>
            {/* Group by type */}
            {(['project', 'quotation', 'payment'] as SearchResultType[]).map((groupType) => {
              const group = results.filter((r) => r.type === groupType);
              if (group.length === 0) return null;
              const groupLabel = groupType === 'project' ? 'โครงการ' : groupType === 'quotation' ? 'ใบเสนอราคา' : 'การชำระเงิน';
              const Icon = groupType === 'project' ? FolderKanban : groupType === 'quotation' ? FileText : Banknote;
              return (
                <div key={groupType} className="mb-2">
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide px-2 py-1">{groupLabel}</p>
                  {group.map((r) => {
                    const globalIdx = results.findIndex((x) => x.id === r.id);
                    const isActive = globalIdx === activeIdx;
                    return (
                      <button
                        key={r.id}
                        onClick={() => navigate(r)}
                        onMouseEnter={() => setActiveIdx(globalIdx)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${isActive ? 'bg-indigo-50 text-indigo-900' : 'hover:bg-gray-50 text-gray-700'}`}
                      >
                        <Icon size={16} className={isActive ? 'text-indigo-500' : 'text-gray-400'} />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{r.title}</p>
                          {r.subtitle && <p className="truncate text-xs text-gray-500">{r.subtitle}</p>}
                        </div>
                        {isActive && <ArrowRight size={14} className="text-indigo-500" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-gray-100 text-[11px] text-gray-500 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <span>↑↓ เลื่อน</span>
          <span>↵ เลือก</span>
        </div>
        <span>{results.length > 0 && `${results.length} ผลลัพธ์`}</span>
      </div>
    </Modal>
  );
}
