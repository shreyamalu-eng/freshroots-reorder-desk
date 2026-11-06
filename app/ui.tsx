"use client";
// Shared visual pieces for the v2 desk: icons, product illustrations, ring gauge, runway, ruler dial, bar chart.
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Recommendation, Status } from "../src/engine/types";

export const STATUS: Record<Status, { label: string; glyph: string; color: string; chip: string }> = {
  reorder_now: { label: "Reorder now", glyph: "↑", color: "var(--orange)", chip: "orange" },
  reorder: { label: "Reorder", glyph: "↗", color: "var(--lime-2)", chip: "lime" },
  pause: { label: "Pause", glyph: "‖", color: "var(--lavender)", chip: "lav" },
  ok: { label: "In window", glyph: "✓", color: "var(--sage-2)", chip: "" },
  exception: { label: "Your call", glyph: "?", color: "var(--butter)", chip: "butter" },
  held: { label: "Held", glyph: "!", color: "var(--sage-2)", chip: "" },
};

export const fmt = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));
export const short = (n: string) => n.replace(/^Freshroots /, "");

export function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => { setR(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  return r;
}

/** Count a number up from 0 (Pin 2 centre number). */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) { setV(value); return; }
    let raf = 0; const t0 = performance.now(); const from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 900); const e = 1 - Math.pow(1 - p, 3);
      setV(from + (value - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <>{decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString("en-IN")}</>;
}

const ICONS: Record<string, ReactNode> = {
  home: <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />,
  queue: <><path d="M5 7h14M5 12h14M5 17h9" /><circle cx="19" cy="17" r="1.5" /></>,
  orders: <><path d="M6 4h12v16l-3-2-3 2-3-2-3 2z" /><path d="M9 9h6M9 13h6" /></>,
  insights: <path d="M5 20V10M10 20V5M15 20v-7M20 20v-4" />,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  cal: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  run: <><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4.5V9h-4.5" /><path d="M10 9.2v5.6l4.6-2.8z" /></>,
  box: <><path d="M4 8 12 4l8 4-8 4z" /><path d="M4 8v8l8 4 8-4V8" /></>,
  flame: <path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 2 3 4" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  stack: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  arrow: <path d="M7 17 17 7M9 7h8v8" />,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
};
export function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>;
}

/** Flat product illustrations per category, on a tinted tile (no photos, no emoji). */
const TILE: Record<string, string> = { Beverage: "var(--lime)", Snack: "var(--butter)", Staple: "var(--sage)", "Dairy Alt": "var(--lavender)", Condiment: "var(--peach)" };
export function ProductTile({ category, big }: { category: string; big?: boolean }) {
  const F = "#143D26", L = "#B9DC5C", W = "#FFFFFF", O = "#F26A21";
  const art: Record<string, ReactNode> = {
    Beverage: <><rect x="17" y="6" width="14" height="6" rx="2" fill={F} /><path d="M15 14c0-2 2-3 3-3h12c1 0 3 1 3 3v24a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4z" fill={W} /><rect x="15" y="22" width="18" height="10" fill={L} /><circle cx="24" cy="27" r="3" fill={O} /></>,
    Snack: <><rect x="8" y="15" width="32" height="18" rx="6" fill={W} /><path d="M8 21h32M8 27h32" stroke={L} strokeWidth="3" /><path d="M6 17l2 2-2 2 2 2-2 2 2 2-2 2 2 2M42 17l-2 2 2 2-2 2 2 2-2 2 2 2-2 2" stroke={F} strokeWidth="1.6" fill="none" /><circle cx="24" cy="24" r="3" fill={O} /></>,
    Staple: <><path d="M14 14c2-4 18-4 20 0l3 22a5 5 0 0 1-5 6H16a5 5 0 0 1-5-6z" fill={W} /><path d="M17 12c2 2 12 2 14 0" stroke={F} strokeWidth="2" fill="none" /><path d="M24 22v12M24 26c-3-1-4-3-4-5M24 30c3-1 4-3 4-5" stroke={L} strokeWidth="2.4" fill="none" strokeLinecap="round" /></>,
    "Dairy Alt": <><path d="M15 16 20 8h8l5 8v24a2 2 0 0 1-2 2H17a2 2 0 0 1-2-2z" fill={W} /><path d="M15 16h18" stroke={F} strokeWidth="2" /><rect x="15" y="24" width="18" height="9" fill={L} /><circle cx="24" cy="12" r="1.6" fill={F} /></>,
    Condiment: <><rect x="14" y="8" width="20" height="7" rx="2.5" fill={F} /><rect x="12" y="15" width="24" height="26" rx="6" fill={W} /><rect x="16" y="22" width="16" height="11" rx="3" fill={L} /><circle cx="24" cy="27.5" r="2.6" fill={O} /></>,
  };
  return (
    <span className={`tile${big ? " big" : ""}`} style={{ ["--t" as string]: TILE[category] ?? "var(--sage)" }} aria-hidden="true">
      <svg viewBox="0 0 48 48">{art[category] ?? <circle cx="24" cy="24" r="12" fill={W} />}</svg>
    </span>
  );
}

