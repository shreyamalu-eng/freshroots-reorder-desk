#!/usr/bin/env bash
# Put the Freshroots reorder desk on GitHub. Run in your Mac's Terminal:
#   cd ~/Downloads/Inspiration/freshroots-planner && bash push-github.sh
# Creates a PRIVATE repo called freshroots-reorder-desk (pass another name as the first argument).
# Keys never leave your Mac: .env.local and every .env file are ignored and double-checked before pushing.
set -uo pipefail
cd "$(dirname "$0")"
REPO="${1:-freshroots-reorder-desk}"
LOG=github-push.log; : > "$LOG"
say() { echo "$@" | tee -a "$LOG"; }
die() { say "STOPPED: $*"; exit 1; }

# 0. Make sure nothing secret or bulky can be committed
for p in deploy-output.txt '*.tsbuildinfo' '*.tgz' 'self_client*.json' '.DS_Store'; do
  grep -qxF "$p" .gitignore 2>/dev/null || echo "$p" >> .gitignore
done

# 1. git (comes with Apple's command line tools)
command -v git >/dev/null 2>&1 || { xcode-select --install 2>/dev/null; die "git is not installed. Accept the Apple pop-up to install the command line tools, then rerun."; }

# 2. GitHub CLI: use the installed one, or download it just for this folder (~15 MB, no admin rights needed)
GH="$(command -v gh || true)"
if [ -z "$GH" ]; then
  GH="$HOME/.local/gh/bin/gh"
  if [ ! -x "$GH" ]; then
    VER=2.62.0
    case "$(uname -m)" in arm64) ARCH=arm64;; *) ARCH=amd64;; esac
    say "Downloading the GitHub CLI ($VER, $ARCH)…"
    TMP=$(mktemp -d)
    curl -fsSL -o "$TMP/gh.zip" "https://github.com/cli/cli/releases/download/v$VER/gh_${VER}_macOS_${ARCH}.zip" || die "Could not download the GitHub CLI. Check your internet and rerun."
    unzip -q "$TMP/gh.zip" -d "$TMP" && mkdir -p "$HOME/.local/gh" && cp -R "$TMP"/gh_*/* "$HOME/.local/gh/" || die "Could not unpack the GitHub CLI."
    rm -rf "$TMP"
  fi
fi
"$GH" --version | head -1 | tee -a "$LOG"

# 3. Sign in (opens your browser; copy the one-time code it prints)
if ! "$GH" auth status >/dev/null 2>&1; then
  say "Sign in to GitHub: press Enter, copy the code shown, paste it in the browser page, approve."
  "$GH" auth login --hostname github.com --git-protocol https --web || die "GitHub sign-in did not finish."
fi
"$GH" auth setup-git >/dev/null 2>&1
LOGIN=$("$GH" api user -q .login) || die "Signed in, but could not read your GitHub user."
UID_=$("$GH" api user -q .id)
say "signed in as $LOGIN"

# 4. Commit
[ -d .git ] || git init -q -b main
git config user.name >/dev/null || git config user.name "$LOGIN"
git config user.email >/dev/null || git config user.email "${UID_}+${LOGIN}@users.noreply.github.com"
git add -A
BAD=$(git diff --cached --name-only | grep -E '(^|/)\.env($|\.)|self_client|\.tgz$|node_modules/|\.next/' | grep -v '\.env\.example$' || true)
[ -z "$BAD" ] || { git reset -q; die "These files must not go to GitHub: $BAD"; }
git commit -q -m "Freshroots reorder desk: rules engine, Next.js app, Neon, OpenRouter, Zoho" && say "committed $(git rev-list --count HEAD) commit(s)" || say "nothing new to commit"

# 5. Create the repo (private) and push
if git remote get-url origin >/dev/null 2>&1; then
  git push -q -u origin main || die "Push failed."
else
  "$GH" repo create "$REPO" --private --source . --remote origin --push \
    --description "Twice-weekly reorder planner for Freshroots: Raghav's 5 rules, human approval, Zoho draft POs" \
    || die "Could not create $LOGIN/$REPO (does a repo with that name already exist? Rerun with another name: bash push-github.sh my-new-name)"
fi
URL=$("$GH" repo view --json url -q .url)
echo "$URL" > github-link.txt
say ""
say "DONE. Repository: $URL  (private: share it from Settings → Collaborators, or make it public there)"
say "Tell Claude 'github done'."
