# Freshroots demand planner: project rules

Read this at the start of every session.

## What this is
A twice-weekly reorder planner for Freshroots (FMCG, 400 SKUs, 1,200 distributors). It applies Raghav Kulkarni's five rules to SAP sales and stock plus open POs from Zoho, then puts every recommendation in front of Raghav for approval. Procurement receives only the lines he approved and raises the POs in Zoho themselves.

## Non-negotiables
1. **The rules engine decides every quantity.** `src/engine/engine.ts` is pure and deterministic. Do not call an LLM inside it, and do not let anything outside it change a quantity.
2. **The LLM only explains.** One batched call per run (`lib/ai.ts`, called from `explainRun` in `lib/planner.ts`). Every number it writes is checked by `validateReason`; anything that fails falls back to the template reason. Never remove that check.
3. **No automatic POs.** The app never issues a PO. It reads open POs from Zoho Inventory and, after Raghav's hand-off, may create DRAFT POs only (`lib/zoho.ts`); procurement issues them in Zoho. Never call mark-as-issued/approve endpoints. Nothing is written to SAP.
4. **Exceptions go to Raghav with no quantity**: new launches, distributor swings, rules that disagree.
5. **Every edit or rejection needs a note.** The database enforces this; keep the UI consistent with it.
6. **A run with a missing week stops.** Never plan on a data gap.

## Layout
- `src/engine/`: types, rules engine, explanation prompt and validator. Unit tests in `tests/`.
- `src/io/csv.ts`: file adapters for the SAP and Zoho exports.
- `src/pipeline/claude.ts`: the single Claude API call.
- `scripts/run.ts`: one full run from files. `scripts/backtest.ts`: replay past weeks.
- `db/migrations/`: Neon Postgres schema (apply with `npm run db:migrate`, direct URL).
- `app/`, `lib/`: Next.js app. `lib/db.ts` uses `pg` + `attachDatabasePool` (Neon's guidance for Vercel Fluid compute).
- `prototype/`: the clickable review queue, running the same engine in the browser.
- `data/sample/`: **synthetic** data. Never present these numbers as Freshroots figures.

## Commands
- `npm test`: engine tests (must stay green)
- `npm run typecheck`
- `npm run sample`: regenerate synthetic data
- `npm run plan`: run the pipeline on sample data
- `npm run prototype`: rebuild `prototype/review-queue.html`

## Keys
Keys live in `.env.local` locally and in Vercel environment variables, nowhere else. `.env*` is in `.gitignore`. If a key leaks, rotate it.

## Stack
Next.js on Vercel (cron Mon and Thu 06:00 IST = 00:30 UTC), Neon Postgres, Gemini 2.5 Flash via OpenRouter for explanations (`lib/ai.ts`, `OPENROUTER_API_KEY`, fallback `GEMINI_API_KEY`), Zoho Inventory (`lib/zoho.ts`, set up with `setup-zoho.sh`). UI design brief: `DESIGN_PROMPT.md`.
