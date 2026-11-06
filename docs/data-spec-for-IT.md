# Data spec for the IT team

What the demand planner needs from SAP and Zoho, in what shape, and when. Please reply with anything that can't be done as written; the planner can adapt to a different layout as long as the fields exist.

## 1. SAP weekly sales export (`sap_sales_weekly.csv`)

| Column | Type | Example | Notes |
|---|---|---|---|
| `week_start` | date, `YYYY-MM-DD` | `2026-10-12` | Monday of the sales week |
| `distributor_id` | text | `D0007` | SAP customer number |
| `sku` | text | `FR-10011` | SAP material number, same code as the SKU master |
| `units` | integer | `142` | Units invoiced to that distributor in that week, net of returns |

- **Window:** the last 20 complete weeks on every export. For the one-time backtest, all 3 years.
- **Schedule:** Monday and Thursday by 05:00 IST, so the 06:00 run has fresh data.
- **Delivery:** a CSV file dropped in an SFTP folder or shared drive that the app can read with a read-only account. (If SAP OData or an RFC is easier for you, the app can call that instead.)
- **Volume:** about 200,000 rows per export at 1,200 distributors.

## 2. SAP stock export (`sap_stock.csv`)

| Column | Type | Example | Notes |
|---|---|---|---|
| `sku` | text | `FR-10011` | |
| `on_hand` | integer | `4583` | Unrestricted stock across Freshroots warehouses, at export time |

Same schedule and delivery as the sales file.

## 3. SAP weekly stock history (`sap_stock_history.csv`), one time only

| Column | Type | Notes |
|---|---|---|
| `week_start` | date | Monday of the week |
| `sku` | text | |
| `on_hand` | integer | Stock at the end of that week |

Needed for the backtest in week 3: it shows whether the rules would have flagged past stockouts in time. As many weeks as SAP holds, up to 3 years. **Question:** does SAP keep weekly stock snapshots? If not, can we rebuild them from goods movements (MB51 / MSEG)?

## 4. Zoho Inventory open purchase orders (read-only API)

The app reads open purchase orders so that stock already ordered is not ordered again.

- **Access:** a Zoho OAuth "self client" with **read-only** scope for purchase orders (`ZohoInventory.purchaseorders.READ`). No create or update scopes.
- **Fields used:** PO number, status, line item SKU, quantity ordered, quantity received, expected delivery date.
- **Open means:** status issued or partially received; quantity counted = ordered minus received.
- **Question:** are Zoho item SKUs the same codes as SAP material numbers? If not, we need a mapping table.

## 5. SKU master (built once, then owned by Raghav)

The planner keeps its own SKU master. IT can seed it from the SAP material master; Raghav fills the planning fields.

| Column | Source | Notes |
|---|---|---|
| `sku`, `name`, `category` | SAP material master | |
| `unit_price` | SAP price list | Used only to rank the queue by money at risk |
| `launch_date` | SAP (creation date or first sale) | Under 12 weeks of history = exception |
| `perishable` | **Raghav** | `true` for high-perishability SKUs (3–4 week window) |
| `standard_qty` | **Raghav** | Standard reorder quantity in units |
| `active` | Raghav | `false` stops planning a SKU |

## Security

- Read-only accounts everywhere. The planner never writes to SAP or Zoho.
- Credentials go in the app's environment variables, never in code or email.
- Raw files are kept for 90 days with each run, for audit.
