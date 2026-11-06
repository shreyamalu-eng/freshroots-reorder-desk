"use client";
// Freshroots Reorder Desk v2 — built from DESIGN_PROMPT.md.
// Screens: Home · Queue (with SKU sheet) · Orders (hand-off + Zoho) · Insights · Connections. Data: Neon via /api routes.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Recommendation, Status } from "../src/engine/types";
import { Arc, Bars, CountUp, Icon, ProductTile, Ring, Ruler, Runway, STATUS, StatusChip, fmt, short } from "./ui";

type Rec = Recommendation & { reason: string; reasonSource: "gemini" | "template" };
type Dec = { sku: string; decision: string; final_qty: number | null; note: string | null; decided_by: string; decided_at: string };
type ZohoPo = { vendor_name: string; zoho_po_id: string | null; zoho_po_number: string | null; status: string; line_count: number; total_units: number; error: string | null; created_by: string; created_at: string };
type RunData = {
  run: { id: string; run_date: string; status: string; festival: boolean; stock_as_of: string; last_complete_week: string; summary: string | null; summary_source: string; issues: { level: string; message: string }[]; created_at: string; sent_at: string | null };
  recommendations: Rec[]; decisions: Dec[];
  handoffs: { id: string; line_count: number; total_units: number; sent_by: string; sent_at: string }[];
  distributors: { sku: string; name: string | null; region: string | null; uom: string | null }[];
  zohoPos: ZohoPo[];
};
type Integrations = {
  neon: { ok: boolean; host?: string; error?: string };
  ai: { configured: boolean; provider: string | null; model: string | null };
  zoho: { configured: boolean; dc: string; lastSync: string | null; openPoLines: number };
  cron: { configured: boolean; schedule: string };
};
type View = "home" | "queue" | "orders" | "insights" | "connections";
const RUN_DATE = "2026-10-22"; // the case data's planning date
const needs = (r: Rec) => ["reorder_now", "reorder", "pause", "exception"].includes(r.status);
const isoWeek = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - (d.getUTCDay() || 7))); return Math.ceil(((+t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); };
const time = (s?: string | null) => (s ? new Date(s).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export default function Desk() {
  const [view, setView] = useState<View>("home");
  const [data, setData] = useState<RunData | null>(null);
  const [state, setState] = useState<"loading" | "none" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [integ, setInteg] = useState<Integrations | null>(null);
  const [who, setWho] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => { const m = window.matchMedia("(min-width: 1101px)"); const f = () => setWide(m.matches); f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);
  const [filter, setFilter] = useState<"todo" | Status | "all">("todo");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [leaving, setLeaving] = useState<string | null>(null);

  const say = (m: string) => { setToast(m); window.setTimeout(() => setToast(""), 3800); };
  const load = useCallback(async () => {
    const res = await fetch("/api/runs", { cache: "no-store" });
    if (res.status === 404) { setData(null); setState("none"); return; }
    if (!res.ok) { setState("error"); setErrMsg((await res.json().catch(() => ({}))).error ?? `The server answered ${res.status}.`); return; }
    setData(await res.json()); setState("ready");
  }, []);
  const loadInteg = useCallback(async () => { const r = await fetch("/api/integrations", { cache: "no-store" }).catch(() => null); if (r?.ok) setInteg(await r.json()); }, []);
  useEffect(() => { load(); loadInteg(); try { setWho(localStorage.getItem("fr-who") ?? ""); } catch { /* storage blocked */ } }, [load, loadInteg]);

  const recs = data?.recommendations ?? [];
  const decs = useMemo(() => Object.fromEntries((data?.decisions ?? []).map((d) => [d.sku, d])), [data]);
  const dist = useMemo(() => Object.fromEntries((data?.distributors ?? []).map((d) => [d.sku, d])), [data]);
  const need = recs.filter(needs);
  const done = need.filter((r) => decs[r.sku]).length;
  const sent = data?.run.status === "sent";
  const count = (s: Status) => recs.filter((r) => r.status === s).length;

  async function api(path: string, body?: unknown, method = "POST") {
    const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const out = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, out };
  }
  // Run panel: confirm -> live steps -> result. One POST does the work; the steps animate while it runs.
  type RunOut = { blocked?: boolean; counts?: Record<string, number>; issues?: { level: string; message: string }[]; ai?: { used: number; total: number; rejected?: number; error?: string }; error?: string };
  const [panel, setPanel] = useState<null | { stage: "confirm" | "running" | "done"; step: number; out?: RunOut; ok?: boolean }>(null);
  async function runNow() {
    setPanel({ stage: "running", step: 0 });
    let step = 0;
    const tick = window.setInterval(() => { step = Math.min(step + 1, 2); setPanel((p) => (p && p.stage === "running" ? { ...p, step } : p)); }, 1100);
    setBusy("run");
    const t0 = Date.now();
    const r = await api("/api/runs", { runDate: RUN_DATE });
    await new Promise((ok) => window.setTimeout(ok, Math.max(0, 2600 - (Date.now() - t0)))); // let each step be seen
    window.clearInterval(tick); setBusy(null);
    setPanel({ stage: "done", step: 3, out: r.out, ok: r.ok || r.status === 422 });
    await load(); loadInteg();
  }
  async function decide(r: Rec, decision: string, qty: number | null, note = "") {
    if (!who.trim()) { say("Add your name at the top first. It's saved with every decision."); return false; }
    const res = await api(`/api/runs/${data!.run.id}/decisions`, { sku: r.sku, decision, qty, note, decidedBy: who });
    if (!res.ok) { say(res.out.error ?? "Could not save."); return false; }
    setLeaving(r.sku);
    window.setTimeout(async () => {
      setLeaving(null); await load();
      const next = need.find((x) => !decs[x.sku] && x.sku !== r.sku);
      if (next) setSel(next.sku);
    }, 320);
    return true;
  }
  async function undo(r: Rec) { await api(`/api/runs/${data!.run.id}/decisions?sku=${encodeURIComponent(r.sku)}`, undefined, "DELETE"); load(); }
  async function send() {
    if (!who.trim()) { say("Add your name at the top first."); return; }
    setBusy("send"); const r = await api(`/api/runs/${data!.run.id}/handoff`, { sentBy: who }); setBusy(null);
    if (!r.ok) { say(r.out.error ?? "Could not send."); return; }
    say(`Sent to procurement: ${r.out.lineCount} lines, ${fmt(r.out.totalUnits)} units.`); load();
  }
  async function zohoDrafts() {
    if (!who.trim()) { say("Add your name at the top first."); return; }
    setBusy("zoho"); const r = await api(`/api/runs/${data!.run.id}/zoho`, { createdBy: who }); setBusy(null);
    if (!r.ok && !r.out.results) { say(r.out.error ?? "Zoho did not answer."); return; }
    const n = (r.out.results ?? []).filter((x: { status: string }) => x.status === "draft").length;
    say(n ? `Created ${n} draft PO${n > 1 ? "s" : ""} in Zoho. Procurement issues them there.` : "No draft POs were created. See the order timeline for why.");
    load();
  }
  async function explain() {
    setBusy("ai"); const r = await api(`/api/runs/${data!.run.id}/explain`); setBusy(null);
    say(r.ok ? `Gemini wrote ${r.out.used} of ${r.out.total} reasons${r.out.rejected ? `; ${r.out.rejected} failed the number check and kept the rule wording` : ""}.` : `Gemini is unavailable: ${r.out.error ?? r.status}`);
    load();
  }
  async function test(target: "ai" | "zoho") {
    setBusy("t-" + target); const r = await api("/api/integrations", { target }); setBusy(null);
    say(r.out.ok ? `${target === "ai" ? "Gemini" : "Zoho"} answered in ${r.out.ms} ms.` : `${target === "ai" ? "Gemini" : "Zoho"} test failed: ${r.out.error}`);
  }

  // ---------- header ----------
  const header = (
    <header className="hdr glide">
      <div className="hello">
        <span className="avatar" aria-hidden="true">{(who.trim() || "?").slice(0, 1).toUpperCase()}</span>
        <div><small>{new Date().getHours() < 12 ? "Good morning," : "Good afternoon,"}</small>
          <label className="vh" htmlFor="who">Your name</label>
          <input id="who" value={who} placeholder="Add your name" onChange={(e) => { setWho(e.target.value); try { localStorage.setItem("fr-who", e.target.value); } catch { /* ignore */ } }} />
        </div>
      </div>
      <div className="icons">
        {data && <span className="datechip"><Icon name="cal" /> Run <b>{new Date(data.run.run_date.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</b></span>}
        <button className="rbtn" aria-label="Connections" onClick={() => { setView("connections"); loadInteg(); }}><Icon name="bell" />{integ && (!integ.zoho.configured || !integ.ai.configured) && <span className="badge" />}</button>
      </div>
    </header>
  );

  const nav = (
    <nav className="nav" aria-label="Main">
      <button aria-current={view === "home" ? "page" : undefined} onClick={() => setView("home")}><Icon name="home" />Home</button>
      <button aria-current={view === "queue" ? "page" : undefined} onClick={() => setView("queue")}><Icon name="queue" />Queue</button>
      <button className={`fab${busy === "run" ? " busy" : ""}`} aria-label="Run the planner" onClick={() => setPanel({ stage: "confirm", step: 0 })} disabled={busy === "run"}><Icon name="run" /></button>
      <button aria-current={view === "orders" ? "page" : undefined} onClick={() => setView("orders")}><Icon name="orders" />Orders</button>
      <button aria-current={view === "insights" ? "page" : undefined} onClick={() => setView("insights")}><Icon name="insights" />Insights</button>
    </nav>
  );

  const runSteps = [
    { t: "Sync open orders from Zoho", d: integ?.zoho.configured ? "Purchase orders still awaiting stock" : "Zoho not connected; uses last known orders" },
    { t: "Apply Raghav's 5 rules", d: "Cover, trend, festival uplift, perishable window" },
    { t: "Write the reasons", d: integ?.ai.configured ? "Gemini explains; every number is checked" : "Rule wording (no AI key)" },
  ];
  const po = panel?.out;
  const zohoWarn = po?.issues?.find((i) => /zoho/i.test(i.message));
  const runPanel = panel && (
    <div className="scrim" onClick={() => panel.stage !== "running" && setPanel(null)}>
      <section className="card runpanel" role="dialog" aria-modal="true" aria-label="Run the planner" onClick={(e) => e.stopPropagation()}>
        <span className="grabber" aria-hidden="true" />
        {panel.stage === "confirm" && <>
          <div className="eyebrow">Planning run · {new Date(RUN_DATE + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}</div>
          <h2 className="rp-h">Run the planner <em>now?</em></h2>
          <p className="sub">Runs also start on their own every Monday and Thursday at 06:00 IST.</p>
          <ol className="rp-steps">{runSteps.map((s, i) => <li key={i}><span className="dot">{i + 1}</span><div><b>{s.t}</b><small>{s.d}</small></div></li>)}</ol>
          {data && done > 0 && !sent && <p className="rp-warn">This starts a fresh queue. Your {done} decision{done > 1 ? "s" : ""} on the current run stay saved there but won&apos;t carry over.</p>}
          <div className="rp-actions"><button className="pill black" onClick={runNow}>Start run</button><button className="pill outline" onClick={() => setPanel(null)}>Cancel</button></div>
        </>}
        {panel.stage === "running" && <>
          <div className="eyebrow">Running…</div>
          <h2 className="rp-h">Planning <em>15 SKUs</em></h2>
          <ol className="rp-steps live">{runSteps.map((s, i) => <li key={i} className={i < panel.step ? "ok" : i === panel.step ? "now" : ""}><span className="dot">{i < panel.step ? "✓" : i + 1}</span><div><b>{s.t}</b><small>{s.d}</small></div></li>)}</ol>
        </>}
        {panel.stage === "done" && <>
          <div className="eyebrow">{panel.ok ? (po?.blocked ? "Run stopped" : "Run ready") : "Run failed"}</div>
          <h2 className="rp-h">{!panel.ok ? <>Something <em>went wrong.</em></> : po?.blocked ? <>Stopped on a <em>data gap.</em></> : <><CountUp value={["reorder_now", "reorder", "pause", "exception"].reduce((a, k) => a + (po?.counts?.[k] ?? 0), 0)} /> lines <em>to decide.</em></>}</h2>
          {!panel.ok && <p className="err">{po?.error ?? "The server did not answer."}</p>}
          {panel.ok && !po?.blocked && <div className="rp-counts">
            <span style={{ ["--c" as string]: "var(--orange-soft)" }}><b>{po?.counts?.reorder_now ?? 0}</b>Reorder now</span>
            <span style={{ ["--c" as string]: "var(--lime)" }}><b>{po?.counts?.reorder ?? 0}</b>Reorder</span>
            <span style={{ ["--c" as string]: "var(--lavender)" }}><b>{po?.counts?.pause ?? 0}</b>Pause</span>
            <span style={{ ["--c" as string]: "var(--sage)" }}><b>{po?.counts?.ok ?? 0}</b>In window</span>
          </div>}
          {panel.ok && <ol className="rp-steps">
            <li className={zohoWarn ? "warn" : "ok"}><span className="dot">{zohoWarn ? "!" : "✓"}</span><div><b>Zoho</b><small>{zohoWarn ? zohoWarn.message : integ?.zoho.configured ? "Open orders synced" : "Not connected"}</small></div></li>
            <li className={po?.blocked ? "warn" : "ok"}><span className="dot">{po?.blocked ? "!" : "✓"}</span><div><b>Rules</b><small>{po?.blocked ? (po.issues ?? []).map((i) => i.message).join(" ") : "Applied to every SKU"}</small></div></li>
            <li className={po?.ai?.error && integ?.ai.configured ? "warn" : "ok"}><span className="dot">{po?.ai?.error && integ?.ai.configured ? "!" : "✓"}</span><div><b>Reasons</b><small>{!integ?.ai.configured ? "Rule wording (no AI key)" : po?.ai?.error ? "AI unavailable, rule wording used" : po?.ai?.used ? `Gemini wrote ${po.ai.used} of ${po.ai.total}, all numbers checked` : "Rule wording"}</small></div></li>
          </ol>}
          <div className="rp-actions">
            {panel.ok && !po?.blocked && <button className="pill black" onClick={() => { setPanel(null); setView("queue"); setFilter("todo"); }}>Review the queue</button>}
            <button className="pill outline" onClick={() => { setPanel(null); if (po?.blocked) setView("home"); }}>Close</button>
          </div>
        </>}
      </section>
    </div>
  );

  const shell = (body: React.ReactNode) => (
    <div className="app">{header}{body}{nav}{panel && runPanel}{toast && <div className="toast" role="status">{toast}</div>}</div>
  );

  if (view === "connections") return shell(<Connections integ={integ} busy={busy} test={test} />);
  if (state === "loading") return shell(<p className="sub">Loading the latest run…</p>);
  if (state === "error") return shell(<div className="banner orange"><span className="bi">!</span><span className="grow1">{errMsg}</span></div>);
  if (state === "none" || !data) return shell(
    <section className="card empty glide">
      <div className="field" style={{ width: "100%", maxWidth: 520 }} />
      <h1 className="headline">Nothing to plan <em>yet.</em></h1>
      <p className="sub">The planner hasn't run on this database. Start the first run for 22 Oct 2026: it reads SAP sales and stock, open POs from Zoho if connected, and applies Raghav's five rules.</p>
      <button className="pill primary" onClick={runNow}>{busy === "run" ? "Running…" : "Run the planner"}</button>
    </section>,
  );

  const runDay = new Date(data.run.run_date.slice(0, 10) + "T00:00:00");
  const blocked = data.run.status === "blocked";

  // ---------- HOME ----------
  if (view === "home") {
    const units = recs.filter((r) => r.status === "reorder_now" || r.status === "reorder").reduce((a, r) => a + (r.recommendedQty ?? 0), 0);
    const low = recs.filter((r) => r.coverWeeks != null).sort((a, b) => a.coverWeeks! - b.coverWeeks!)[0];
    const monday = new Date(runDay); monday.setDate(runDay.getDate() - ((runDay.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
    return shell(<>
      <div className="glide" style={{ ["--i" as string]: 1 }}>
        <h1 className="headline">Fresh stock. Smarter orders. <em>Fewer stockouts.</em></h1>
        <p className="sub">{data.run.summary ?? `${need.length} of ${recs.length} SKUs need a decision in this run.`}{data.run.summary_source === "gemini" && <> <span className="chip lime"><Icon name="spark" /> Gemini</span></>}</p>
      </div>
      {blocked && <div className="banner orange glide"><span className="bi">!</span><span className="grow1">{data.run.issues.map((i) => i.message).join(" ")}</span></div>}
      <div className="grid g-hero">
        <section className="card hero glide" style={{ ["--i" as string]: 2 }}>
          <span className="chip">{runDay.toLocaleDateString("en-IN", { weekday: "long" })} run · {runDay.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
          <h2>{sent ? "Sent to procurement" : need.length - done ? `${need.length - done} lines to decide` : "Ready to send"}</h2>
          <p>Sales to week {isoWeek(data.run.last_complete_week.slice(0, 10))}, stock as of {String(data.run.stock_as_of).slice(0, 10)}{data.run.festival ? ", festival uplift +25% on" : ""}.</p>
          <Arc p={need.length ? done / need.length : 1} />
          <span className="arcval"><CountUp value={need.length ? Math.round((done / need.length) * 100) : 100} /><small>%</small></span>
          <div className="actions"><button className="pill limep" onClick={() => setView(sent ? "orders" : "queue")}>{sent ? "Track the order" : "Continue"} <Icon name="arrow" /></button></div>
        </section>
        <section className="card glide" style={{ ["--i" as string]: 3 }}>
          <div className="ringcard">
            <div className="side"><span className="g" style={{ background: "var(--orange-soft)", color: "#A2400B" }}>↑</span><b><CountUp value={count("reorder_now")} /></b><span>Reorder now</span></div>
            <Ring value={done} total={need.length || 1}><div><b><CountUp value={need.length - done} /></b><span>to decide</span></div></Ring>
            <div className="side"><span className="g" style={{ background: "var(--lavender)", color: "#4A3F86" }}>‖</span><b><CountUp value={count("pause")} /></b><span>Pause</span></div>
          </div>
          <div className="minibars">
            {([["Approved", need.filter((r) => decs[r.sku] && decs[r.sku].decision !== "rejected").length, "var(--lime-2)"], ["Edited", need.filter((r) => decs[r.sku]?.decision === "edited").length, "var(--butter)"], ["Rejected", need.filter((r) => decs[r.sku]?.decision === "rejected").length, "var(--orange)"]] as const).map(([l, n, c]) => (
              <div key={l}><span>{l}</span><div className="track"><i style={{ width: `${need.length ? (n / need.length) * 100 : 0}%`, ["--c" as string]: c }} /></div><b>{n} of {need.length}</b></div>
            ))}
          </div>
        </section>
      </div>
      <div className="grid g-3">
        {[
          { l: "Units to order", ic: "box", v: units, u: "units", bars: recs.filter((r) => r.recommendedQty).map((r) => r.recommendedQty!), c: "var(--lime-2)" },
          { l: "Shortest runway", ic: "clock", v: low?.coverWeeks ?? 0, u: `wk · ${low ? short(low.name) : ""}`, bars: recs.filter((r) => r.coverWeeks != null).map((r) => r.coverWeeks!).sort((a, b) => a - b), c: "var(--orange-2)", d: 1 },
          { l: data.run.festival ? "Festival month" : "Normal month", ic: "flame", v: data.run.festival ? 25 : 0, u: "% demand uplift", bars: [3, 4, 5, 7, 9, 12, 14, 18], c: "var(--butter)" },
        ].map((s, k) => (
          <section key={s.l} className="card stat glide" style={{ ["--i" as string]: 4 + k }}>
            <span className="lbl"><span className="ic"><Icon name={s.ic} /></span>{s.l}</span>
            <span className="big"><CountUp value={s.v} decimals={s.d ?? 0} /><small>{s.u}</small></span>
            <span className="bars" aria-hidden="true">{s.bars.slice(0, 14).map((b, i, a) => <i key={i} style={{ height: `${(b / Math.max(...a)) * 100}%`, ["--c" as string]: s.c, ["--k" as string]: i }} />)}</span>
          </section>
        ))}
      </div>
      <div className="grid g-2">
        <section className="glide" style={{ ["--i" as string]: 7 }}>
          <div className="tiers">
            {([["reorder_now", "var(--orange-2)"], ["reorder", "var(--lime)"], ["pause", "var(--lavender)"], ["ok", "var(--sage)"]] as const).map(([s, c]) => (
              <button key={s} className="tier" style={{ ["--c" as string]: c }} onClick={() => { setFilter(s); setView("queue"); }}>
                <span><b>{STATUS[s].glyph} {STATUS[s].label}</b><small>{recs.filter((r) => r.status === s).map((r) => short(r.name)).slice(0, 3).join(" · ") || "None this run"}</small></span>
                <span className="n">{count(s)}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="card glide" style={{ ["--i" as string]: 8, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="ctitle"><h3>This week</h3><span className="muted">Runs Mon + Thu, 06:00 IST</span></div>
          <div className="week">
            {days.map((d) => { const run = d.getDay() === 1 || d.getDay() === 4; const today = d.toDateString() === runDay.toDateString();
              return <div key={+d} className={`day${run ? " run" : ""}${today ? " today" : ""}`}>{d.toLocaleDateString("en-IN", { weekday: "narrow" })}<b>{d.getDate()}</b>{run && <span className="dot" />}</div>; })}
          </div>
          {integ && !integ.zoho.configured && <div className="banner butter"><span className="bi">Z</span><span className="grow1">Zoho isn't connected, so cover assumes nothing is on order.</span><button className="linkbtn" onClick={() => setView("connections")}>Connect</button></div>}
          {integ && integ.ai.configured && <div className="banner"><span className="bi"><Icon name="spark" /></span><span className="grow1">Gemini writes the reasons. Every number is checked against the rules.</span></div>}
          {integ && !integ.ai.configured && <div className="banner butter"><span className="bi">✦</span><span className="grow1">No AI key, so reasons use the rule wording.</span><button className="linkbtn" onClick={() => setView("connections")}>Set up</button></div>}
        </section>
      </div>
    </>);
  }

  // ---------- QUEUE ----------
  if (view === "queue") {
    const list = filter === "todo" ? need : filter === "all" ? recs : recs.filter((r) => r.status === filter);
    const cur = recs.find((r) => r.sku === sel) ?? (wide ? list[0] : undefined);
    const f = (k: typeof filter, l: string, n: number) => <button key={k} className="fpill" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} <b>{n}</b></button>;
    return shell(<>
      <div className="glide"><h1 className="headline">Decide the <em>{need.length - done} left.</em></h1></div>
      <div className="grid g-queue">
        <section>
          <div className="filters">{[f("todo", "To decide", need.length), f("reorder_now", "Reorder now", count("reorder_now")), f("reorder", "Reorder", count("reorder")), f("pause", "Pause", count("pause")), f("ok", "In window", count("ok")), f("all", "All", recs.length)]}</div>
          <div className="rows">
            {list.length === 0 && <div className="card empty"><div className="field" style={{ width: "100%" }} /><p className="sub">Nothing in this view.</p></div>}
            {list.map((r, k) => { const d = decs[r.sku]; const di = dist[r.sku];
              return (
                <button key={r.sku} className={`prow glide${leaving === r.sku ? " leaving" : ""}`} style={{ ["--i" as string]: k }} aria-current={cur?.sku === r.sku} onClick={() => setSel(r.sku)}>
                  <ProductTile category={r.category} />
                  <span style={{ minWidth: 0 }}>
                    <div className="pname">{short(r.name)}</div>
                    <div className="pmeta">{r.category} • {di?.name ?? "—"}{r.perishable ? " • perishable" : ""}</div>
                    <div style={{ marginTop: 6 }}><StatusChip s={r.status} /></div>
                  </span>
                  <span className="pqty"><b>{d && d.decision !== "rejected" ? fmt(d.final_qty) : r.status === "pause" ? "0" : fmt(r.recommendedQty)}</b><small>{r.coverWeeks ?? "—"} wk cover</small></span>
                  <span className={`act${!needs(r) ? " none" : d ? (d.decision === "rejected" ? " rej" : " done") : ""}`} aria-label={!needs(r) ? "No action" : d ? d.decision : "To decide"}>{!needs(r) ? "✓" : d ? (d.decision === "rejected" ? "×" : "✓") : "+"}</span>
                </button>
              ); })}
          </div>
        </section>
        {cur && <Sheet key={cur.sku} r={cur} d={decs[cur.sku]} di={dist[cur.sku]} data={data} sent={sent} busy={busy} onDecide={decide} onUndo={undo} onExplain={explain} aiOn={Boolean(integ?.ai.configured)} onClose={() => setSel(null)} />}
      </div>
    </>);
  }

  // ---------- ORDERS ----------
  if (view === "orders") {
    const lines = recs.filter((r) => decs[r.sku] && decs[r.sku].decision !== "rejected");
    const buy = lines.filter((r) => (decs[r.sku].final_qty ?? 0) > 0);
    const units = buy.reduce((a, r) => a + (decs[r.sku].final_qty ?? 0), 0);
    const left = need.length - done;
    const drafts = data.zohoPos.filter((z) => z.status === "draft");
    const steps = [
      { t: time(data.run.created_at), b: "Planned", s: `${recs.length} SKUs checked against the 5 rules`, st: "done" },
      { t: left ? "" : "", b: "Decided", s: left ? `${left} of ${need.length} still to decide` : `${done} decisions by ${[...new Set(data.decisions.map((x) => x.decided_by))].join(", ")}`, st: left ? "now" : "done" },
      { t: time(data.run.sent_at), b: "Sent to procurement", s: sent ? `${buy.length} reorder lines · ${fmt(units)} units` : "Waiting for every decision", st: sent ? "done" : left ? "next" : "now" },
      { t: drafts[0] ? time(drafts[0].created_at) : "", b: "Draft POs in Zoho", s: drafts.length ? drafts.map((z) => `${z.zoho_po_number ?? "draft"} · ${z.vendor_name}`).join(" | ") : integ?.zoho.configured ? "Create them after sending" : "Zoho not connected", st: drafts.length ? "done" : sent ? "now" : "next" },
      { t: "", b: "Issued in Zoho", s: "Procurement reviews and issues each PO in Zoho", st: drafts.length ? "now" : "next" },
    ];
    return shell(<>
      <div className="glide"><h1 className="headline">From approval <em>to purchase order.</em></h1></div>
      <div className="grid g-2">
        <section className="card glide" style={{ ["--i" as string]: 1 }}>
          <div className="ctitle"><h3>Hand-off</h3><span className="chip lime mono">{buy.length} lines · {fmt(units)} units</span></div>
          {lines.length ? (
            <table><thead><tr><th>SKU</th><th>Action</th><th className="num">Qty</th><th>Distributor</th></tr></thead>
              <tbody>{lines.map((r) => <tr key={r.sku}><td>{short(r.name)}</td><td>{(decs[r.sku].final_qty ?? 0) > 0 ? "Reorder" : "Pause"}</td><td className="num mono">{fmt(decs[r.sku].final_qty)}</td><td>{dist[r.sku]?.name}</td></tr>)}</tbody></table>
          ) : <p className="sub">Approved lines collect here.</p>}
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="pill primary" disabled={sent || left > 0 || !lines.length || busy === "send"} onClick={send}>{sent ? "Sent" : busy === "send" ? "Sending…" : "Send to procurement"}</button>
            {sent && <a className="pill outline sm" href={`/api/runs/${data.run.id}/handoff`}>Download CSV</a>}
            {sent && <button className="pill limep sm" disabled={!integ?.zoho.configured || drafts.length > 0 || busy === "zoho"} onClick={zohoDrafts}>{busy === "zoho" ? "Creating…" : drafts.length ? "Drafts created" : "Create draft POs in Zoho"}</button>}
          </div>
          {!sent && left > 0 && <p className="sub" style={{ marginTop: 10 }}>{left} line{left > 1 ? "s" : ""} still to decide before sending.</p>}
          {sent && !integ?.zoho.configured && <div className="banner butter" style={{ marginTop: 12 }}><span className="bi">Z</span><span className="grow1">Connect Zoho to turn this list into draft POs.</span><button className="linkbtn" onClick={() => setView("connections")}>How</button></div>}
        </section>
        <section className="card glide" style={{ ["--i" as string]: 2 }}>
          <div className="ctitle"><h3>Order timeline</h3><span className="muted">{runDay.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} run</span></div>
          <ol className="tl">{steps.map((s) => <li key={s.b} className={s.st}><span className="t">{s.t}</span><span className="node"><i>{s.st === "done" ? "✓" : ""}</i></span><span><b>{s.b}</b><small>{s.s}</small></span></li>)}</ol>
          {data.zohoPos.filter((z) => z.error).map((z) => <div key={z.vendor_name} className="banner orange" style={{ marginTop: 8 }}><span className="bi">!</span><span className="grow1"><b>{z.vendor_name}:</b> {z.error}</span></div>)}
        </section>
      </div>
    </>);
  }

  // ---------- INSIGHTS ----------
  const weeks = recs[0]?.trend.length ?? 0;
  const lastW = isoWeek(data.run.last_complete_week.slice(0, 10));
  const labels = Array.from({ length: weeks }, (_, i) => `W${lastW - weeks + 1 + i}`);
  const totals = Array.from({ length: weeks }, (_, i) => recs.reduce((a, r) => a + (r.trend[i] ?? 0), 0));
  const movers = [...recs].filter((r) => r.avg12 > 0).map((r) => ({ r, pct: Math.round((r.avg4 / r.avg12 - 1) * 100) })).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 6);
  const inWin = count("ok");
  return shell(<>
    <div className="glide"><h1 className="headline">Track demand. <em>Order with confidence.</em></h1></div>
    <div className="grid g-hero">
      <section className="card glide" style={{ ["--i" as string]: 1 }}>
        <div className="ctitle"><h3>All SKUs · units sold per week</h3><span className="chip mono">{labels[0]}–{labels[labels.length - 1]}</span></div>
        <Bars values={totals} labels={labels} avg={Math.round(totals.slice(-12).reduce((a, b) => a + b, 0) / 12)} />
      </section>
      <section className="card glide" style={{ ["--i" as string]: 2, display: "grid", placeItems: "center", gap: 10 }}>
        <Ring value={inWin} total={recs.length || 1} size={200}><div><b><CountUp value={inWin} /></b><span>of {recs.length} in window</span></div></Ring>
        <p className="sub" style={{ textAlign: "center" }}>SKUs whose stock already sits inside the reorder window.</p>
      </section>
    </div>
    <section className="card glide" style={{ ["--i" as string]: 3 }}>
      <div className="ctitle"><h3>Biggest movers · last 4 weeks vs 12-week average</h3></div>
      <div className="rows" style={{ marginTop: 0 }}>
        {movers.map(({ r, pct }) => (
          <button key={r.sku} className="prow" onClick={() => { setSel(r.sku); setFilter("all"); setView("queue"); }}>
            <ProductTile category={r.category} />
            <span style={{ minWidth: 0 }}><div className="pname">{short(r.name)}</div><div className="pmeta">{fmt(r.avg4)} vs {fmt(r.avg12)} units / week</div></span>
            <span className="pqty"><b style={{ color: pct >= 0 ? "var(--forest-2)" : "#B34A0F" }}>{pct >= 0 ? "+" : ""}{pct}%</b><small>{pct >= 0 ? "rising" : "falling"}</small></span>
            <span className="act">{pct >= 0 ? "↗" : "↘"}</span>
          </button>
        ))}
      </div>
    </section>
  </>);
}

// ---------- SKU SHEET ----------
function Sheet({ r, d, di, data, sent, busy, onDecide, onUndo, onExplain, aiOn, onClose }: {
  r: Rec; d?: Dec; di?: { name: string | null; region: string | null; uom: string | null }; data: RunData; sent: boolean; busy: string | null; aiOn: boolean;
  onDecide: (r: Rec, decision: string, qty: number | null, note?: string) => Promise<boolean>; onUndo: (r: Rec) => void; onExplain: () => void; onClose: () => void;
}) {
  const tabs = ["Overview", "Trend", "Rules", "Notes"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [mode, setMode] = useState<null | "edit" | "reject">(null);
  const [qty, setQty] = useState(r.recommendedQty ?? r.suggestedQty ?? r.standardQty);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const pct = r.avg12 > 0 ? Math.round((r.avg4 / r.avg12 - 1) * 100) : 0;
  const lastW = isoWeek(data.run.last_complete_week.slice(0, 10));
  const labels = r.trend.map((_, i) => `W${lastW - r.trend.length + 1 + i}`);
  const on = (k: string) => r.rules.includes(k as never);
  async function save() {
    if (!note.trim()) { setErr(mode === "reject" ? "Add a reason for rejecting." : "Add a reason for changing the quantity."); return; }
    if (mode === "reject") { if (await onDecide(r, "rejected", null, note)) setMode(null); return; }
    if (await onDecide(r, qty === r.recommendedQty ? "approved" : r.status === "exception" ? "decided" : "edited", qty, note)) setMode(null);
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLTextAreaElement)) onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <aside className="card sheet" aria-label={`${r.name} details`}>
      <span className="grabber" aria-hidden="true" />
      <div className="shead">
        <ProductTile category={r.category} big />
        <div style={{ minWidth: 0 }}><StatusChip s={r.status} /><h2>{short(r.name)}</h2><div className="pmeta">{r.sku} · {r.category} · {di?.name ?? "—"}{di?.region ? `, ${di.region}` : ""}</div></div>
        <button className="rbtn close" aria-label="Close details" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="seg" role="tablist">
        <span className="ind" style={{ transform: `translateX(${tabs.indexOf(tab) * 100}%)` }} />
        {tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "Overview" && <>
        <div className="why">{r.reason}
          <div className="src">{r.reasonSource === "gemini" ? <><span className="chip lime"><Icon name="spark" /> Gemini</span> every number checked against the rules</> : <><span className="chip">Rule template</span>{aiOn && <button className="linkbtn" disabled={busy === "ai"} onClick={onExplain}>{busy === "ai" ? "Asking Gemini…" : "✦ Rewrite with Gemini"}</button>}</>}</div>
        </div>
        <Runway r={r} />
        <div className="metrics">
          {([["box", "On hand", fmt(r.onHand), "units"], ["flame", "Demand / wk", fmt(r.demand), ""], ["clock", "Cover", r.coverWeeks ?? "—", "wk"], ["stack", "Std qty", fmt(r.standardQty), ""]] as const).map(([ic, l, v, u]) => (
            <div key={l} className="metric"><span className="mi"><Icon name={ic} /></span><span>{l}</span><b>{v}<small>{u}</small></b></div>
          ))}
        </div>
        {needs(r) && (sent ? <div className="banner"><span className="bi">✓</span><span className="grow1">Sent to procurement. Decisions are locked.</span></div>
          : d && !mode ? (
            <div className="banner"><span className="bi">{d.decision === "rejected" ? "×" : "✓"}</span><span className="grow1"><b>{d.decision === "rejected" ? "Rejected" : d.final_qty === 0 ? "Pause approved" : `${d.decision === "edited" ? "Edited to" : "Approved:"} ${fmt(d.final_qty)} units`}</b> by {d.decided_by}{d.note ? ` · “${d.note}”` : ""}</span><button className="linkbtn" onClick={() => onUndo(r)}>Undo</button></div>
          ) : mode ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {mode === "edit" && <Ruler value={qty} onChange={setQty} max={Math.max(r.standardQty * 3, (r.recommendedQty ?? 0) * 2, 200)} was={r.recommendedQty} />}
              <label className="vh" htmlFor="note">Reason</label>
              <input id="note" className="note-in" value={note} onChange={(e) => { setNote(e.target.value); setErr(""); }} placeholder={mode === "reject" ? "Why reject? e.g. distributor still has scheme stock" : "Why this quantity? e.g. truck holds 600 units"} />
              {err && <span className="err" role="alert">{err}</span>}
              <div className="actions"><button className={`pill ${mode === "reject" ? "danger" : "primary"}`} onClick={save}>{mode === "reject" ? "Reject line" : `Save ${fmt(qty)} units`}</button><button className="pill outline sm" onClick={() => { setMode(null); setErr(""); }}>Cancel</button></div>
            </div>
          ) : (
            <div className="actions">
              {r.status === "exception"
                ? <button className="pill primary wide" onClick={() => setMode("edit")}>Decide quantity</button>
                : <button className="pill black" style={{ flex: 1 }} onClick={() => onDecide(r, "approved", r.recommendedQty)}>{r.status === "pause" ? "Approve pause" : `Approve ${fmt(r.recommendedQty)} units`}</button>}
              <button className="pill outline" onClick={() => setMode("edit")}>Edit qty</button>
              <button className="pill danger" onClick={() => setMode("reject")}>Reject</button>
            </div>
          ))}
      </>}

      {tab === "Trend" && <>
        <Bars values={r.trend} labels={labels} avg={r.avg12} fest={r.festival ? r.demand : undefined} />
        <div className="metrics">
          <div className="metric"><span>Last 4 wk avg</span><b>{fmt(r.avg4)}</b></div>
          <div className="metric"><span>12 wk avg</span><b>{fmt(r.avg12)}</b></div>
          <div className="metric"><span>Change</span><b style={{ color: pct >= 0 ? "var(--forest-2)" : "#B34A0F" }}>{pct >= 0 ? "+" : ""}{pct}%</b></div>
          <div className="metric"><span>Used for cover</span><b>{fmt(r.demand)}</b></div>
        </div>
      </>}

      {tab === "Rules" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          ["R1", "Demand up more than 20%", `Last 4 weeks ${pct >= 0 ? "+" : ""}${pct}% vs the 12-week average`, on("R1_high_demand")],
          ["R2", `Cover below ${r.window.min} weeks`, `Stock + open POs cover ${r.coverWeeks ?? "—"} weeks`, on("R2_stockout_risk")],
          ["R3", `Cover above ${r.window.max} weeks`, "Pause the next order", on("R3_overstock_risk")],
          ["R4", "Festival uplift", r.festival ? "+25% applied to demand before the checks" : "Not a festival month", r.festival],
          ["R5", "Perishable window", r.perishable ? "3–4 weeks instead of 6–14" : "Standard 6–14 week window", r.perishable],
        ].map(([id, t, s, active]) => (
          <div key={id as string} className="rule"><span className={`ri ${active ? "on" : "off"}`}>{active ? "✓" : "–"}</span><span><b>{id} · {t}</b><small>{s}</small></span><span className={`chip ${active ? "lime" : ""}`}>{active ? "fired" : "no"}</span></div>
        ))}
      </div>}

      {tab === "Notes" && <div className="why" style={{ background: "var(--card)", boxShadow: "inset 0 0 0 1px var(--sage)" }}>
        {d ? <><b>{d.decision}</b> by {d.decided_by} · {time(d.decided_at)}<br />{d.note || "No note (approved as recommended)."}</> : "No decision yet."}
        {r.exceptionReasons.length > 0 && <p className="sub" style={{ marginTop: 10 }}>{r.exceptionReasons.join(" ")}</p>}
      </div>}
    </aside>
  );
}

// ---------- CONNECTIONS ----------
function Connections({ integ, busy, test }: { integ: Integrations | null; busy: string | null; test: (t: "ai" | "zoho") => void }) {
  const cards = [
    { k: "N", t: "Neon Postgres", on: integ?.neon.ok, d: integ?.neon.ok ? `Connected · ${integ.neon.host}` : integ?.neon.error ?? "Checking…", what: "Stores runs, recommendations, decisions and hand-offs." },
    { k: "✦", t: "Gemini via OpenRouter", on: integ?.ai.configured, d: integ?.ai.configured ? `${integ.ai.provider} · ${integ.ai.model}` : "No key set", what: "Writes the one-line reason per SKU and the run summary. The rules still decide every quantity.", test: "ai" as const },
    { k: "Z", t: "Zoho Inventory", on: integ?.zoho.configured, d: integ?.zoho.configured ? `Region .${integ.zoho.dc} · ${integ.zoho.openPoLines} open PO lines synced` : "Not connected · run setup-zoho.sh on your Mac", what: "Reads open purchase orders before each run, and creates draft POs from the approved list. Procurement issues them in Zoho.", test: "zoho" as const },
    { k: "⏱", t: "Vercel Cron", on: integ?.cron.configured, d: integ?.cron.schedule ?? "", what: "Starts a planning run every Monday and Thursday morning." },
  ];
  return (<>
    <div className="glide"><h1 className="headline">Connections, <em>at a glance.</em></h1></div>
    <div className="grid g-2">
      {cards.map((c, i) => (
        <section key={c.t} className="card conn glide" style={{ ["--i" as string]: i }}>
          <div className="cl"><span className="logo" style={{ background: c.on ? "var(--lime)" : "var(--sage)" }}>{c.k}</span><div><h3>{c.t}</h3><span className={`chip ${c.on ? "lime" : "orange"}`}>{c.on ? "● Connected" : "○ Not connected"}</span></div></div>
          <p className="sub">{c.what}</p>
          <p className="sub mono" style={{ fontSize: 12.5 }}>{c.d}</p>
          {c.test && c.on && <div className="actions"><button className="pill outline sm" disabled={busy === "t-" + c.test} onClick={() => test(c.test!)}>{busy === "t-" + c.test ? "Testing…" : "Test connection"}</button></div>}
        </section>
      ))}
    </div>
  </>);
}
