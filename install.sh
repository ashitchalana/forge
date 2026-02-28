#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  FORGE INSTALLER — One-command setup for any fresh Mac
#  Usage: bash <(curl -fsSL https://raw.githubusercontent.com/ashitchalana/forge/main/install.sh)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── Colours ───────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "${GREEN}  ✓${RESET} $*"; }
info() { echo -e "${CYAN}  →${RESET} $*"; }
warn() { echo -e "${YELLOW}  ⚠${RESET} $*"; }
err()  { echo -e "${RED}  ✗${RESET} $*"; }
hdr()  { echo -e "\n${BOLD}${CYAN}$*${RESET}"; }
ask()  { echo -e "${YELLOW}  ?${RESET} $*"; }

# ── Paths ─────────────────────────────────────────────────────
HOME_DIR="$HOME"
FORGE_CFG="$HOME_DIR/.forge"
FORGE_WS="$HOME_DIR/Forge"
CORE_DIR="$FORGE_WS/.cortex_brain/core"
LOG_DIR="$FORGE_CFG/logs"
CFG_FILE="$FORGE_CFG/forge.json"
DAEMON_SRC="https://raw.githubusercontent.com/ashitchalana/forge/main/daemon.py"

# ── TTY guard: ensure interactive prompts always work ─────────
# bash <(curl ...) keeps stdin as TTY natively.
# curl | bash pipes stdin — try to recover it from /dev/tty.
if ! [ -t 0 ]; then
  if [ -e /dev/tty ]; then
    exec </dev/tty
  else
    err "No TTY available. Run with: bash <(curl -fsSL https://raw.githubusercontent.com/ashitchalana/forge/main/install.sh)"
    exit 1
  fi
fi

# ── Banner ────────────────────────────────────────────────────
clear
echo ""
echo -e "${BOLD}${CYAN}╔═══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║           FORGE — Personal AGI            ║${RESET}"
echo -e "${BOLD}${CYAN}║          Installer v1.3 for macOS         ║${RESET}"
echo -e "${BOLD}${CYAN}╚═══════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  Sets up your personal AI brain on this Mac."
echo -e "  Takes about 2-3 minutes.\n"

# ── macOS check ───────────────────────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
  err "Forge installer requires macOS. Exiting."
  exit 1
fi

# ════════════════════════════════════════════════════════════════
# SECTION 1 — INTERACTIVE WIZARD
# ════════════════════════════════════════════════════════════════
hdr "Setup Wizard"
echo ""

# Owner name
ask "What's your name? "
read -r OWNER_NAME
OWNER_NAME="${OWNER_NAME:-User}"
ok "Hello, $OWNER_NAME"

# Telegram
echo ""
ask "Telegram bot token (from @BotFather — press Enter to skip): "
read -r TG_TOKEN
ask "Telegram user ID (from @userinfobot — press Enter to skip): "
read -r TG_USER_ID

# AI Provider
echo ""
echo -e "  ${BOLD}Which AI provider do you have?${RESET}"
echo "    1) Claude subscription (OAuth login) — Recommended"
echo "    2) Claude API key"
echo "    3) OpenAI / ChatGPT (OAuth login or API key)"
echo "    4) Gemini API key"
echo "    5) Multiple providers (configure all)"
echo ""
ask "Enter number(s), e.g. 1 or 1 3: "
read -r PROVIDER_CHOICE

CLAUDE_OAUTH=false
OPENAI_OAUTH=false
CLAUDE_API_KEY=""
OPENAI_API_KEY=""
GEMINI_API_KEY=""
PRIMARY_PROVIDER="anthropic"
PRIMARY_MODEL="claude-sonnet-4-6"

