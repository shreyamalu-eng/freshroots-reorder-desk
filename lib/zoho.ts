// Zoho Inventory: read open purchase orders, and create DRAFT purchase orders from an approved hand-off.
// Drafts are never issued from here: procurement reviews and issues them in Zoho (the human gate stays).
// Config (all required to switch Zoho on): ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID.
// ZOHO_DC = data centre: "in" (default, zoho.in), "com", "eu", "com.au", "jp", "ca", "sa", "uk".

type Fetch = typeof fetch;

export function zohoConfigured(): boolean {
  return ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ORG_ID"].every((k) => Boolean(process.env[k]));
}

const dc = () => process.env.ZOHO_DC || "in";
const accountsUrl = () => `https://accounts.zoho.${dc()}`;
const apiBase = () => `https://www.zohoapis.${dc()}/inventory/v1`;

let cached: { token: string; expires: number } | null = null;

export async function zohoToken(fetchImpl: Fetch = fetch): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const q = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN ?? "",
    client_id: process.env.ZOHO_CLIENT_ID ?? "",
    client_secret: process.env.ZOHO_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
  });
  const res = await fetchImpl(`${accountsUrl()}/oauth/v2/token?${q}`, { method: "POST", signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) throw new Error(`Zoho sign-in failed: ${body.error ?? res.status}`);
  cached = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export async function zohoApi<T = Record<string, unknown>>(path: string, init: RequestInit = {}, fetchImpl: Fetch = fetch): Promise<T> {
  const token = await zohoToken(fetchImpl);
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetchImpl(`${apiBase()}${path}${sep}organization_id=${encodeURIComponent(process.env.ZOHO_ORG_ID ?? "")}`, {
    ...init,
    headers: { authorization: `Zoho-oauthtoken ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & { code?: number; message?: string };
  if (!res.ok || (typeof body.code === "number" && body.code !== 0)) throw new Error(`Zoho ${path.split("?")[0]}: ${body.message ?? res.status}`);
  return body;
}

export interface OpenPoLine { poNumber: string; sku: string; qty: number; eta: string }

/** Open (issued, not fully received) purchase orders, flattened to SKU lines. */
export async function listOpenPoLines(fetchImpl: Fetch = fetch): Promise<OpenPoLine[]> {
  // Zoho Inventory rejects filter_by=Status.Open, so list recent POs and keep the ones still awaiting stock.
  // Drafts are not on order yet; received, billed, closed and cancelled POs no longer add cover.
  const OPEN = new Set(["open", "issued", "partially_received"]);
  const list = await zohoApi<{ purchaseorders?: { purchaseorder_id: string; purchaseorder_number: string; delivery_date?: string; status?: string }[] }>(
    "/purchaseorders?per_page=200&sort_column=date&sort_order=D", {}, fetchImpl);
  const out: OpenPoLine[] = [];
  for (const po of (list.purchaseorders ?? []).filter((p) => OPEN.has((p.status ?? "").toLowerCase()))) {
    const d = await zohoApi<{ purchaseorder?: { line_items?: { sku?: string; quantity?: number; quantity_received?: number }[] } }>(
      `/purchaseorders/${po.purchaseorder_id}`, {}, fetchImpl);
    for (const li of d.purchaseorder?.line_items ?? []) {
      const open = (li.quantity ?? 0) - (li.quantity_received ?? 0);
      if (li.sku && open > 0) out.push({ poNumber: po.purchaseorder_number, sku: li.sku, qty: open, eta: po.delivery_date ?? "" });
    }
  }
  return out;
}

export interface ApprovedLine { sku: string; name: string; qty: number; vendor: string; note?: string | null }
export interface PoPlan { vendor: string; lines: ApprovedLine[]; units: number }

/** Pure: group approved reorder lines (qty > 0) into one draft PO per vendor (distributor). */
export function planPurchaseOrders(lines: ApprovedLine[]): PoPlan[] {
  const by = new Map<string, ApprovedLine[]>();
  for (const l of lines) {
    if (!(l.qty > 0)) continue;
    const v = l.vendor || "Unassigned vendor";
    if (!by.has(v)) by.set(v, []);
    by.get(v)!.push(l);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([vendor, ls]) => ({ vendor, lines: ls, units: ls.reduce((a, l) => a + l.qty, 0) }));
}

export interface PoResult { vendor: string; status: "draft" | "failed" | "skipped"; poId?: string; poNumber?: string; lines: number; units: number; error?: string }

/** Create one draft PO per vendor. Missing vendors or items are reported, never guessed. */
export async function createDraftPurchaseOrders(plans: PoPlan[], reference: string, fetchImpl: Fetch = fetch): Promise<PoResult[]> {
  const results: PoResult[] = [];
  for (const p of plans) {
    try {
      const vendors = await zohoApi<{ contacts?: { contact_id: string; contact_name: string }[] }>(
        `/contacts?contact_type=vendor&contact_name_contains=${encodeURIComponent(p.vendor)}`, {}, fetchImpl);
      const vendor = (vendors.contacts ?? []).find((c) => c.contact_name.toLowerCase() === p.vendor.toLowerCase()) ?? vendors.contacts?.[0];
      if (!vendor) { results.push({ vendor: p.vendor, status: "skipped", lines: p.lines.length, units: p.units, error: `No Zoho vendor named "${p.vendor}".` }); continue; }
      const items: { item_id: string; quantity: number }[] = [];
      const missing: string[] = [];
      for (const l of p.lines) {
        const it = await zohoApi<{ items?: { item_id: string; sku: string }[] }>(`/items?sku=${encodeURIComponent(l.sku)}`, {}, fetchImpl);
        const item = (it.items ?? []).find((i) => i.sku === l.sku);
        if (item) items.push({ item_id: item.item_id, quantity: l.qty }); else missing.push(l.sku);
      }
      if (!items.length) { results.push({ vendor: p.vendor, status: "skipped", lines: p.lines.length, units: p.units, error: `None of these SKUs exist as Zoho items: ${missing.join(", ")}.` }); continue; }
      const created = await zohoApi<{ purchaseorder?: { purchaseorder_id: string; purchaseorder_number: string } }>("/purchaseorders", {
        method: "POST",
        body: JSON.stringify({
          vendor_id: vendor.contact_id,
          reference_number: reference,
          notes: `Created as a draft by the Freshroots reorder desk (${reference}). Approved by the demand planner; review and issue in Zoho.`,
          line_items: items,
        }),
      }, fetchImpl);
      results.push({
        vendor: p.vendor, status: "draft", poId: created.purchaseorder?.purchaseorder_id, poNumber: created.purchaseorder?.purchaseorder_number,
        lines: items.length, units: p.units, error: missing.length ? `Not in Zoho, left out: ${missing.join(", ")}.` : undefined,
      });
    } catch (e) {
      results.push({ vendor: p.vendor, status: "failed", lines: p.lines.length, units: p.units, error: (e as Error).message });
    }
  }
  return results;
}
