#!/usr/bin/env bash
# Connect Zoho Inventory to the reorder desk. Run in your Mac's Terminal:
#   cd ~/Downloads/Inspiration/freshroots-planner && bash setup-zoho.sh
#
# Before you run it (in a browser):
#   1. api-console.zoho.in (or .com) -> your Self Client -> "Generate Code"
#   2. Scope: ZohoInventory.purchaseorders.ALL,ZohoInventory.items.READ,ZohoInventory.contacts.READ,ZohoInventory.settings.READ
#      Duration 10 minutes. Click Create, pick your Inventory organisation.
#   3. Click DOWNLOAD. Zoho saves self_client.json in your Downloads folder. Run this script within 10 minutes.
#
# The desk only creates DRAFT purchase orders. Procurement still issues every PO in Zoho.
set -uo pipefail
cd "$(dirname "$0")"
LOG=zoho-setup.log; : > "$LOG"
say() { echo "$@" | tee -a "$LOG"; }
die() { say "STOPPED: $*"; exit 1; }
j() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s)[process.argv[1]];console.log(v==null?"":String(v))}catch{console.log("")}})' "$1"; }
setenv() { # setenv KEY VALUE  -> .env.local + Vercel production (never printed)
  sed -i.bak "/^$1=/d" .env.local 2>/dev/null; rm -f .env.local.bak
  echo "$1=$2" >> .env.local
  npx -y vercel@latest env rm "$1" production --yes >/dev/null 2>&1
  printf '%s' "$2" | npx -y vercel@latest env add "$1" production >/dev/null 2>&1 && say "saved $1" || say "saved $1 locally (Vercel will get it from deploy-vercel.sh)"
}

# 1. Read the Self Client JSON (downloaded file, or pasted on one line)
F=$(ls -t ~/Downloads/self_client*.json 2>/dev/null | head -1)
if [ -n "$F" ]; then
  say "Using $F"
  SC=$(cat "$F")
else
  say "No self_client.json in Downloads."
  read -r -s -p "Paste the whole JSON from Zoho (one line, hidden), then Enter: " SC; echo
fi
CID=$(printf '%s' "$SC" | j client_id); CSECRET=$(printf '%s' "$SC" | j client_secret); CODE=$(printf '%s' "$SC" | j code)
EXP=$(printf '%s' "$SC" | j expiry_time)
[ -n "$CID" ] && [ -n "$CSECRET" ] && [ -n "$CODE" ] || die "That JSON is missing client_id, client_secret or code. Download it again from the Self Client after Generate Code."
if [ -n "$EXP" ] && [ "$(( $(date +%s) * 1000 ))" -gt "$EXP" ]; then
  rm -f "$F" 2>/dev/null
  die "This code has expired. In Zoho click Generate Code again, Download, and rerun within 10 minutes."
fi

# 2. Exchange the code. Try each Zoho region; a wrong region does not use up the code.
REFRESH=""; ACCESS=""; DC=""
for D in in com eu com.au jp ca sa uk; do
  R=$(curl -s -X POST "https://accounts.zoho.$D/oauth/v2/token" \
    --data-urlencode "code=$CODE" --data-urlencode "client_id=$CID" --data-urlencode "client_secret=$CSECRET" \
    --data-urlencode "grant_type=authorization_code")
  RT=$(printf '%s' "$R" | j refresh_token)
  if [ -n "$RT" ]; then REFRESH=$RT; ACCESS=$(printf '%s' "$R" | j access_token); DC=$D; break; fi
  E=$(printf '%s' "$R" | j error); [ -z "$E" ] && E="no JSON answer"
  say "  zoho.$D: $E"
  [ "$E" = "invalid_code" ] && break
done
[ -n "$REFRESH" ] || die "Zoho gave no refresh token. 'invalid_code' means the code was used or expired: Generate Code + Download again and rerun right away."
rm -f "$F" 2>/dev/null   # the code is single-use; don't leave the secret lying in Downloads
say "Connected to Zoho region .$DC"

# 3. Pick the Inventory organisation
ORGJSON=$(curl -s "https://www.zohoapis.$DC/inventory/v1/organizations" -H "Authorization: Zoho-oauthtoken $ACCESS")
printf '%s' "$ORGJSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let o=[];try{o=JSON.parse(s).organizations||[]}catch{};o.forEach((x,i)=>console.log(`${i+1}. ${x.name} (id ${x.organization_id})`));if(!o.length)console.log("No Zoho Inventory organisation found. Open inventory.zoho.in once to create one, then rerun.")})' | tee -a "$LOG"
read -r -p "Organisation number to use (default 1): " N; N=${N:-1}
ORG=$(printf '%s' "$ORGJSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{let o=[];try{o=JSON.parse(s).organizations||[]}catch{};console.log((o[$N-1]||{}).organization_id||'')})")
[ -n "$ORG" ] || die "No organisation selected."

setenv ZOHO_DC "$DC"
setenv ZOHO_CLIENT_ID "$CID"
setenv ZOHO_CLIENT_SECRET "$CSECRET"
setenv ZOHO_REFRESH_TOKEN "$REFRESH"
setenv ZOHO_ORG_ID "$ORG"
say ""
say "DONE. Zoho is connected (org $ORG). Now run: bash deploy-vercel.sh"
say "In Zoho, each distributor must exist as a Vendor and each SKU as an Item with the same SKU code (e.g. SKU001)."