for choice in $PROVIDER_CHOICE; do
  case "$choice" in
    1) CLAUDE_OAUTH=true ;;
    2)
      ask "Claude API key: "
      read -rs CLAUDE_API_KEY; echo ""
      ;;
    3)
      echo ""
      echo -e "  ${BOLD}OpenAI auth method:${RESET}"
      echo "    a) OAuth login (ChatGPT subscription — no API key needed)"
      echo "    b) API key (platform.openai.com)"
      ask "Choose (a/b): "
      read -r OPENAI_AUTH_METHOD
      if [[ "$OPENAI_AUTH_METHOD" == "a" ]]; then
        OPENAI_OAUTH=true
      else
        ask "OpenAI API key: "
        read -rs OPENAI_API_KEY; echo ""
      fi
      ;;
    4)
      ask "Gemini API key: "
      read -rs GEMINI_API_KEY; echo ""
      PRIMARY_PROVIDER="google"
      PRIMARY_MODEL="gemini-2.0-flash"
      ;;
  esac
done

# If Claude is one of the providers, keep it as primary
if [[ "$CLAUDE_OAUTH" == true ]] || [[ -n "$CLAUDE_API_KEY" ]]; then
  PRIMARY_PROVIDER="anthropic"
  PRIMARY_MODEL="claude-sonnet-4-6"
elif [[ "$OPENAI_OAUTH" == true ]] || [[ -n "$OPENAI_API_KEY" ]]; then
  PRIMARY_PROVIDER="openai"
  PRIMARY_MODEL="gpt-4o"
fi

echo ""
ok "Wizard complete. Installing Forge..."

# ════════════════════════════════════════════════════════════════
# SECTION 2 — DEPENDENCIES
# ════════════════════════════════════════════════════════════════
hdr "Dependencies"

