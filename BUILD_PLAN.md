# Build plan: Freshroots twice-weekly demand planner (90 days)

Start Mon 26 Oct 2026 · Live by week 10 · Day-90 review around 22 Jan 2027.
✅ = done in this repo · 🔲 = to do · Owner in brackets.

## Phase 0 · Align and unblock (week 1)
| # | Task | Owner | Done when | Status |
|---|---|---|---|---|
| 1 | Nine Checks verdict, The Cut, components map | Claude | Signed off by Deepa | ✅ (sign-off 🔲) |
| 2 | Agree scope: no automatic POs, Raghav approves every line | Deepa + CEO | Written OK in email | 🔲 |
| 3 | 60-min session with Raghav on `docs/questions-for-raghav.md` | You + Raghav | All 10 answered | 🔲 |
| 4 | Send `docs/data-spec-for-IT.md` to IT | You | IT confirms export method + stock history | 🔲 |
| 5 | Create accounts: GitHub, Neon, Vercel, Anthropic API, Resend (verified sender domain) | You | Keys in `.env.local`, `.env` git-ignored | 🔲 |

## Phase 1 · Data in place (weeks 1–2)
| # | Task | Owner | Done when | Status |
|---|---|---|---|---|
| 6 | Scheduled SAP sales + stock export, Mon and Thu 05:00 | IT | Two files land on schedule twice | 🔲 |
| 7 | Zoho read-only OAuth client for purchase orders | IT / Zoho admin | Test call returns open POs | 🔲 |
| 8 | SKU master: perishable flag, standard qty, price, launch date for 400 SKUs | Raghav + Priya | CSV loads with `readSkuMaster` with no errors | 🔲 |
| 9 | One-time 3-year export + weekly stock history | IT | Files in `data/real/` (git-ignored) | 🔲 |

## Phase 2 · Engine (done)
| # | Task | Owner | Done when | Status |
|---|---|---|---|---|
| 10 | Rules engine R1–R5, exceptions, data checks, ₹-at-risk ranking | Claude | 22 tests pass | ✅ |
| 11 | LLM explanation prompt + number check with template fallback | Claude | Invented numbers rejected in tests | ✅ |
| 12 | File adapters, end-to-end run script, email text | Claude | `npm run plan` runs 400 SKUs in under 1 s | ✅ |
| 13 | Backtest script | Claude | Catches a known stockout in the fixture | ✅ |
| 14 | Neon Postgres schema + Next.js app (desk, API, cron) with the note-required rule | Claude | Build passes; e2e test green on Postgres 16 | ✅ |
| 15 | Clickable review-queue prototype on the same engine | Claude | Approve, edit, reject, decide, hand-off all work | ✅ |
| 16 | Apply Raghav's answers to settings, add a test per answer | Claude Code | `npm test` green | 🔲 |

## Phase 3 · Prove it on real data (week 3)
| # | Task | Owner | Done when | Status |
|---|---|---|---|---|
| 17 | `npm run backtest -- data/real <from> <to>` on the last 12 months | You | Report: % of stockouts flagged ≥2 weeks ahead | 🔲 |
| 18 | Raghav reviews 50 random recommendations vs what he'd have done | Raghav | Agreement rate recorded | 🔲 |
| 19 | Tune thresholds only with Raghav's OK. Go/no-go with Deepa | Deepa | Go decision | 🔲 |

## Phase 4 · Build the app (weeks 3–5)
| # | Task | Owner | Done when | Status |
|---|---|---|---|---|
| 20 | `neon login`, `neon deploy`, `npm run db:migrate`, `npm run db:import` | You | `/api/health` shows the -pooler host | 🔲 |
| 21 | Paste `BUILD_PROMPT.md` into Claude Code, review plan, build | You + Claude Code | App runs locally | 🔲 |
| 22 | Connect SAP files, Zoho, Claude, Resend | You + IT | A real run round-trips into Neon | 🔲 |
| 23 | Test small: 3 SKUs (strong, weak, ambiguous), then all 400 | You | All three behave as expected | 🔲 |
| 24 | Deploy to Vercel, env vars set, cron 00:30 UTC Mon/Thu | You | Live URL works on Raghav's laptop | 🔲 |

## Phase 5 · Shadow, then live (weeks 6–13)
| # | Task | Owner | Done when | Status |
|---|---|---|---|---|
| 25 | Shadow runs ×8 (4 weeks). Raghav reviews, procurement still uses his monthly sheet | Raghav | Disagreements logged and fixed | 🔲 |
| 26 | Go live: procurement acts on the approved list; monthly Excel retired | Deepa | First live hand-off | 🔲 |
| 27 | Weekly impact vs ₹28–34L/quarter baseline | Priya | Impact page updated weekly | 🔲 |
| 28 | Day-90 review with CEO: stockouts, write-offs, Raghav's hours | Deepa | Decision on next initiative | 🔲 |

## Targets (agree in task 2)
- Forecast cycle: monthly → twice weekly. Data age at decision: 3–4 weeks → under 1 week.
- Raghav's time: ~2 days/month of data work → under 1 hour per run reviewing.
- Stockout + overstock losses: down from ₹28–34L per quarter. Set the % target after the backtest.
- Guardrails: zero POs raised without Raghav's approval. Zero runs on missing data.

## Risks
| Risk | Mitigation |
|---|---|
| SAP has no weekly stock history | Rebuild from goods movements, or backtest on 4 weeks of shadow runs instead |
| Zoho SKU codes differ from SAP | Mapping table in the SKU master |
| Too many flags to review | "Approve all" per tab, ₹-at-risk ordering, tune thresholds after shadow runs |
| Raghav unavailable | Second approver role; the queue waits, nothing auto-sends |
| Festival timing shifts with the calendar | Festival months are a setting (question 3) |
