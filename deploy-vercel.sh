#!/usr/bin/env bash
# Put the Freshroots reorder desk online on Vercel. Run in your Mac's Terminal after setup-neon.sh:
#   cd ~/Downloads/Inspiration/freshroots-planner && bash deploy-vercel.sh
# Reads DATABASE_URL etc. from .env.local and stores them in Vercel (never printed). Log: vercel-deploy.log
set -uo pipefail
cd "$(dirname "$0")"
LOG=vercel-deploy.log
: > "$LOG"
say() { echo "$@" | tee -a "$LOG"; }
step() { say ""; say "== $* =="; }
die() { say "STOPPED: $*"; exit 1; }
V="npx -y vercel@latest"
val() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | sed -E "s/^['\"]//; s/['\"]$//"; }

[ -f .env.local ] || die "No .env.local. Run setup-neon.sh first."
[ -n "$(val DATABASE_URL)" ] || die "No DATABASE_URL in .env.local. Run setup-neon.sh first."
# Testing tool: no access code. Remove the earlier access-code setup if it is still around.
rm -f middleware.ts
sed -i.bak '/^ACCESS_CODE=/d' .env.local && rm -f .env.local.bak
grep -q '^CRON_SECRET=' .env.local || echo "CRON_SECRET=$(node -e 'console.log(require("crypto").randomBytes(16).toString("hex"))')" >> .env.local

step "1/5 Sign in to Vercel (a browser window may open)"
$V whoami >/dev/null 2>&1 || $V login || die "Vercel sign-in failed. Run: npx vercel@latest login"
say "signed in as $($V whoami 2>/dev/null | tail -1)"

step "2/5 Link this folder to the Vercel project freshroots-reorder-desk"
$V link --yes --project freshroots-reorder-desk 2>&1 | tail -3 | tee -a "$LOG" || die "vercel link failed."

step "3/5 Store environment variables in Vercel (production)"
$V env rm ACCESS_CODE production --yes >/dev/null 2>&1 && say "removed ACCESS_CODE from Vercel"
# OPENROUTER_API_KEY and AI_MODEL are already stored in Vercel and are left untouched.
for KEY in DATABASE_URL DATABASE_URL_UNPOOLED CRON_SECRET ZOHO_DC ZOHO_CLIENT_ID ZOHO_CLIENT_SECRET ZOHO_REFRESH_TOKEN ZOHO_ORG_ID; do
  VALUE="$(val $KEY)"
  [ -n "$VALUE" ] || { say "skip $KEY (not in .env.local)"; continue; }
  $V env rm "$KEY" production --yes >/dev/null 2>&1
  printf '%s' "$VALUE" | $V env add "$KEY" production >/dev/null 2>&1 && say "set $KEY" || die "Could not set $KEY."
done

step "4/5 Build and deploy to production"
$V deploy --prod --yes > deploy-output.txt 2>&1 || { tail -30 deploy-output.txt | tee -a "$LOG"; die "Deploy failed (see above)."; }
DEPLOY_URL=$(grep -Eo 'https://[a-zA-Z0-9.-]+\.vercel\.app' deploy-output.txt | tail -1)
say "deployment: $DEPLOY_URL"
PROD="https://freshroots-reorder-desk.vercel.app"
curl -s -o /dev/null -w '%{http_code}' "$PROD/api/health" | grep -q 200 || PROD=$($V inspect "$DEPLOY_URL" 2>&1 | grep -Eo 'https://freshroots-reorder-desk[a-z0-9-]*\.vercel\.app' | awk '{print length, $0}' | sort -n | head -1 | cut -d' ' -f2)
say "production URL: $PROD"

step "5/5 Check the live app and start the first planning run"
say "health: $(curl -s "$PROD/api/health")"
say "page: $(curl -s -o /dev/null -w '%{http_code}' "$PROD/")  (expect 200)"
say "first run: $(curl -s -X POST -H 'content-type: application/json' -d '{"runDate":"2026-10-22"}' "$PROD/api/runs")"
say ""
say "DONE. Open $PROD (no password: this is a testing tool)."
say "Tell Claude 'vercel done'."
