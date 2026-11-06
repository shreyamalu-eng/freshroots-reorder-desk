# Freshroots demand planner

Twice-weekly reorder planner for Freshroots (MESA AI-Native Track, Case A). It applies Raghav's five forecasting rules to SAP and Zoho data, then sends every recommendation to Raghav for approval before procurement sees it.

**Start here:** `BUILD_PLAN.md` (what's done, what's next) → `CLAUDE.md` (project rules) → `BUILD_PROMPT.md` (paste into Claude Code to build the web app).

## Run it
```bash
npm install
npm test            # 22 engine tests
npm run typecheck
npm run plan        # full run on synthetic sample data → out/
npm run prototype   # rebuild prototype/review-queue.html (open it in a browser)
```
Set `ANTHROPIC_API_KEY` to have Claude write the reason lines; without it, template reasons are used.

## What's here
| Path | What |
|---|---|
| `src/engine/engine.ts` | Rules engine (pure, deterministic) |
| `src/engine/explain.ts` | LLM prompt and the number check on its output |
| `src/io/csv.ts` | SAP / Zoho file adapters |
| `scripts/run.ts` | One full run from files |
| `scripts/backtest.ts` | Replay past weeks against real stockouts |
| `db/migrations/001_init.sql` | Neon Postgres schema |
| `app/`, `lib/` | Next.js app on Vercel: reorder desk + API routes, `pg` + `attachDatabasePool` |
| `prototype/review-queue.html` | Clickable review queue (same engine) |
| `docs/` | Data spec for IT, questions for Raghav, email templates |
| `data/sample/` | **Synthetic** data. Not Freshroots figures. |

## Case data (MESA files) and the reorder desk
```bash
npm run case   # runs the planner on data/case (15 SKUs, 22 Oct 2026, festival uplift on)
DRIVE_FOLDER_ID=<Drive folder id> npm run desk   # builds prototype/reorder-desk.html
```
Assumptions for the case files: no prices (risk shown in units), no open POs (Zoho not connected), one distributor per SKU (distributor-swing check cannot run), launch date = first week with sales.

## Web app on Neon + Vercel
```bash
neon login && neon deploy        # provisions Postgres and writes DATABASE_URL to .env.local
npm run db:migrate               # direct connection
npm run db:import                # load the case files
npm run build && npm run start   # http://localhost:3000
npx tsx scripts/e2e.ts           # end-to-end API test
bash setup-neon.sh && bash deploy-vercel.sh   # one-command setup on a Mac
```
Routes: `GET /api/health` · `GET|POST /api/runs` · `POST|DELETE /api/runs/:id/decisions` · `POST|GET /api/runs/:id/handoff` · `GET /api/cron` (Vercel Cron, Mon + Thu 06:00 IST).
