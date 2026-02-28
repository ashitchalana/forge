# Forge — Personal AGI

Your personal autonomous AI brain that runs 24/7 on your Mac.

## One-command install

```bash
curl -fsSL https://raw.githubusercontent.com/ashitchalana/forge/main/install.sh | bash
```

## What it does
- Runs a local daemon on port 2079
- Connects to Claude, OpenAI, or Gemini
- Sends a daily brief to Telegram at 9AM
- Runs SEO audits nightly at 11PM
- Does competitive research at 12AM
- Heartbeat every 30 minutes

## Files
- `daemon.py` — core brain, HTTP server, scheduler, memory
- `install.sh` — one-command Mac installer
- `dashboard.html` — Mission Control UI (open in browser)

## Commands after install
```bash
forge-restart   # restart daemon
forge-logs      # tail live logs  
forge-status    # health check
forge-stop      # stop daemon
```