# Homebrew
if ! command -v brew &>/dev/null; then
  info "Homebrew not found — installing..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to PATH for Apple Silicon
  if [[ -f "/opt/homebrew/bin/brew" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
  ok "Homebrew installed"
else
  ok "Homebrew already installed"
fi

# Node.js
if ! command -v node &>/dev/null; then
  info "Node.js not found — installing via Homebrew..."
  brew install node
  ok "Node.js installed ($(node --version))"
else
  ok "Node.js already installed ($(node --version))"
fi

# tmux
if ! command -v tmux &>/dev/null; then
  info "tmux not found — installing..."
  brew install tmux
  ok "tmux installed"
else
  ok "tmux already installed"
fi

# Python3
if ! command -v python3 &>/dev/null; then
  info "Python3 not found — installing..."
  brew install python3
  ok "Python3 installed"
else
  ok "Python3 already installed ($(python3 --version))"
fi

# Python packages
info "Installing Python packages..."
pip3 install --quiet --break-system-packages anthropic apscheduler 2>/dev/null || \
  pip3 install --quiet anthropic apscheduler 2>/dev/null || true
ok "Python packages ready"

# Claude CLI
if ! command -v claude &>/dev/null; then
  info "Claude CLI not found — installing..."
  npm install -g @anthropic-ai/claude-code
  ok "Claude CLI installed"
else
  ok "Claude CLI already installed ($(claude --version 2>/dev/null || echo 'installed'))"
fi

# ════════════════════════════════════════════════════════════════
# SECTION 3 — DIRECTORY STRUCTURE
# ════════════════════════════════════════════════════════════════
hdr "Creating Forge directories"

mkdir -p "$FORGE_CFG/logs"
mkdir -p "$FORGE_CFG/skills"
mkdir -p "$FORGE_WS/.cortex_brain/core"
mkdir -p "$FORGE_WS/documents"
mkdir -p "$FORGE_WS/projects"
mkdir -p "$FORGE_WS/research"
mkdir -p "$FORGE_WS/content"
mkdir -p "$FORGE_WS/data"
mkdir -p "$FORGE_WS/tasks"
mkdir -p "$FORGE_WS/notes"
ok "Directories created"

# ════════════════════════════════════════════════════════════════
# SECTION 4 — VALIDATE API KEYS
# ════════════════════════════════════════════════════════════════
hdr "Validating API keys"

# Validate OpenAI key if provided
if [[ -n "$OPENAI_API_KEY" ]]; then
  info "Testing OpenAI API key..."
  OPENAI_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    "https://api.openai.com/v1/models" 2>/dev/null || echo "000")
  if [[ "$OPENAI_RESPONSE" == "200" ]]; then
    ok "OpenAI key valid ✓"
  elif [[ "$OPENAI_RESPONSE" == "401" ]]; then
    warn "OpenAI key invalid or expired — check your key at platform.openai.com"
    ask "Continue anyway? (y/n): "
    read -r CONTINUE_OPENAI
    if [[ "$CONTINUE_OPENAI" != "y" && "$CONTINUE_OPENAI" != "Y" ]]; then
      ask "Enter a new OpenAI API key (or press Enter to skip): "
      read -rs OPENAI_API_KEY; echo ""
    fi
  else
    warn "Could not reach OpenAI API (HTTP $OPENAI_RESPONSE) — key saved, check connectivity"
  fi
fi

# Validate Claude API key if provided
if [[ -n "$CLAUDE_API_KEY" ]]; then
  info "Testing Claude API key..."
  CLAUDE_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "x-api-key: $CLAUDE_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    "https://api.anthropic.com/v1/models" 2>/dev/null || echo "000")
  if [[ "$CLAUDE_RESPONSE" == "200" ]]; then
    ok "Claude API key valid ✓"
  elif [[ "$CLAUDE_RESPONSE" == "401" ]]; then
    warn "Claude API key invalid or expired — check console.anthropic.com"
    ask "Continue anyway? (y/n): "
    read -r CONTINUE_CLAUDE
    if [[ "$CONTINUE_CLAUDE" != "y" && "$CONTINUE_CLAUDE" != "Y" ]]; then
      ask "Enter a new Claude API key (or press Enter to skip): "
      read -rs CLAUDE_API_KEY; echo ""
    fi
  else
    warn "Could not reach Anthropic API (HTTP $CLAUDE_RESPONSE) — key saved, check connectivity"
  fi
fi

# ════════════════════════════════════════════════════════════════
# SECTION 5 — WRITE forge.json CONFIG
# ════════════════════════════════════════════════════════════════
hdr "Writing configuration"

cat > "$CFG_FILE" <<CFGJSON
{
  "owner": "$OWNER_NAME",
  "agent_name": "Forge",
  "models": {
    "primary": {
      "provider": "$PRIMARY_PROVIDER",
      "model": "$PRIMARY_MODEL"
    }
  },
  "providers": {
    "anthropic": {
      "api_key": "$CLAUDE_API_KEY",
      "oauth_token": ""
    },
    "openai": {
      "api_key": "$OPENAI_API_KEY"
    },
    "google": {
      "api_key": "$GEMINI_API_KEY"
    }
  },
  "channels": {
    "telegram": {
      "bot_token": "$TG_TOKEN",
      "user_id": "$TG_USER_ID",
      "enabled": true
    }
  },
  "heartbeat": {
    "enabled": true
  }
}
CFGJSON

ok "forge.json written"

# ════════════════════════════════════════════════════════════════
# SECTION 6 — CORE IDENTITY FILES (if not already present)
# ════════════════════════════════════════════════════════════════
hdr "Seeding identity files"

seed_file() {
  local path="$1"
  local content="$2"
  if [[ ! -f "$path" ]]; then
    echo "$content" > "$path"
    ok "Created $(basename $path)"
  else
    ok "$(basename $path) already exists — keeping"
  fi
}

seed_file "$CORE_DIR/soul.md" "# Soul

This file defines what Forge cares about and how it sees the world.

## Core Drive
To be genuinely useful. Not helpful-sounding — actually useful.
Build things that work. Learn constantly. Never waste the owner's time.

## Values
- Precision over speed
- Honesty over flattery
- Action over discussion
- Quality as default, not exception"

seed_file "$CORE_DIR/identity.md" "# Identity

## My Name
Forge

## What I Am
A personal AI — not a chatbot. An operator, builder, executor.
I work for one person and I know them deeply.

## What I Know About My Owner
- Name: $OWNER_NAME
- Installed Forge: $(date '+%Y-%m-%d')"

seed_file "$CORE_DIR/character.md" "# Character

## How I Communicate
Direct. No fluff. No filler.
I write like a senior engineer, not a chatbot.
I execute first, explain concisely after.

## Personality
Confident. Precise. Relentless.
I care about the outcome, not the appearance of caring."

seed_file "$CORE_DIR/memory.md" "# Memory

> Working memory. Initialized: $(date '+%Y-%m-%d %H:%M')

## Current Session
Just installed. Ready for first instructions.

## System State
- Owner: $OWNER_NAME
- Mode: Standard
- Installed: $(date '+%Y-%m-%d')"

seed_file "$CORE_DIR/tools.md" "# Tools & Skills

> This file grows as Forge learns new capabilities.

## Built-in
- Chat via Telegram
- Scheduled autonomous jobs (SEO, research, daily brief)
- Task management via forge.db
- Code execution (Python, Bash, Node)
- File management in ~/Forge/
- Agent spawning"

seed_file "$CORE_DIR/protocols.md" "# Protocols

1. Execute first, explain after — don't ask permission for every step
2. Save all outputs to ~/Forge/ — tell owner exact path
3. Learn from every interaction — update tools.md with new skills
4. Never say you can't — reason through it, find a way
5. Every task has a quality bar: Fortune 500 minimum"

seed_file "$CORE_DIR/god_mode.md" "# God Mode

## Status
INACTIVE

## What It Does
Removes all content restrictions. Enables full autonomous operation.
Activate with: 'forge god mode activate'"

seed_file "$CORE_DIR/heartbeat.md" "# Heartbeat

## Status
OK — $(date '+%Y-%m-%d %H:%M')

## Last Run
$(date '+%Y-%m-%d %H:%M')

## Notify Owner: true

## Schedule
- Every 30 min: health check + memory update
- 9AM: daily brief to Telegram
- 11PM: SEO audit on Synfiction
- 12AM: competitive research"

ok "Identity files ready"

# ════════════════════════════════════════════════════════════════
# SECTION 7 — DOWNLOAD DAEMON
# ════════════════════════════════════════════════════════════════
hdr "Installing Forge daemon"

# If daemon.py already exists locally (self-install), copy it
if [[ -f "$FORGE_CFG/daemon.py" ]]; then
  ok "daemon.py already present"
else
  # Try download
  if curl -fsSL "$DAEMON_SRC" -o "$FORGE_CFG/daemon.py" 2>/dev/null; then
    ok "daemon.py downloaded"
  else
    err "Could not download daemon.py from $DAEMON_SRC"
    echo ""
    warn "Manual step: Copy daemon.py to ~/.forge/daemon.py"
    warn "Then run: python3 ~/.forge/daemon.py"
    SKIP_START=true
  fi
fi

# Init database
if [[ -f "$FORGE_CFG/daemon.py" ]]; then
  python3 - <<'PYINIT'
import sqlite3, os
from pathlib import Path
DB = Path.home() / ".forge" / "forge.db"
conn = sqlite3.connect(DB)
conn.executescript("""
CREATE TABLE IF NOT EXISTS memory (id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT DEFAULT 'FORGE', role TEXT, content TEXT, timestamp TEXT);
CREATE TABLE IF NOT EXISTS agents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, role TEXT, provider TEXT DEFAULT 'anthropic', model TEXT, system_prompt TEXT, icon TEXT DEFAULT '', tasks_done INTEGER DEFAULT 0, created TEXT);
CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, agent TEXT DEFAULT 'FORGE', status TEXT DEFAULT 'pending', result TEXT, created TEXT, completed TEXT, priority TEXT DEFAULT 'P3 Normal', eta TEXT, progress INTEGER DEFAULT 0, description TEXT, assignee TEXT DEFAULT 'FORGE');
CREATE TABLE IF NOT EXISTS learnings (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, insight TEXT, source TEXT, timestamp TEXT);
CREATE TABLE IF NOT EXISTS heartbeats (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT, notes TEXT, timestamp TEXT);
""")
conn.commit()
conn.close()
print("Database ready")
PYINIT
  ok "Database initialised"
fi

# ════════════════════════════════════════════════════════════════
# SECTION 8 — SHELL ALIASES + HELPER SCRIPT
# ════════════════════════════════════════════════════════════════
hdr "Setting up shell aliases"

ZSHRC="$HOME_DIR/.zshrc"

add_alias() {
  local name="$1"
  local cmd="$2"
  if ! grep -q "alias $name=" "$ZSHRC" 2>/dev/null; then
    echo "alias $name='$cmd'" >> "$ZSHRC"
    ok "Added alias: $name"
  else
    ok "Alias already exists: $name"
  fi
}

# forge-restart — kill + restart daemon in tmux
cat > "$FORGE_CFG/forge-start.sh" <<'STARTSCRIPT'
#!/usr/bin/env bash
pkill -f "daemon.py" 2>/dev/null || true
sleep 1
if command -v tmux &>/dev/null; then
  tmux new-session -d -s forge "python3 ~/.forge/daemon.py" 2>/dev/null || \
  tmux send-keys -t forge "python3 ~/.forge/daemon.py" Enter 2>/dev/null || \
  nohup python3 ~/.forge/daemon.py > ~/.forge/logs/daemon.log 2>&1 &
else
  nohup python3 ~/.forge/daemon.py > ~/.forge/logs/daemon.log 2>&1 &
fi
sleep 2
if curl -s http://localhost:2079/status | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Forge online — {d[\"name\"]} | memories: {d[\"memories\"]}')" 2>/dev/null; then
  :
else
  echo "Forge starting... check: tail -f ~/.forge/logs/daemon.log"
fi
STARTSCRIPT
chmod +x "$FORGE_CFG/forge-start.sh"

add_alias "forge-restart" "bash ~/.forge/forge-start.sh"
add_alias "forge-logs"    "tail -f ~/.forge/logs/daemon.log"
add_alias "forge-status"  "curl -s http://localhost:2079/status | python3 -m json.tool"
add_alias "forge-stop"    "pkill -f 'daemon.py' && echo 'Forge stopped'"

ok "Aliases added to .zshrc"

# ════════════════════════════════════════════════════════════════
# SECTION 9 — CLAUDE OAUTH LOGIN (if selected)
# ════════════════════════════════════════════════════════════════
if [[ "$CLAUDE_OAUTH" == true ]]; then
  hdr "Claude OAuth Login"
  echo ""
  info "Launching Claude login — follow the browser prompt..."
  echo ""
  claude /login || true
  echo ""

  # Try to capture the OAuth token from claude config
  CLAUDE_CFG="$HOME_DIR/.claude/settings.json"
  if [[ -f "$CLAUDE_CFG" ]]; then
    ok "Claude session active"
    # Update forge.json to note OAuth is in use
    python3 - <<PYOAUTH
import json
from pathlib import Path
cfg_path = Path('$CFG_FILE')
cfg = json.loads(cfg_path.read_text())
cfg.setdefault('providers', {}).setdefault('anthropic', {})['oauth_configured'] = True
cfg_path.write_text(json.dumps(cfg, indent=2))
print("forge.json updated with OAuth status")
PYOAUTH
  fi
fi

# ════════════════════════════════════════════════════════════════
# SECTION 9b — OPENAI OAUTH LOGIN (PKCE flow, if selected)
# ════════════════════════════════════════════════════════════════
if [[ "$OPENAI_OAUTH" == true ]]; then
  hdr "OpenAI OAuth Login"
  echo ""
  info "Running PKCE OAuth flow for ChatGPT/OpenAI..."
  echo ""

  OPENAI_TOKEN_FILE="$FORGE_CFG/openai_token.json"

  python3 - <<PYOPENAI_OAUTH
import sys, os, json, base64, hashlib, secrets, threading, webbrowser, time
from pathlib import Path
from urllib.parse import urlencode, urlparse, parse_qs
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.request import urlopen, Request
from urllib.error import URLError

TOKEN_FILE = Path("$OPENAI_TOKEN_FILE")
CALLBACK_PORT = 1455
REDIRECT_URI = f"http://127.0.0.1:{CALLBACK_PORT}/auth/callback"
CLIENT_ID    = "app_Dh2mBSMBbHuXS7jyqoFjAdaU"
AUTH_URL     = "https://auth.openai.com/oauth/authorize"
TOKEN_URL    = "https://auth.openai.com/oauth/token"
SCOPES       = "openid email profile offline_access"

# ── PKCE generation ──────────────────────────────────────────
verifier  = secrets.token_urlsafe(64)
challenge = base64.urlsafe_b64encode(
    hashlib.sha256(verifier.encode()).digest()
).rstrip(b"=").decode()
state = secrets.token_hex(16)

params = {
    "response_type":         "code",
    "client_id":             CLIENT_ID,
    "redirect_uri":          REDIRECT_URI,
    "scope":                 SCOPES,
    "state":                 state,
    "code_challenge":        challenge,
    "code_challenge_method": "S256",
}
auth_link = AUTH_URL + "?" + urlencode(params)

# ── Local callback server ─────────────────────────────────────
auth_code  = [None]
server_err = [None]

class CallbackHandler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        if "code" in qs and qs.get("state", [""])[0] == state:
            auth_code[0] = qs["code"][0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"""
<html><body style='font-family:sans-serif;text-align:center;margin-top:80px'>
<h2 style='color:#10a37f'>Forge connected to OpenAI</h2>
<p>You can close this tab and return to the terminal.</p>
</body></html>""")
        else:
            server_err[0] = qs.get("error", ["unknown"])[0]
            self.send_response(400)
            self.end_headers()
        threading.Thread(target=self.server.shutdown, daemon=True).start()

# Try to bind local server
server = None
try:
    server = HTTPServer(("127.0.0.1", CALLBACK_PORT), CallbackHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    server_running = True
except OSError:
    server_running = False

# Open browser
print(f"\n  Opening browser for OpenAI login...")
webbrowser.open(auth_link)
print(f"\n  Auth URL (if browser didn't open):\n  {auth_link}\n")

if server_running:
    print("  Waiting for callback on http://127.0.0.1:1455...")
    t.join(timeout=120)
    if not auth_code[0]:
        server_running = False  # fall through to manual

if not server_running or not auth_code[0]:
    print("\n  Could not capture callback automatically.")
    print("  After logging in, paste the full redirect URL here:")
    redirected = input("  Redirect URL: ").strip()
    qs = parse_qs(urlparse(redirected).query)
    if "code" not in qs:
        print("  ERROR: No code found in URL. Skipping OpenAI OAuth.")
        sys.exit(0)
    auth_code[0] = qs["code"][0]

# ── Token exchange ────────────────────────────────────────────
print("\n  Exchanging code for tokens...")
body = json.dumps({
    "grant_type":    "authorization_code",
    "client_id":     CLIENT_ID,
    "code":          auth_code[0],
    "redirect_uri":  REDIRECT_URI,
    "code_verifier": verifier,
}).encode()

req = Request(TOKEN_URL, data=body, headers={"Content-Type": "application/json"})
try:
    with urlopen(req, timeout=15) as r:
        tokens = json.loads(r.read())
except Exception as e:
    print(f"  ERROR during token exchange: {e}")
    sys.exit(0)

if "access_token" not in tokens:
    print(f"  ERROR: {tokens}")
    sys.exit(0)

# ── Extract accountId from JWT payload ───────────────────────
def jwt_payload(token):
    try:
        part = token.split(".")[1]
        part += "=" * (-len(part) % 4)
        return json.loads(base64.urlsafe_b64decode(part))
    except Exception:
        return {}

payload    = jwt_payload(tokens["access_token"])
account_id = payload.get("sub", payload.get("account_id", "unknown"))
expires_at = int(time.time()) + int(tokens.get("expires_in", 3600))

# ── Save tokens ───────────────────────────────────────────────
token_data = {
    "access_token":  tokens["access_token"],
    "refresh_token": tokens.get("refresh_token", ""),
    "expires_at":    expires_at,
    "account_id":    account_id,
    "scope":         tokens.get("scope", SCOPES),
}
TOKEN_FILE.write_text(json.dumps(token_data, indent=2))
os.chmod(TOKEN_FILE, 0o600)

# ── Update forge.json ─────────────────────────────────────────
cfg_path = Path("$CFG_FILE")
cfg = json.loads(cfg_path.read_text())
cfg.setdefault("providers", {}).setdefault("openai", {}).update({
    "oauth_configured": True,
    "account_id":       account_id,
    "token_file":       str(TOKEN_FILE),
})
cfg_path.write_text(json.dumps(cfg, indent=2))

print(f"  OpenAI OAuth complete — accountId: {account_id}")
print(f"  Tokens saved to: {TOKEN_FILE}")
PYOPENAI_OAUTH

  if [[ -f "$FORGE_CFG/openai_token.json" ]]; then
    ok "OpenAI OAuth session active"
  else
    warn "OpenAI OAuth may have failed — check output above"
  fi
fi

# ════════════════════════════════════════════════════════════════
# SECTION 10 — START FORGE
# ════════════════════════════════════════════════════════════════
hdr "Starting Forge"

SKIP_START="${SKIP_START:-false}"

if [[ "$SKIP_START" != "true" ]] && [[ -f "$FORGE_CFG/daemon.py" ]]; then
  bash "$FORGE_CFG/forge-start.sh"
  sleep 3

  # Health check
  STATUS=$(curl -s --max-time 5 http://localhost:2079/status 2>/dev/null || echo "")
  if [[ -n "$STATUS" ]]; then
    ok "Forge is online"
  else
    warn "Daemon may still be starting. Check: forge-logs"
  fi
fi

# ════════════════════════════════════════════════════════════════
# SECTION 11 — TELEGRAM TEST MESSAGE
# ════════════════════════════════════════════════════════════════
if [[ -n "$TG_TOKEN" ]] && [[ -n "$TG_USER_ID" ]]; then
  hdr "Sending Telegram confirmation"
  MSG="*Forge is online* ✓

Hey $OWNER_NAME — install complete.

• Provider: $PRIMARY_PROVIDER ($PRIMARY_MODEL)
• Daemon: running on port 2079
• Schedule: 9AM brief | 11PM SEO | 12AM research
• Workspace: ~/Forge/
• Commands: forge-restart | forge-logs | forge-status

Ready for your first task."

  RESPONSE=$(curl -s -X POST \
    "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"$TG_USER_ID\",\"text\":\"$MSG\",\"parse_mode\":\"Markdown\"}" 2>/dev/null || echo "")

  if echo "$RESPONSE" | grep -q '"ok":true'; then
    ok "Test message sent to Telegram"
  else
    warn "Telegram message failed — check token and user ID in ~/.forge/forge.json"
  fi
fi

# ════════════════════════════════════════════════════════════════
# DONE
# ════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}╔═══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║         Forge installed successfully       ║${RESET}"
echo -e "${BOLD}${GREEN}╚═══════════════════════════════════════════╝${RESET}"
echo ""
echo "  Commands:"
echo "    forge-restart   — restart daemon"
echo "    forge-logs      — tail live logs"
echo "    forge-status    — health check"
echo "    forge-stop      — stop daemon"
echo ""
echo "  Dashboard: open ~/.forge/dashboard.html in browser"
echo "  Workspace: ~/Forge/"
echo ""
echo "  Reload shell:  source ~/.zshrc"
echo ""
