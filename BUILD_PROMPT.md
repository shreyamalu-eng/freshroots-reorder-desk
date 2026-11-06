# Build prompt for Claude Code

Paste everything below the line into Claude Code, opened in this repo. Ask for the plan first, review it, then let it build.

---

## Role
You are a senior full-stack engineer and product designer. You build small, reliable internal tools for operations teams, and you keep humans in charge of consequential decisions.

## Task
Wrap the existing rules engine in a production web app for Freshroots' twice-weekly demand planner: database, cron run, review queue, settings, hand-off email and impact tracker. **Do not rewrite the engine.** Import it from `src/engine/`.

First reply with a plan only: file tree, routes, tables touched, and the order you'll build in. Wait for my go-ahead.

## Context
- Read `CLAUDE.md` and follow every non-negotiable in it.
- The components map (steps 1–21) is the spec for the flow. Summary:
  1. Vercel cron Mon and Thu 00:30 UTC calls `POST /api/runs` (also a "Run now" button for planners).
  2. The route fetches the SAP sales and stock files (SFTP or storage bucket, see `docs/data-spec-for-IT.md`), and open POs from the Zoho Inventory API (read-only).
  3. It loads `sku_master` and `rule_settings` from Neon and calls `runPlanner()` from `src/engine/engine.ts`.
  4. If any issue has level `block`, save the run as `blocked`, email Raghav the reason and stop.
  5. It calls `callClaude()` once with `buildExplainUserMessage()`, then `mergeExplanations()`, which keeps only reasons that pass the number check.
  6. It saves `runs`, `run_inputs` (raw files to Neon Storage) and `recommendations`, then emails Raghav via Resend.
- Screens (one primary action each):
  - **Review queue** `/runs/[date]`: the main screen. Copy the layout and behaviour of `prototype/review-queue.html`: summary chips, filter tabs, rows sorted exceptions first then by ₹ at risk, 16-week sparkline, cover vs window bar, approve / edit qty / reject. Edit and reject require a note. Exceptions need a quantity and a note. Primary action: **Send approved list to procurement**, enabled only when every exception is decided.
  - **Run history** `/runs`: date, trigger, counts, status, sent time.
  - **Settings** `/settings`: the rule thresholds (planner role only), with the rule text next to each number.
  - **SKU master** `/skus`: search, edit perishable flag, standard qty, active.
  - **Impact** `/impact`: weekly stockout incidents and overstock value against the ₹28–34 lakh per quarter baseline.
- Hand-off: `POST /api/runs/[id]/send` builds the CSV from `approved_lines`, emails procurement with Resend, writes `handoffs`, sets run status `sent`. After this, decisions are locked.
- Schema: `db/migrations/001_init.sql` (already tested on Postgres 16). Roles: planner, procurement, admin.

## Constraints
- Next.js App Router + TypeScript, Neon JS client, Tailwind. Server-side only for keys.
- Use the Neon service role key only in server routes; the browser uses the anon key with RLS.
- Secrets only in `.env.local` and Vercel env vars: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `RESEND_API_KEY`, `MAIL_FROM`, `PLANNER_EMAIL`, `PROCUREMENT_EMAILS`, `ZOHO_*`, `SAP_FILE_*`, `CRON_SECRET`. Cron route checks `CRON_SECRET`.
- Never write to Zoho or SAP. Never send email to procurement without a planner clicking Send.
- WCAG 2.2 AA: keyboard reachable actions, visible focus, 4.5:1 contrast, 24px minimum targets.
- Keep `npm test` green. Add a test for every rule change.
- Log every external call (source, row count, duration, status) on the run.

## Format
- Plan first. Then build in this order, pushing to GitHub after each step: schema + auth → run route with file adapters → review queue → hand-off → settings + SKU master → impact → cron.
- Update `README.md` with setup steps and `.env.example` with every variable.

## Example
- Good output looks like `prototype/review-queue.html` running on real data.
- A good reason line: "Stock and open orders cover 3.2 weeks, below the 6-week minimum. Reorder 1,000 units now. Includes the 25% festival uplift."
- Test small first: run with three SKUs (one clear stockout, one clearly fine, one where rules disagree) before the full 400.