/** Ring gauge with orange gradient (Pin 2). */
export function Ring({ value, total, size = 188, stroke = 14, children }: { value: number; total: number; size?: number; stroke?: number; children: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const [p, setP] = useState(0);
  useEffect(() => { const t = setTimeout(() => setP(total ? value / total : 0), 60); return () => clearTimeout(t); }, [value, total]);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F26A21" /><stop offset="1" stopColor="#FFB287" /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sage)" strokeWidth={stroke} />
        <circle className="sweep" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#rg)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
      </svg>
      <div className="c">{children}</div>
    </div>
  );
}

/** Lime arc on the forest hero card (Fitness ref). */
export function Arc({ p }: { p: number }) {
  const size = 230, r = 92, c = Math.PI * r;
  const [v, setV] = useState(0);
  useEffect(() => { const t = setTimeout(() => setV(p), 80); return () => clearTimeout(t); }, [p]);
  return (
    <svg className="arc" width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`} aria-hidden="true">
      <path d={`M ${size / 2 - r} ${size / 2 + 10} A ${r} ${r} 0 0 1 ${size / 2 + r} ${size / 2 + 10}`} fill="none" stroke="rgba(221,239,181,.18)" strokeWidth="22" strokeLinecap="round" />
      <path className="sweep" d={`M ${size / 2 - r} ${size / 2 + 10} A ${r} ${r} 0 0 1 ${size / 2 + r} ${size / 2 + 10}`} fill="none" stroke="#B9DC5C" strokeWidth="22" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
    </svg>
  );
}

/** Runway: weeks of cover on a track; hatched band = the reorder window. */
export function Runway({ r, max = 24 }: { r: Recommendation; max?: number }) {
  const pct = (v: number) => `${(Math.min(max, v) / max) * 100}%`;
  if (r.coverWeeks == null) return <div className="runway" aria-label="Cover unknown" />;
  const fill = Math.max(8, (Math.min(max, r.coverWeeks) / max) * 100);
  const out = fill < 26;
  return (
    <div>
      <div className="runway" role="img" aria-label={`${r.coverWeeks} weeks of cover, window ${r.window.min} to ${r.window.max} weeks`}>
        <span className="win" style={{ left: pct(r.window.min), width: `calc(${pct(r.window.max)} - ${pct(r.window.min)})` }} />
        <span className="fill" style={{ width: `${fill}%`, ["--c" as string]: STATUS[r.status].color }} />
        <span className={`val${out ? " out" : ""}`} style={{ left: `${fill}%` }}>{r.coverWeeks} wk</span>
      </div>
      <div className="rlabels"><span>0</span><span>window {r.window.min}–{r.window.max} wk</span><span>{max}+</span></div>
    </div>
  );
}

/** Ruler dial (Pin 1): scroll-snaps to steps of 10 units; ←/→ and ± move it too. */
export function Ruler({ value, onChange, max, was }: { value: number; onChange: (v: number) => void; max: number; was: number | null }) {
  const STEP = 10, W = 12;
  const n = Math.ceil(max / STEP) + 1;
  const ref = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState(false);
  const settle = useRef<number | null>(null);
  useEffect(() => { ref.current?.scrollTo({ left: (value / STEP) * W }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const move = (v: number) => { const c = Math.max(0, Math.min(max, v)); onChange(c); ref.current?.scrollTo({ left: (c / STEP) * W, behavior: "smooth" }); };
  return (
    <div className="dial">
      <div className="top">
        <button type="button" className="rbtn" aria-label="Minus 10 units" onClick={() => move(value - STEP)}><svg viewBox="0 0 24 24"><path d="M6 12h12" /></svg></button>
        <div className="v" aria-live="polite"><b>{fmt(value)}</b><span>units{was != null && value !== was ? <> · <span className="was">rules said {fmt(was)}</span></> : null}</span></div>
        <button type="button" className="rbtn" aria-label="Plus 10 units" onClick={() => move(value + STEP)}><Icon name="plus" /></button>
      </div>
      <div className={`ruler${snap ? " snap" : ""}`}>
        <div className="strip" ref={ref} tabIndex={0} role="slider" aria-label="Quantity" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}
          onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); move(value + STEP); } if (e.key === "ArrowLeft") { e.preventDefault(); move(value - STEP); } }}
          onScroll={(e) => {
            const v = Math.round(e.currentTarget.scrollLeft / W) * STEP;
            if (v !== value) onChange(Math.min(max, v));
            if (settle.current) clearTimeout(settle.current);
            settle.current = window.setTimeout(() => { setSnap(true); setTimeout(() => setSnap(false), 260); }, 120);
          }}>
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className={`tk${i % 5 === 0 ? " maj" : ""}`}><span>{i % 10 === 0 ? i * STEP : ""}</span><i /></span>
          ))}
        </div>
        <span className="needle" />
      </div>
    </div>
  );
}

/** Thin bar chart, greening toward recent weeks, with dashed 12-wk average (and festival demand). */
export function Bars({ values, labels, avg, fest, selected }: { values: number[]; labels: string[]; avg?: number; fest?: number; selected?: number }) {
  const max = Math.max(1, ...values, avg ?? 0, fest ?? 0) * 1.12;
  const n = values.length;
  const color = (i: number) => (i >= n - 4 ? "var(--forest-2)" : i >= n - 8 ? "var(--lime-2)" : "var(--sage-2)");
  return (
    <div>
      <div className="chart" role="img" aria-label={`Weekly units: ${values.join(", ")}`}>
        {values.map((v, i) => (
          <div key={i} className={`b${i === (selected ?? n - 1) ? " sel" : ""}`}>
            <span className="bub" style={{ bottom: `${(v / max) * 100}%` }}>{fmt(v)}</span>
            <i style={{ height: `${(v / max) * 100}%`, ["--c" as string]: color(i), ["--k" as string]: i }} />
          </div>
        ))}
        {avg != null && <div className="avg" style={{ bottom: `${(avg / max) * 100}%` }}><span>12-wk avg {fmt(avg)}</span></div>}
        {fest != null && <div className="avg fest" style={{ bottom: `${(fest / max) * 100}%` }}><span>festival demand {fmt(fest)}</span></div>}
      </div>
      <div className="xlabels">{labels.filter((_, i) => i % 4 === 0 || i === labels.length - 1).map((l) => <span key={l}>{l}</span>)}</div>
    </div>
  );
}

export function StatusChip({ s }: { s: Status }) {
  const m = STATUS[s];
  return <span className="status" style={{ ["--c" as string]: m.color }}><i aria-hidden="true">{m.glyph}</i>{m.label}</span>;
}
