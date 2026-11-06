#!/usr/bin/env bash
# One-command Neon setup for the Freshroots reorder desk. Run in your Mac's Terminal (not inside Claude):
#   cd ~/Downloads/inspiration/freshroots-reorder-desk/freshroots-planner && bash setup-neon.sh
# Everything is logged to neon-setup.log (connection strings are never printed).
set -uo pipefail
cd "$(dirname "$0")"
LOG=neon-setup.log
: > "$LOG"
say() { echo "$@" | tee -a "$LOG"; }
step() { say ""; say "== $* =="; }
die() { say "STOPPED: $*"; exit 1; }

step "1/7 Check Node.js"
command -v node >/dev/null || die "Node.js is not installed. Install the LTS version from https://nodejs.org (or: brew install node), then run this again."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js $NODE_MAJOR is too old. Install Node 20 or newer from https://nodejs.org."
say "node $(node -v), npm $(npm -v)"

step "2/7 Install packages"
npm install --no-audit --no-fund 2>&1 | tail -3 | tee -a "$LOG" || die "npm install failed."

step "3/7 Sign in to Neon (a browser window opens; finish signing in there)"
npx -y neon@latest login 2>&1 | tail -5 | tee -a "$LOG" || die "Neon sign-in failed. Run: npx neon@latest login"

step "4/7 Deploy Neon services and pull env vars into .env.local"
npx -y neon@latest deploy 2>&1 | sed -E 's#(postgres(ql)?://)[^ ]+#\1****#g' | tail -15 | tee -a "$LOG"
[ -f .env.local ] && grep -q '^DATABASE_URL=' .env.local || die "No DATABASE_URL in .env.local after neon deploy. Try: npx neon@latest env pull"
grep -q '^CRON_SECRET=' .env.local || echo "CRON_SECRET=$(node -e 'console.log(require("crypto").randomBytes(16).toString("hex"))')" >> .env.local
say "env vars in .env.local: $(grep -oE '^[A-Z0-9_]+' .env.local | tr '\n' ' ')"

step "5/7 Create tables and load the case data"
npm run -s db:migrate 2>&1 | tee -a "$LOG" || die "Migration failed."
npm run -s db:import 2>&1 | tee -a "$LOG" || die "Import failed."

step "6/7 Build"
npm run -s build 2>&1 | grep -E "Compiled|Failed|rror|Route|/api|○|ƒ" | tee -a "$LOG"
[ -d .next ] || die "Build failed."

step "7/7 Start the app and run the end-to-end test against Neon"
npx next start -p 3000 > next-server.log 2>&1 &
SERVER=$!
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:3000/api/health && break; sleep 1; done
npx tsx scripts/e2e.ts 2>&1 | tee -a "$LOG"
RESULT=${PIPESTATUS[0]}
kill $SERVER 2>/dev/null

say ""
if [ "$RESULT" -eq 0 ]; then say "DONE: the app works end to end on Neon. Tell Claude 'neon done'."; else say "Some checks failed. Tell Claude 'neon done' and it will read neon-setup.log."; fi
