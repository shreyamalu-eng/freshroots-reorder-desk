// Shared types for the Freshroots demand planner.
// Every number the planner shows can be traced back to one of these fields.

export interface Settings {
  /** R1: last-4-week average must exceed the 12-week average by more than this (0.20 = 20%). */
  highDemandPct: number;
  /** R1: reorder multiple applied to the standard quantity (1.5 = 1.5x). */
  highDemandMultiplier: number;
  /** R2: weeks of cover below which a standard SKU is a stockout risk. */
  stockoutWeeks: number;
  /** R3: weeks of cover above which a standard SKU is an overstock risk. */
  overstockWeeks: number;
  /** R5: minimum weeks of cover for high-perishability SKUs. */
  perishableMinWeeks: number;
  /** R5: maximum weeks of cover for high-perishability SKUs. */
  perishableMaxWeeks: number;
  /** R4: months (1-12) that get the festival uplift. */
  festivalMonths: number[];
  /** R4: demand uplift applied before threshold checks (0.25 = +25%). */
  festivalUplift: number;
  /** Exception: SKUs with fewer weeks of history than this go to Raghav. */
  minHistoryWeeks: number;
  /** Exception: a distributor whose last-4-week rate moved by at least this much (0.40 = 40%). PLACEHOLDER: confirm with Raghav. */
  distributorSwingPct: number;
  /** Exception: only distributors carrying at least this share of the SKU's 12-week volume count (0.10 = 10%). PLACEHOLDER. */
  distributorMinShare: number;
}

export const DEFAULT_SETTINGS: Settings = {
  highDemandPct: 0.2,
  highDemandMultiplier: 1.5,
  stockoutWeeks: 6,
  overstockWeeks: 14,
  perishableMinWeeks: 3,
  perishableMaxWeeks: 4,
  festivalMonths: [10, 11, 3],
  festivalUplift: 0.25,
  minHistoryWeeks: 12,
  distributorSwingPct: 0.4,
  distributorMinShare: 0.1,
};

/** One row of the SKU master kept in the database (owned by Raghav). */
export interface SkuMaster {
  sku: string;
  name: string;
  category: string;
  perishable: boolean;
  /** Standard reorder quantity in units. */
  standardQty: number;
  /** Value per unit in rupees, used only to rank the review queue by money at risk. */
  unitPrice: number;
  /** ISO date (YYYY-MM-DD). */
  launchDate: string;
  active: boolean;
}

/** One row of the SAP sales export: units sold to one distributor in one week. */
export interface SalesRow {
  /** Monday of the week, ISO date. */
  weekStart: string;
  distributorId: string;
  sku: string;
  units: number;
}

/** One row of the SAP stock export. */
export interface StockRow {
  sku: string;
  onHand: number;
}

/** One open purchase order line from Zoho Inventory. */
export interface OpenPO {
  sku: string;
  poNumber: string;
  qty: number;
  /** Expected arrival, ISO date. */
  eta: string;
}

export interface DistributorSwing {
  distributorId: string;
  /** Share of the SKU's 12-week volume, 0-1. */
  share: number;
  avg4: number;
  avg12: number;
  /** avg4 / avg12 - 1 */
  change: number;
}

/** Everything the rules need for one SKU, after aggregation. */
export interface SkuInput {
  master: SkuMaster;
  /** Week start dates, oldest first, ending with the last complete week. */
  weeks: string[];
  /** Units per week across all distributors, aligned with `weeks`. */
  weekly: number[];
  /** null when the stock export has no row for this SKU. */
  onHand: number | null;
  /** Units on open POs in Zoho. */
  onOrder: number;
  /** Weeks of history since launch, capped at weeks.length. */
  historyWeeks: number;
  swings: DistributorSwing[];
}

export type Status = "reorder_now" | "reorder" | "pause" | "ok" | "exception" | "held";
export type RuleId = "R1_high_demand" | "R2_stockout_risk" | "R3_overstock_risk";

export interface Recommendation {
  sku: string;
  name: string;
  category: string;
  perishable: boolean;
  status: Status;
  rules: RuleId[];
  festival: boolean;
  avg4: number;
  avg12: number;
  /** Weekly demand used for cover, after any festival uplift. */
  demand: number;
  onHand: number | null;
  onOrder: number;
  /** (onHand + onOrder) / demand. null when demand is 0 or stock is unknown. */
  coverWeeks: number | null;
  window: { min: number; max: number };
  standardQty: number;
  /** Quantity the rules recommend. null for exceptions and held SKUs. */
  recommendedQty: number | null;
  /** For exceptions only: what the rules would have said, shown to Raghav as a starting point. */
  suggestedQty: number | null;
  rupeesAtRisk: number;
  exceptionReasons: string[];
  heldReasons: string[];
  /** Last weeks of total units, for the trend sparkline. */
  trend: number[];
  /** Deterministic one-line reason. The LLM may rewrite it; the validator checks the rewrite. */
  reason: string;
}

export interface RunIssue {
  level: "block" | "warn";
  message: string;
}

export interface RunResult {
  runDate: string;
  lastCompleteWeek: string;
  festival: boolean;
  settings: Settings;
  recommendations: Recommendation[];
  issues: RunIssue[];
  counts: Record<Status, number>;
}
