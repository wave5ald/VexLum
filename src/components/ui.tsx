import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Diamond } from 'lucide-react';

export const Section: React.FC<{
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ title, children, defaultOpen = true, action, icon }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#1d222a]">
      <div className="flex h-9 items-center justify-between px-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8b95a5] hover:text-white"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {icon}
          {title}
        </button>
        {action}
      </div>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
};

const formatNumber = (value: number, precision = 3): string => {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(precision);
  return fixed.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
};

interface ScrubState {
  pointerId: number;
  startX: number;
  startY: number;
  base: number;
  last: number;
  moved: boolean;
}

export const NumberField: React.FC<{
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  suffix?: string;
  muted?: boolean;
}> = ({ value, onChange, step = 0.01, min, max, precision = 3, suffix, muted }) => {
  const [draft, setDraft] = useState(formatNumber(value, precision));
  const [scrubbing, setScrubbing] = useState(false);
  const focused = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrub = useRef<ScrubState | null>(null);

  useEffect(() => {
    if (!focused.current && !scrubbing) setDraft(formatNumber(value, precision));
  }, [value, precision, scrubbing]);

  const normalise = (next: number): number => {
    let result = next;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    // Kill floating-point noise so scrubbing a 0.01 step lands on clean values.
    return Number(result.toFixed(Math.min(6, precision + 2)));
  };

  const apply = (next: number, live = false) => {
    const result = normalise(next);
    if (live) setDraft(formatNumber(result, precision));
    onChange(result);
  };

  const commit = (raw: string) => {
    const parsed = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(parsed)) {
      apply(parsed);
    } else {
      setDraft(formatNumber(value, precision));
    }
  };

  const endScrub = (pointerId: number, keepFocus: boolean) => {
    const state = scrub.current;
    if (!state || state.pointerId !== pointerId) return;
    scrub.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setScrubbing(false);
    focused.current = keepFocus && !state.moved;
    if (state.moved) {
      setDraft(formatNumber(state.last, precision));
      return;
    }
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  };

  /**
   * Hover-scrub: press and drag up/right to raise the value, down/left to lower
   * it. The value is written on every mouse move so the viewport updates live.
   * Shift drags 10× faster, Alt/Ctrl drags 10× finer. A plain click still
   * focuses the field for typing.
   */
  const startScrub = (event: React.PointerEvent<HTMLInputElement>) => {
    if (event.button !== 0 || focused.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrub.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      base: value,
      last: value,
      moved: false
    };
  };

  const moveScrub = (event: React.PointerEvent<HTMLInputElement>) => {
    const state = scrub.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved) {
      if (Math.abs(dx) + Math.abs(dy) < 3) return;
      state.moved = true;
      setScrubbing(true);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      inputRef.current?.blur();
    }
    const speed = event.shiftKey ? 10 : event.altKey || event.ctrlKey || event.metaKey ? 0.1 : 1;
    const next = normalise(state.base + (dx - dy) * step * speed);
    if (next === state.last) return;
    state.last = next;
    apply(next, true);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={`num-input cursor-ew-resize focus:cursor-text ${muted ? 'text-[#7b8595]' : ''}`}
        value={draft}
        inputMode="decimal"
        title="Drag up/down to scrub · Shift = ×10 · Alt = fine"
        onPointerDown={startScrub}
        onPointerMove={moveScrub}
        onPointerUp={(event) => endScrub(event.pointerId, true)}
        onPointerCancel={(event) => endScrub(event.pointerId, false)}
        onLostPointerCapture={(event) => endScrub(event.pointerId, false)}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          if (scrub.current) return;
          commit(draft);
          setDraft(formatNumber(value, precision));
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = parseFloat(event.target.value);
          if (Number.isFinite(parsed)) apply(parsed);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            (event.target as HTMLInputElement).blur();
          }
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const delta = (event.key === 'ArrowUp' ? 1 : -1) * step * (event.shiftKey ? 10 : 1);
            apply(value + delta, true);
          }
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] font-mono text-[#4b5563]">
          {suffix}
        </span>
      )}
    </div>
  );
};

export const KeyButton: React.FC<{
  animated?: boolean;
  active?: boolean;
  onClick: () => void;
  title?: string;
}> = ({ animated, active, onClick, title = 'Add keyframe at playhead' }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={`keyframe-btn ${active ? 'has-key' : animated ? 'animated' : ''}`}
  >
    <Diamond className="h-3 w-3" fill={active ? 'currentColor' : 'none'} strokeWidth={2.2} />
  </button>
);

export const ColorField: React.FC<{
  value: string;
  onChange: (value: string) => void;
}> = ({ value, onChange }) => {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
  const [draft, setDraft] = useState(safe);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(safe);
  }, [safe]);

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        className="color-swatch"
        value={safe}
        onChange={(event) => onChange(event.target.value)}
      />
      <input
        className="num-input text-left"
        value={draft}
        spellCheck={false}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          const normalized = draft.startsWith('#') ? draft : `#${draft}`;
          if (/^#[0-9a-f]{6}$/i.test(normalized)) onChange(normalized.toLowerCase());
          else setDraft(safe);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          const normalized = event.target.value.startsWith('#')
            ? event.target.value
            : `#${event.target.value}`;
          if (/^#[0-9a-f]{6}$/i.test(normalized)) onChange(normalized.toLowerCase());
        }}
      />
    </div>
  );
};

export const SliderField: React.FC<{
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}> = ({ value, min, max, step = 0.01, onChange, format }) => (
  <div className="flex items-center gap-2">
    <input
      type="range"
      className="slider flex-1"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(parseFloat(event.target.value))}
    />
    <span className="w-10 text-right font-mono text-[10px] text-[#8b95a5]">
      {format ? format(value) : value.toFixed(2)}
    </span>
  </div>
);

export const Toggle: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}> = ({ checked, onChange, label }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="flex items-center gap-2"
    aria-pressed={checked}
  >
    <span
      className={`relative h-[16px] w-[28px] rounded-full transition-colors ${
        checked ? 'bg-cyan-500/80' : 'bg-[#2a3038]'
      }`}
    >
      <span
        className={`absolute top-[2px] h-[12px] w-[12px] rounded-full bg-white transition-transform ${
          checked ? 'translate-x-[14px]' : 'translate-x-[2px]'
        }`}
      />
    </span>
    {label && <span className="text-[11px] text-[#a9b2c0]">{label}</span>}
  </button>
);

export const Row: React.FC<{
  label: React.ReactNode;
  children: React.ReactNode;
  keyButton?: React.ReactNode;
  hint?: string;
}> = ({ label, children, keyButton, hint }) => (
  <div className="mb-1.5 grid grid-cols-[82px_1fr_18px] items-center gap-1.5" title={hint}>
    <span className="field-label truncate">{label}</span>
    {children}
    {keyButton || <span />}
  </div>
);

export const MiniButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
}> = ({ children, onClick, active, title }) => (
  <button
    type="button"
    title={title}
    onClick={onClick}
    className={`flex h-6 items-center gap-1 rounded-[4px] border px-2 text-[10px] font-medium transition-colors ${
      active
        ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
        : 'border-[#2a3038] bg-[#15181d] text-[#9aa4b2] hover:border-[#39414c] hover:text-white'
    }`}
  >
    {children}
  </button>
);
