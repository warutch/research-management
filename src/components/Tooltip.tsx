'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Tooltip:
// - แทน native title="" เพื่อให้ style + responsive + click-to-open
// - hover เปิด (delay 200ms), mouseleave ปิด (delay 100ms กัน flicker ระหว่าง trigger ↔ tooltip)
// - mobile/touch → tap ที่ trigger เปิด/ปิด
// - position fixed + portal → escape overflow + flip ถ้าใกล้ขอบจอ
//
// Content รับเป็น ReactNode → ใส่ breakdown ที่มี layout ได้

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  /** ตำแหน่งเริ่มต้น — ระบบจะ flip อัตโนมัติถ้าไม่พอ */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** ความกว้างสูงสุดของกล่อง tooltip */
  maxWidth?: number;
  /** delay ก่อนแสดง (ms) */
  delay?: number;
}

export function Tooltip({ content, children, placement = 'top', maxWidth = 320, delay = 200 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: 'top' | 'bottom' | 'left' | 'right' } | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // คำนวณตำแหน่ง — เช็คจะออกนอกจอแล้ว flip ถ้าจำเป็น
  const computePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 8;
    const tipW = Math.min(maxWidth, vw - 16); // กัน tooltip ใหญ่กว่าจอ
    const tipH = tooltipRef.current?.offsetHeight ?? 80;

    let actualPlacement: 'top' | 'bottom' | 'left' | 'right' = placement;
    // Flip top/bottom ถ้าไม่พอ
    if (placement === 'top' && rect.top < tipH + gap + 16) actualPlacement = 'bottom';
    if (placement === 'bottom' && rect.bottom + tipH + gap + 16 > vh) actualPlacement = 'top';

    let top: number;
    let left: number;
    if (actualPlacement === 'top') {
      top = rect.top - tipH - gap;
      left = rect.left + rect.width / 2 - tipW / 2;
    } else if (actualPlacement === 'bottom') {
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - tipW / 2;
    } else if (actualPlacement === 'left') {
      top = rect.top + rect.height / 2 - tipH / 2;
      left = rect.left - tipW - gap;
    } else { // right
      top = rect.top + rect.height / 2 - tipH / 2;
      left = rect.right + gap;
    }
    // กันชนขอบซ้าย-ขวา
    left = Math.max(8, Math.min(left, vw - tipW - 8));
    top = Math.max(8, Math.min(top, vh - tipH - 8));
    setCoords({ top, left, placement: actualPlacement });
  };

  const show = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (showTimer.current) clearTimeout(showTimer.current);
    showTimer.current = window.setTimeout(() => {
      computePosition();
      setOpen(true);
      // คำนวณซ้ำหลัง render เผื่อ tipH เปลี่ยน
      requestAnimationFrame(() => computePosition());
    }, delay);
  };

  const hide = () => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOpen(false), 100);
  };

  // Toggle on touch/click (mobile-friendly)
  const toggle = () => {
    if (open) hide();
    else { computePosition(); setOpen(true); }
  };

  // ปิดเมื่อ scroll หรือคลิกข้างนอก
  useEffect(() => {
    if (!open) return;
    const handleScroll = () => computePosition();
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !tooltipRef.current?.contains(t)) {
        setOpen(false);
      }
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timers
  useEffect(() => () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  // Clone trigger child เพื่อแนบ event handlers + ref
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const child = children as any;
  const clonedTrigger = {
    ...child,
    ref: (el: HTMLElement | null) => {
      triggerRef.current = el;
      // forward ref ถ้ามี
      const origRef = child.ref;
      if (typeof origRef === 'function') origRef(el);
      else if (origRef && 'current' in origRef) origRef.current = el;
    },
    props: {
      ...child.props,
      onMouseEnter: (e: React.MouseEvent) => { show(); child.props.onMouseEnter?.(e); },
      onMouseLeave: (e: React.MouseEvent) => { hide(); child.props.onMouseLeave?.(e); },
      onFocus: (e: React.FocusEvent) => { show(); child.props.onFocus?.(e); },
      onBlur: (e: React.FocusEvent) => { hide(); child.props.onBlur?.(e); },
      onClick: (e: React.MouseEvent) => { toggle(); child.props.onClick?.(e); },
    },
  };

  return (
    <>
      {clonedTrigger}
      {mounted && open && coords && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{ top: coords.top, left: coords.left, maxWidth, position: 'fixed' }}
          className="z-[200] bg-gray-900 text-white rounded-lg shadow-2xl px-3 py-2 text-xs animate-fade-in pointer-events-auto"
          onMouseEnter={() => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } }}
          onMouseLeave={hide}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  );
}

// ============ TooltipRow — helper สำหรับใส่ใน content ============
// แสดง label : value แบบ 2 column สวย ๆ ใน tooltip
export function TooltipRow({ label, value, accent }: { label: string; value: React.ReactNode; accent?: 'amber' | 'green' | 'rose' | 'gray' }) {
  const colorCls = accent === 'amber' ? 'text-amber-300' : accent === 'green' ? 'text-green-300' : accent === 'rose' ? 'text-rose-300' : 'text-gray-300';
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-gray-400">{label}</span>
      <span className={`font-medium ${colorCls}`}>{value}</span>
    </div>
  );
}
