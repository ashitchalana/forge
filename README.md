# Forge

**Your autonomous AI brain. Runs 24/7. Executes while you sleep.**

Most people use AI as a chatbot. Forge is different — it's an agent that thinks, plans, and acts. You give it goals. It gets them done.

---

## Install in 30 seconds

```bash
curl -fsSL https://raw.githubusercontent.com/ashitchalana/forge/main/install.sh | bash
```

One command. Works on Mac. No config files, no API dashboards, no friction.

---

## What makes Forge different

Every AI tool gives you answers. Forge gives you *outcomes*.

It runs as a persistent local daemon — always on, always ready. When you're in meetings, sleeping, or building something else, Forge is working. It holds memory across every conversation. It learns your context over time. It executes multi-step tasks autonomously without needing you to hold its hand.

**Connects to any major AI provider:**
- Anthropic (Claude)
- OpenAI (GPT)
- Google (Gemini)

Switch models in one click. No re-configuration.

---

## Core capabilities

- **Autonomous task execution** — give it a goal, it breaks it down and executes step by step
- **Persistent memory** — remembers context, decisions, and learnings across every session
- **Multi-agent coordination** — spawn parallel agents for independent workstreams
- **Telegram integration** — send it tasks and receive updates from anywhere in the world
- **Health monitoring** — heartbeat checks every 30 minutes, self-reports on issues
- **Mission Control dashboard** — full visibility into tasks, agents, memory, and system health

---

## Mission Control

Open `dashboard.html` in your browser. No server required — connects directly to your local daemon.

Real-time view of everything Forge is doing. Kanban task board, agent status, memory explorer, system metrics. Built to Fortune 500 standard.

---

## Terminal commands

```bash
forge-restart   # restart the daemon
forge-logs      # tail live logs
forge-status    # health check
forge-stop      # stop the daemon
```

---

## Architecture

```
daemon.py        — core brain: HTTP server, memory, task engine, scheduler
install.sh       — one-command Mac installer
dashboard.html   — Mission Control UI
```

Runs on `localhost:2079`. SQLite for local storage. No cloud dependency. Your data stays on your machine.

---

## Who this is for

Founders, operators, and builders who are done with tools that require babysitting.

If you want an AI that runs in the background and gets things done — this is it.

---

*Built to be the last AI setup you ever do.*
