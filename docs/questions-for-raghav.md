# Questions for Raghav (one 60-minute session)

The engine follows the five rules you documented. These questions cover the places where the written rules leave room for interpretation. Each answer changes a setting or a test, not the design.

| # | Question | What the engine does today | Where it's set |
|---|---|---|---|
| 1 | **Weeks of cover:** should open POs (already ordered, not yet received) count as stock? | Yes: cover = (on hand + open PO qty) ÷ weekly demand. Otherwise the planner would reorder stock that's on its way. | `engine.ts` → `evaluate` |
| 2 | **Festival uplift:** is the 25% applied to the demand used for cover only, or also to the high-demand comparison (rule 1)? | Cover only. Rule 1 compares actual sales, since uplifting both sides cancels out. | `engine.ts` → `evaluate` |
| 3 | **Festival months:** are October, November and March fixed, or do they follow the calendar (Diwali, Gudi Padwa)? Should the uplift start a few weeks *before* the month? | Fixed months, based on the run date. | `rule_settings.festivalMonths` |
| 4 | **Rules that disagree:** demand up more than 20% but stock above the maximum. What do you do today? | Sent to you as an exception with no quantity. | `engine.ts` → exceptions |
| 5 | **Rule 1 + rule 2 together:** stockout risk and rising demand. Immediate reorder at 1.5× standard qty? | Yes, 1.5× now. | `engine.ts` → quantity |
| 6 | **Unusual distributor behaviour:** what counts? | A distributor with at least 10% of a SKU's volume whose last 4 weeks moved 40% or more. **These two numbers are placeholders.** | `distributorSwingPct`, `distributorMinShare` |
| 7 | **Standard quantity:** is there one per SKU, or does it change by season? Does it need rounding to cases or pallets? | One number per SKU, no rounding. | `sku_master.standard_qty` |
| 8 | **Perishables:** which SKUs are high-perishability? | A flag per SKU in the SKU master. | `sku_master.perishable` |
| 9 | **New launches:** at 12 weeks of history a SKU moves onto the rules. Is 12 right? | 12 weeks. | `minHistoryWeeks` |
| 10 | **Your 15–20%:** for the last 3 months, which SKUs did you overrule the rules on, and why? | Not captured yet. Your answers seed the test set. | `tests/` |

**After the session:** update `rule_settings` (or `DEFAULT_SETTINGS`), add a test for every answer, run `npm test`.
