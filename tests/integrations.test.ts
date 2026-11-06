import { test } from "node:test";
import assert from "node:assert/strict";
import { aiJson, aiProvider } from "../lib/ai";
import { createDraftPurchaseOrders, listOpenPoLines, planPurchaseOrders } from "../lib/zoho";

// A tiny fake Zoho: records calls and answers by URL.
function fakeZoho(log: string[]) {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    log.push(`${init?.method ?? "GET"} ${u.replace(/\?.*/, "")}`);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
    if (u.includes("/oauth/v2/token")) return json({ access_token: "tok", expires_in: 3600 });
    if (u.includes("/purchaseorders?per_page")) return json({ code: 0, purchaseorders: [
      { purchaseorder_id: "p1", purchaseorder_number: "PO-101", delivery_date: "2026-10-30", status: "issued" },
      { purchaseorder_id: "p9", purchaseorder_number: "PO-099", status: "draft" },
      { purchaseorder_id: "p8", purchaseorder_number: "PO-098", status: "billed" }] });
    if (u.includes("/purchaseorders/p1")) return json({ code: 0, purchaseorder: { line_items: [{ sku: "SKU001", quantity: 500, quantity_received: 200 }, { sku: "SKU002", quantity: 100, quantity_received: 100 }] } });
    if (u.includes("/contacts")) return json({ code: 0, contacts: u.includes("Nutri") ? [{ contact_id: "v1", contact_name: "NutriFlow Distributors" }] : [] });
    if (u.includes("/items?sku=SKU001")) return json({ code: 0, items: [{ item_id: "i1", sku: "SKU001" }] });
    if (u.includes("/items?sku=")) return json({ code: 0, items: [] });
    if (u.endsWith("/purchaseorders") || u.includes("/purchaseorders?organization_id")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.equal(body.vendor_id, "v1");
      assert.deepEqual(body.line_items, [{ item_id: "i1", quantity: 750 }]);
      return json({ code: 0, purchaseorder: { purchaseorder_id: "new1", purchaseorder_number: "PO-00042" } });
    }
    return json({ code: 1, message: "unexpected " + u }, 400);
  }) as typeof fetch;
}

function withZohoEnv<T>(fn: () => Promise<T>) {
  Object.assign(process.env, { ZOHO_CLIENT_ID: "c", ZOHO_CLIENT_SECRET: "s", ZOHO_REFRESH_TOKEN: "r", ZOHO_ORG_ID: "o" });
  return fn();
}

test("Zoho: approved lines are grouped into one draft PO per distributor; zero quantities are left out", () => {
  const plans = planPurchaseOrders([
    { sku: "SKU001", name: "Mango", qty: 750, vendor: "NutriFlow Distributors" },
    { sku: "SKU013", name: "Peanut butter", qty: 120, vendor: "NutriFlow Distributors" },
    { sku: "SKU003", name: "Rice", qty: 300, vendor: "GrainPath Logistics" },
    { sku: "SKU006", name: "Quinoa", qty: 0, vendor: "PeakSource Supply" },
  ]);
  assert.deepEqual(plans.map((p) => [p.vendor, p.lines.length, p.units]), [["GrainPath Logistics", 1, 300], ["NutriFlow Distributors", 2, 870]]);
});

test("Zoho: open POs are read as remaining (ordered minus received) quantities", async () => {
  const log: string[] = [];
  const lines = await withZohoEnv(() => listOpenPoLines(fakeZoho(log)));
  assert.deepEqual(lines, [{ poNumber: "PO-101", sku: "SKU001", qty: 300, eta: "2026-10-30" }]);
});

test("Zoho: draft POs are created per vendor; missing vendors and items are reported, not guessed", async () => {
  const log: string[] = [];
  const res = await withZohoEnv(() => createDraftPurchaseOrders(
    planPurchaseOrders([
      { sku: "SKU001", name: "Mango", qty: 750, vendor: "NutriFlow Distributors" },
      { sku: "SKU999", name: "Unknown", qty: 10, vendor: "NutriFlow Distributors" },
      { sku: "SKU003", name: "Rice", qty: 300, vendor: "GrainPath Logistics" },
    ]), "FR-test", fakeZoho(log)));
  const byVendor = Object.fromEntries(res.map((r) => [r.vendor, r]));
  assert.equal(byVendor["NutriFlow Distributors"].status, "draft");
  assert.equal(byVendor["NutriFlow Distributors"].poNumber, "PO-00042");
  assert.match(byVendor["NutriFlow Distributors"].error ?? "", /SKU999/);
  assert.equal(byVendor["GrainPath Logistics"].status, "skipped");
  assert.match(byVendor["GrainPath Logistics"].error ?? "", /No Zoho vendor/);
  assert.ok(!log.some((l) => /mark|issue|approve/i.test(l)), "the desk must never issue a PO");
});

test("AI: OpenRouter is preferred when its key is set, and the JSON text is returned", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  assert.equal(aiProvider(), "openrouter");
  let seen: { url: string; auth: string; model: string } | null = null;
  const fake = (async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    seen = { url: String(url), auth: (init?.headers as Record<string, string>).authorization, model: body.model };
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"items":[],"summary":"ok"}' } }] }), { status: 200 });
  }) as typeof fetch;
  const text = await aiJson("hi", "sys", fake);
  assert.equal(text, '{"items":[],"summary":"ok"}');
  assert.equal(seen!.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(seen!.auth, "Bearer test-key");
  assert.equal(seen!.model, "google/gemini-2.5-flash");
  delete process.env.OPENROUTER_API_KEY;
});
