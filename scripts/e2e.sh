#!/usr/bin/env bash
# End-to-end API test against a running app. Usage: BASE=http://localhost:3000 CRON_SECRET=... bash scripts/e2e.sh
set -u
B=${BASE:-http://localhost:3000}
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
post() { curl -s -w " [%{http_code}]\n" -X POST "$B$1" -H 'content-type: application/json' -d "$2"; }
echo "1 health:"; curl -s $B/api/health | J "d['ok'], d['db']['skus'], d['db']['sales'], d['db']['pooled']"
echo "2 cron without secret:"; curl -s -o /dev/null -w "[%{http_code}]\n" $B/api/cron
echo "3 manual run:"; post /api/runs '{"runDate":"2026-10-22"}'
RID=$(curl -s $B/api/runs | J "d['run']['id']")
echo "4 queue:"; curl -s $B/api/runs | J "'\n'.join(f\"  {r['sku']} {r['status']:<12} cover {r['coverWeeks']:>5} qty {r['recommendedQty']}\" for r in d['recommendations'] if r['status']!='ok')"
echo "5 edit without a note (expect 400):"; post /api/runs/$RID/decisions '{"sku":"SKU011","decision":"edited","qty":250,"decidedBy":"Raghav"}'
echo "6 hand-off before all decided (expect 409):"; post /api/runs/$RID/handoff '{"sentBy":"Raghav"}'
echo "7 decisions:"
for s in SKU001 SKU003 SKU013 SKU004; do q=$(curl -s $B/api/runs | J "[r['recommendedQty'] for r in d['recommendations'] if r['sku']=='$s'][0]"); post /api/runs/$RID/decisions "{\"sku\":\"$s\",\"decision\":\"approved\",\"qty\":$q,\"decidedBy\":\"Raghav\"}" | sed "s/^/  $s /" | cut -c1-120; done
post /api/runs/$RID/decisions '{"sku":"SKU011","decision":"edited","qty":250,"note":"Truck holds 250 crates of bread","decidedBy":"Raghav"}' | cut -c1-140
for s in SKU006 SKU007; do post /api/runs/$RID/decisions "{\"sku\":\"$s\",\"decision\":\"approved\",\"qty\":0,\"decidedBy\":\"Raghav\"}" | cut -c1-100; done
echo "8 hand-off:"; post /api/runs/$RID/handoff '{"sentBy":"Raghav"}'
echo "9 CSV:"; curl -s $B/api/runs/$RID/handoff
echo "10 change after send (expect 409):"; post /api/runs/$RID/decisions '{"sku":"SKU001","decision":"approved","qty":1,"decidedBy":"X"}'
echo "11 cron with secret:"; curl -s -w " [%{http_code}]\n" -H "authorization: Bearer ${CRON_SECRET:-}" $B/api/cron | cut -c1-160
