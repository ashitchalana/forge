# Forge — Personal AGI OS

Forge is a self-hosted autonomous AI operating system. It runs a persistent gateway on your machine, connects to Telegram and Discord, manages tasks, spawns parallel AI agents, and gives you a full Mission Control dashboard.

## What it does

- **Gateway** — Single Node.js process (port 2077) handles all communication
- **Daemon** — Python HTTP server (port 2079) manages memory, tasks, agents, heartbeats
- **Dashboard** — Browser-based Mission Control at `http://localhost:2077`
- **Multi-Agent OS** — Spawn named AI agents with custom roles and identity files
- **CORTEX Orchestrator** — Routes complex tasks to parallel agents, quality-gates output
- **Telegram + Discord** — Full bot integration, voice/image/video support
- **Task Tracker** — Kanban board wired to SQLite, updated in real-time

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/ashitchalana/forge/main/install.sh | bash
```

## Manual Setup

```bash
git clone https://github.com/ashitchalana/forge.git ~/.forge
cd ~/.forge
# Edit forge.json with your API keys and Telegram/Discord tokens
node gateway.js
```

## Agent System

Agents live in `~/.forge/agents/[NAME]/` with 7 identity files each:
- `soul.md` — core identity (used as `--system-prompt`)
- `identity.md` — role and jurisdiction
- `character.md` — tone and communication style
- `tools.md` — capabilities
- `memory.md` — working context
- `god_mode.md` — permissions and hard limits
- `protocols.md` — task execution workflow

Create a new agent via the dashboard Spawn modal or `/spawn` API endpoint.

## Stack

- **Gateway:** Node.js (zero npm dependencies)
- **Daemon:** Python 3 (stdlib only)
- **Dashboard:** Vanilla HTML/CSS/JS
- **AI:** Anthropic Claude, OpenAI GPT (configurable)
- **Storage:** SQLite via `~/.forge/forge.db`
- **Comms:** Telegram Bot API, Discord Bot

## Config

`~/.forge/forge.json` — API keys, model selection, channel tokens. Never committed.

## License

MIT
