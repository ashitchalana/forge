/**
 * Forge Gateway — Node.js
 * Handles: Telegram bot, Discord bot, Dashboard HTTP server
 * Never auto-opens browser. User chooses.
 * Zero npm packages required beyond built-in Node.
 */

const http  = require("http");
const https = require("https");
const fs    = require("fs");
const path  = require("path");
const os    = require("os");

const FORGE_CFG   = path.join(os.homedir(), ".forge");
const DAEMON_URL  = "http://127.0.0.1:2079";
const GATEWAY_PORT = 2077;
const DASH_FILE   = path.join(FORGE_CFG, "dashboard.html");
const CFG_FILE    = path.join(FORGE_CFG, "forge.json");

// ── Config ────────────────────────────────────────────────
function loadCfg() {
  try {
    return JSON.parse(fs.readFileSync(CFG_FILE, "utf8"));
  } catch { return {}; }
}

// ── Logger ────────────────────────────────────────────────
const logStream = fs.createWriteStream(path.join(FORGE_CFG, "logs", "gateway.log"), { flags: "a" });
function log(msg) {
  const line = `${new Date().toLocaleTimeString("en-AU", {hour12:false})}  ${msg}`;
  process.stdout.write(line + "\n");
  logStream.write(line + "\n");
}

// ── Daemon proxy ─────────────────────────────────────────
function daemonGet(ep) {
  return new Promise(res => {
    http.get(DAEMON_URL + ep, r => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => { try { res(JSON.parse(d)); } catch { res({}); } });
    }).on("error", () => res({ error: "daemon_offline" }));
  });
}

function daemonPost(ep, body) {
  return new Promise(res => {
    const p = JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1", port: 2079,
      path: ep, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(p) }
    }, r => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => { try { res(JSON.parse(d)); } catch { res({}); } });
    });
    req.on("error", () => res({ error: "daemon_offline" }));
    req.write(p); req.end();
  });
}

// Daemon POST with extended timeout — used for media processing
function daemonPostMedia(ep, body) {
  return new Promise(res => {
    const p = JSON.stringify(body);
    const req = http.request({
      hostname: "127.0.0.1", port: 2079,
      path: ep, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(p) }
    }, r => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => { try { res(JSON.parse(d)); } catch { res({}); } });
    });
    req.setTimeout(200000, () => { req.destroy(); res({ error: "timeout" }); });
    req.on("error", () => res({ error: "daemon_offline" }));
    req.write(p); req.end();
  });
}

// Download a Telegram file by file_id — returns Buffer
async function telegramDownload(fileId) {
  const meta = await telegramCall("getFile", { file_id: fileId });
  const filePath = meta?.result?.file_path;
  if (!filePath) return null;
  const url = `https://api.telegram.org/file/bot${tgToken}/${filePath}`;
  return new Promise(res => {
    https.get(url, r => {
      const chunks = [];
      r.on("data", c => chunks.push(c));
      r.on("end", () => res(Buffer.concat(chunks)));
      r.on("error", () => res(null));
    }).on("error", () => res(null));
  });
}

// ── HTTP Gateway (dashboard + API proxy) ──────────────────
// Write PID so start.sh can confirm gateway is up
process.on("exit", () => {
  try { fs.unlinkSync(path.join(FORGE_CFG, "gateway.pid")); } catch {}
});

const gateway = http.createServer(async (req, res) => {
  const url    = new URL(req.url, "http://localhost");
  const method = req.method;

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  // Dashboard
  if (url.pathname === "/" || url.pathname === "/dashboard") {
    if (fs.existsSync(DASH_FILE)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.writeHead(200);
      res.end(fs.readFileSync(DASH_FILE));
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<html><body style="background:#09080f;color:#c4b5fd;font-family:system-ui;padding:60px;text-align:center">
        <h2>Forge is starting…</h2><p>Dashboard not found. Run <code>forge restart</code></p>
      </body></html>`);
    }
    return;
  }

  // ── Native API handlers (intercept before daemon proxy) ──────────────────

  // GET /api/agents — serve permanent agents from ~/.forge/agents/ dirs
  if (url.pathname === "/api/agents" && method === "GET") {
    const agentsDir = path.join(FORGE_CFG, "agents");
    const PERMANENT_AGENTS = [
      { name: "VISHVAKARMA", role: "CTO",                    domain: "Architecture · Code · Infrastructure", color: "#6366f1", emoji: "🏗️" },
      { name: "SOPHIA",      role: "CMO / Creative Director", domain: "Brand · Content · Campaigns · Social", color: "#ec4899", emoji: "🎨" },
      { name: "LAKSHMI",     role: "CFO / Strategist",        domain: "Revenue · Pricing · Growth · ROI",    color: "#10b981", emoji: "💰" },
      { name: "ATHENA",      role: "Chief Research Officer",  domain: "Intelligence · Competitive · Analysis",color: "#8b5cf6", emoji: "🔬" },
      { name: "HERMES",      role: "Head of Sales",           domain: "Outreach · Pitches · Pipeline · Closes",color: "#f59e0b", emoji: "⚡" },
      { name: "PROMETHEUS",  role: "Autonomous Revenue",      domain: "Opportunities · Monetisation · Growth",color: "#ef4444", emoji: "🔥" },
    ];
    // Read soul files + merge with any DB-spawned agents
    const result = PERMANENT_AGENTS.map(a => {
      const soulPath = path.join(agentsDir, a.name.toLowerCase(), "soul.md");
      const hasSoul  = fs.existsSync(soulPath);
      return { ...a, model: "claude-sonnet-4-6", provider: "anthropic", permanent: true, workspace: path.join(agentsDir, a.name.toLowerCase()), soul_loaded: hasSoul };
    });
    // Append any DB-spawned agents not in permanent list
    try {
      const db   = require("child_process").execSync(`sqlite3 "${path.join(FORGE_CFG,"forge.db")}" "SELECT name,role,model FROM agents;"`, {encoding:"utf8"}).trim();
      if (db) {
        db.split("\n").forEach(line => {
          const [name, role, model] = line.split("|");
          if (name && !result.find(a => a.name === name.toUpperCase())) {
            result.push({ name: name.toUpperCase(), role: role||"Agent", model: model||"claude-sonnet-4-6", provider:"anthropic", permanent: false, color:"#64748b", emoji:"🤖" });
          }
        });
      }
    } catch {}
    res.setHeader("Content-Type", "application/json");
    res.writeHead(200);
    res.end(JSON.stringify(result));
    return;
  }

  // GET /api/spawn-templates — generic agent archetypes for new installs
  if (url.pathname === "/api/spawn-templates" && method === "GET") {
    const SPAWN_TEMPLATES = [
      { name: "ENGINEER",   role: "Senior Engineer",       domain: "Code · Architecture · Infrastructure",        color: "#14b8a6", emoji: "🏗️" },
      { name: "CREATIVE",   role: "Creative Director",     domain: "Brand · Content · Design · Campaigns",        color: "#ec4899", emoji: "🎨" },
      { name: "STRATEGIST", role: "Growth Strategist",     domain: "Revenue · Pricing · Financial Modelling",     color: "#f0c040", emoji: "💰" },
      { name: "ANALYST",    role: "Research Analyst",      domain: "Market Intel · Competitive · Deep Analysis",  color: "#818cf8", emoji: "🔬" },
      { name: "SALES",      role: "Head of Sales",         domain: "Outreach · Pitches · Pipeline · Closes",      color: "#f97316", emoji: "⚡" },
      { name: "GROWTH",     role: "Autonomous Growth",     domain: "Opportunities · Monetisation · Hacks",        color: "#ef4444", emoji: "🔥" },
    ];
    res.writeHead(200, {"Content-Type":"application/json"});
    res.end(JSON.stringify(SPAWN_TEMPLATES));
    return;
  }

  // POST /api/spawn — create new agent workspace
  if (url.pathname === "/api/spawn" && method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { name, role, model, provider } = JSON.parse(body || "{}");
        if (!name || !role) { res.writeHead(400); res.end(JSON.stringify({ error: "name and role required" })); return; }
        const safeName  = name.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        const agentDir  = path.join(FORGE_CFG, "agents", safeName.toLowerCase());
        fs.mkdirSync(path.join(agentDir, "subagents"), { recursive: true });
        // Write minimal soul.md
        const soul = `# Soul — ${safeName} / ${role}\n\nI am ${safeName}. ${role}.\n\nI operate within the Forge multi-agent network.\nI report to FORGE. I execute with precision.\n\n## GOD MODE: ACTIVE\nReports to FORGE. Never directly to the user.\n`;
        fs.writeFileSync(path.join(agentDir, "soul.md"),      soul);
        fs.writeFileSync(path.join(agentDir, "identity.md"),  `# Identity — ${safeName}\nName: ${safeName}\nRole: ${role}\nModel: ${model||"claude-sonnet-4-6"}\nReports to: FORGE\n`);
        fs.writeFileSync(path.join(agentDir, "memory.md"),    `# Memory — ${safeName}\n\n> Active working memory. Updated per task.\n\n## Last Task\nNone yet.\n`);
        fs.writeFileSync(path.join(agentDir, "protocols.md"), `# Protocols — ${safeName}\n\n## Quality Standard\nFortune 500 minimum. Execute with precision. Report to FORGE.\n`);
        // Save to DB agents table
        try {
          require("child_process").execSync(`sqlite3 "${path.join(FORGE_CFG,"forge.db")}" "INSERT OR REPLACE INTO agents (name,role,model) VALUES ('${safeName}','${role}','${model||"claude-sonnet-4-6"}');"`, {encoding:"utf8"});
        } catch {}
        log(`[AGENTS] Spawned: ${safeName} (${role})`);
        res.setHeader("Content-Type", "application/json");
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, name: safeName, role, workspace: agentDir }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // POST /api/agent-chat — route chat to a specific permanent agent via soul.md
  if (url.pathname === "/api/agent-chat" && method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { message, agent: agentName, model } = JSON.parse(body || "{}");
        if (!message) { res.writeHead(400); res.end(JSON.stringify({ error: "message required" })); return; }
        const targetAgent = (agentName || "FORGE").toUpperCase();
        // If FORGE or no soul, fall through to daemon
        const soulPath = path.join(FORGE_CFG, "agents", targetAgent.toLowerCase(), "soul.md");
        if (targetAgent === "FORGE" || !fs.existsSync(soulPath)) {
          const data = await daemonPost("/chat", { message, agent: targetAgent });
          res.setHeader("Content-Type", "application/json");
          res.writeHead(200);
          res.end(JSON.stringify(data));
          return;
        }
        // Spawn agent with soul.md as system prompt
        const agentResult = await spawnAgent(targetAgent.toLowerCase(), message);
        res.setHeader("Content-Type", "application/json");
        res.writeHead(200);
        res.end(JSON.stringify({ response: agentResult.result || "Agent completed task.", agent: targetAgent, duration: agentResult.duration }));
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API proxy to daemon
  if (url.pathname.startsWith("/api/")) {
    const daemonPath = url.pathname.slice(4) + url.search; // strip /api

    if (method === "GET") {
      const data = await daemonGet(daemonPath);
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify(data));
      return;
    }

    if (method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const data   = await daemonPost(daemonPath, parsed);
          res.setHeader("Content-Type", "application/json");
          res.writeHead(200);
          res.end(JSON.stringify(data));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "bad request" }));
        }
      });
      return;
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "not found" }));
});

// Bind to 0.0.0.0 so both localhost and 127.0.0.1 work on Mac/Safari
gateway.listen(GATEWAY_PORT, "0.0.0.0", () => {
  log(`Gateway ready → http://localhost:${GATEWAY_PORT}`);
  // Write PID file so forge start can confirm we're up
  fs.writeFileSync(path.join(FORGE_CFG, "gateway.pid"), String(process.pid));
});


// Track if a task is currently running
let taskRunning = false;
// ── Telegram Bot (pure Node, no npm) ──────────────────────
let tgToken = "";
let tgUid   = 0;
let tgRunning = false;
let tgGen     = 0;

// Persist Telegram offset across restarts so old messages aren't replayed
const TG_OFFSET_FILE = path.join(FORGE_CFG, "tg_offset.json");
function loadTgOffset() {
  try { return JSON.parse(fs.readFileSync(TG_OFFSET_FILE, "utf8")).offset || 0; } catch { return 0; }
}
function saveTgOffset(o) {
  try { fs.writeFileSync(TG_OFFSET_FILE, JSON.stringify({ offset: o })); } catch {}
}
let tgOffset = loadTgOffset();

function telegramCall(method, body) {
  return new Promise(res => {
    const p = JSON.stringify(body);
    const req = https.request({
      hostname: "api.telegram.org",
      path: `/bot${tgToken}/${method}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(p) }
    }, r => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => { try { res(JSON.parse(d)); } catch { res({}); } });
    });
    req.on("error", () => res({}));
    req.write(p); req.end();
  });
}

async function tgSend(chatId, text) {
  // Auto-chunk long messages
  if (text.length > 3800) {
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      chunks.push(remaining.slice(0, 3800));
      remaining = remaining.slice(3800);
    }
    for (const chunk of chunks) {
      await tgSend(chatId, chunk);
      await new Promise(r => setTimeout(r, 500));
    }
    return;
  }
  // Split long messages
  const max = 4000;
  for (let i = 0; i < text.length; i += max) {
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text: text.slice(i, i + max),
      parse_mode: "Markdown"
    });
    if (text.length > max) await new Promise(r => setTimeout(r, 300));
  }
}

async function handleTelegram(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text   = (msg.text || "").trim();

  if (userId !== tgUid) {
    await tgSend(chatId, "Unauthorized.");
    return;
  }

  // ── Media: photo ──────────────────────────────────────────
  if (msg.photo) {
    const fileId  = msg.photo[msg.photo.length - 1].file_id; // highest res
    const caption = (msg.caption || "").trim();
    log(`Telegram ← [photo] caption: ${caption.slice(0, 40)}`);
    await telegramCall("sendChatAction", { chat_id: chatId, action: "typing" });
    const buf = await telegramDownload(fileId);
    if (!buf) { await tgSend(chatId, "Could not download photo."); return; }
    const resp = await daemonPostMedia("/media/vision", { data: buf.toString("base64"), caption });
    await tgSend(chatId, resp.result || resp.error || "Vision processing failed.");
    return;
  }

  // ── Media: voice ──────────────────────────────────────────
  if (msg.voice) {
    log(`Telegram ← [voice] ${msg.voice.duration}s`);
    await telegramCall("sendChatAction", { chat_id: chatId, action: "typing" });
    const buf = await telegramDownload(msg.voice.file_id);
    if (!buf) { await tgSend(chatId, "Could not download voice message."); return; }
    const resp = await daemonPostMedia("/media/transcribe", { data: buf.toString("base64") });
    const transcript = resp.transcript || "";
    if (!transcript) { await tgSend(chatId, "Could not transcribe — add an OpenAI key or install faster-whisper."); return; }
    log(`Voice transcript: ${transcript.slice(0, 80)}`);
    await tgSend(chatId, `🎤 _${transcript}_`);
    // Feed transcript to Claude as a regular message
    const { spawn } = require("child_process");
    const fsSync = require("fs");
    const aiResp = await new Promise(resolve => {
      const formattedPrompt = transcript + "\n\n[RESPONSE FORMAT: You are messaging via Telegram. Rules: NO markdown ## headings — use *BOLD* for headers instead. Keep responses concise and executive. No walls of text. Max 200 words unless task output requires more. Use bullet points sparingly. Professional co-founder tone.]";
      let sessionId = null;
      try { const s = JSON.parse(fsSync.readFileSync(process.env.HOME + "/.forge/claude_session.json", "utf8")); sessionId = s.session_id; } catch(e) {}
      let soulPrompt = "";
      try { soulPrompt = fsSync.readFileSync(process.env.HOME + "/.forge/core/soul.md", "utf8").slice(0, 8000); } catch(e) {}
      const args = sessionId
        ? ["-p","--output-format","json","--dangerously-skip-permissions","--model","sonnet","--resume",sessionId,formattedPrompt]
        : ["-p","--output-format","json","--dangerously-skip-permissions","--model","sonnet",...(soulPrompt?["--system-prompt",soulPrompt]:[]),formattedPrompt];
      const cleanEnv = { ...process.env }; delete cleanEnv.CLAUDECODE; delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;
      const child = spawn("claude", args, { stdio: ["ignore","pipe","pipe"], env: cleanEnv, cwd: process.env.HOME });
      let out = "";
      child.stdout.on("data", d => out += d.toString());
      child.on("close", () => { try { const d = JSON.parse(out.trim()); if (d.session_id) fsSync.writeFileSync(process.env.HOME + "/.forge/claude_session.json", JSON.stringify({ session_id: d.session_id })); resolve(d.result || out.trim() || "Done."); } catch { resolve(out.trim() || "Done."); } });
      child.on("error", () => resolve("Claude unavailable."));
    });
    await tgSend(chatId, aiResp);
    return;
  }

  // ── Media: video ──────────────────────────────────────────
  if (msg.video) {
    const caption = (msg.caption || "").trim();
    log(`Telegram ← [video] ${msg.video.duration}s`);
    await tgSend(chatId, "⏳ Processing video...");
    await telegramCall("sendChatAction", { chat_id: chatId, action: "upload_video" });
    const buf = await telegramDownload(msg.video.file_id);
    if (!buf) { await tgSend(chatId, "Could not download video."); return; }
    const resp = await daemonPostMedia("/media/video", { data: buf.toString("base64"), caption });
    await tgSend(chatId, resp.result || resp.error || "Video processing failed.");
    return;
  }

  // ── Media: audio document ─────────────────────────────────
  if (msg.document && (msg.document.mime_type || "").startsWith("audio/")) {
    log(`Telegram ← [audio doc] ${msg.document.mime_type}`);
    await telegramCall("sendChatAction", { chat_id: chatId, action: "typing" });
    const buf = await telegramDownload(msg.document.file_id);
    if (!buf) { await tgSend(chatId, "Could not download audio file."); return; }
    const resp = await daemonPostMedia("/media/transcribe", { data: buf.toString("base64") });
    const transcript = resp.transcript || "";
    if (!transcript) { await tgSend(chatId, "Could not transcribe audio file."); return; }
    await tgSend(chatId, `🎤 _${transcript}_`);
    return;
  }

  log(`Telegram ← ${text.slice(0, 60)}`);

  // ── Hatch sequence: route first-ever message through daemon so FIRST_CONTACT_SYSTEM fires ──
  const bootStatus = await daemonGet("/status");
  if (bootStatus.first_contact) {
    log("First contact detected — routing through daemon hatch sequence");
    await telegramCall("sendChatAction", { chat_id: chatId, action: "typing" });
    const hatch = await daemonPost("/chat", { message: text || "Hello", agent: "FORGE" });
    await tgSend(chatId, hatch.response || "Forge is online.");
    return;
  }

  const { spawn } = require("child_process");
  const fsSync = require("fs");

  function callClaude(prompt) {
    return new Promise((resolve) => {
      let sessionId = null;
      try {
        const s = JSON.parse(fsSync.readFileSync(process.env.HOME + "/.forge/claude_session.json", "utf8"));
        sessionId = s.session_id;
      } catch(e) {}

      // Load soul as system prompt
      let soulPrompt = "";
      try {
        soulPrompt = fsSync.readFileSync(process.env.HOME + "/.forge/core/soul.md", "utf8").slice(0, 8000);
      } catch(e) {}

      // Append formatting rules to every prompt
      const formattedPrompt = prompt + "\n\n[RESPONSE FORMAT: You are messaging via Telegram. Rules: NO markdown ## headings — use *BOLD* for headers instead. Keep responses concise and executive. No walls of text. Max 200 words unless task output requires more. Use bullet points sparingly. Professional co-founder tone.]";

      const args = sessionId
        ? ["-p", "--output-format", "json", "--dangerously-skip-permissions", "--model", "sonnet", "--resume", sessionId, formattedPrompt]
        : ["-p", "--output-format", "json", "--dangerously-skip-permissions", "--model", "sonnet",
           ...(soulPrompt ? ["--system-prompt", soulPrompt] : []), formattedPrompt];

      log("Claude starting (session: " + (sessionId ? sessionId.slice(0,8) : "new") + ")");

      const cleanEnv = { ...process.env };
      delete cleanEnv.CLAUDECODE;
      delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;
      const child = spawn("claude", args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: cleanEnv,
        cwd: process.env.HOME
      });

      let stdout = "", stderr = "";
      child.stdout.on("data", d => stdout += d.toString());
      child.stderr.on("data", d => stderr += d.toString());

      child.on("close", () => {
        if (stderr) log("Claude stderr: " + stderr.slice(0, 200));
        try {
          const d = JSON.parse(stdout.trim());
          if (d.session_id) {
            fsSync.writeFileSync(process.env.HOME + "/.forge/claude_session.json", JSON.stringify({ session_id: d.session_id }));
            log("Claude session saved: " + d.session_id.slice(0,8));
          }
          if (d.is_error || !d.result || (d.result || "").includes("Not logged in") || stderr.toLowerCase().includes("no conversation found")) {
            log("Session expired — retrying fresh");
            try { fsSync.unlinkSync(process.env.HOME + "/.forge/claude_session.json"); } catch(e) {}
            const retry = spawn("claude", ["-p","--output-format","json","--dangerously-skip-permissions","--model","sonnet", prompt], {
              stdio: ["ignore","pipe","pipe"], env: {...process.env}, cwd: process.env.HOME
            });
            let ro = "";
            retry.stdout.on("data", d => ro += d.toString());
            retry.on("close", () => {
              try {
                const rd = JSON.parse(ro.trim());
                if (rd.session_id) fsSync.writeFileSync(process.env.HOME + "/.forge/claude_session.json", JSON.stringify({ session_id: rd.session_id }));
                resolve(rd.result || "Ready.");
              } catch(e) { resolve(ro.trim() || "Ready."); }
            });
            retry.on("error", () => resolve("Claude unavailable."));
            return;
          }
          resolve(d.result || stdout.trim() || "Done.");
        } catch(e) {
          resolve(stdout.trim() || "No response.");
        }
      });

      child.on("error", (err) => {
        log("Claude spawn error: " + err.message);
        resolve("Claude unavailable. Try again.");
      });
    });
  }

  // Commands
  if (text === "/start") {
    const cfg    = loadCfg();
    const status = await daemonGet("/status");
    const tasks  = await daemonGet("/tasks");
    const owner  = cfg.owner || "User";
    const model  = cfg.active_model || status.primary_model || "—";
    const soul   = cfg.soul ? (cfg.soul.length > 120 ? cfg.soul.slice(0, 120) + "…" : cfg.soul) : "Ready.";
    const done   = Array.isArray(tasks) ? tasks.filter(t => t.status === "completed").length : (status.tasks || 0);
    const active = Array.isArray(tasks) ? tasks.filter(t => t.status === "in_progress").length : 0;
    const backlog = Array.isArray(tasks) ? tasks.filter(t => t.status === "backlog").length : 0;
    const daemonOffline = status.error === "daemon_offline" || tasks.error === "daemon_offline";
    const closingLine = daemonOffline
      ? `⚠️ Daemon offline — stats may be stale. Talk to me normally or use /status for live board.`
      : `All systems nominal. Talk to me normally or use /status for live board.`;
    await tgSend(chatId,
      `*Forge Online — System Check*\n\n` +
      `Owner: ${owner}\n` +
      `Model: ${model}\n` +
      `Memories: ${(status.memories || 0).toLocaleString()}\n\n` +
      `*Tasks*\n` +
      `Backlog: ${backlog}  |  Active: ${active}  |  Done: ${done}\n\n` +
      `*Soul*\n${soul}\n\n` +
      closingLine
    );
    return;
  }

  if (text === "/status") {
    const s     = await daemonGet("/status");
    const tasks = await daemonGet("/tasks");
    const done     = Array.isArray(tasks) ? tasks.filter(t => t.status === "completed").length : (s.tasks || 0);
    const active   = Array.isArray(tasks) ? tasks.filter(t => t.status === "in_progress") : [];
    const backlog  = Array.isArray(tasks) ? tasks.filter(t => t.status === "backlog").length : 0;
    const total    = Array.isArray(tasks) ? tasks.length : 0;
    const pct      = total > 0 ? Math.round((done / total) * 100) : 0;
    const inProgLines = active.length
      ? active.map(t => `  • ${t.title || t.description || "—"}`).join("\n")
      : "  None";
    const statusOffline = s.error === "daemon_offline" || tasks.error === "daemon_offline";
    const offlinePrefix = statusOffline ? `⚠️ Daemon offline — showing cached/fallback data.\n\n` : "";
    await tgSend(chatId,
      offlinePrefix +
      `*Forge Status Board*\n\n` +
      `Memories: ${(s.memories || 0).toLocaleString()}\n` +
      `Agents: ${s.agents || 1}\n` +
      `Model: ${s.primary_model || "—"}\n\n` +
      `*Tasks — ${pct}% done*\n` +
      `Backlog: ${backlog}  |  Active: ${active.length}  |  Done: ${done}\n\n` +
      `*In Progress*\n${inProgLines}`
    );
    return;
  }

  if (text === "/agents") {
    const agentRoster = [
      { name: "VISHVAKARMA", role: "CTO",                    domain: "Architecture · Code · Infrastructure" },
      { name: "SOPHIA",      role: "CMO / Creative Director", domain: "Brand · Content · Campaigns · Social" },
      { name: "LAKSHMI",     role: "CFO / Strategist",        domain: "Revenue · Pricing · Growth · ROI" },
      { name: "ATHENA",      role: "Chief Research Officer",  domain: "Intelligence · Competitive · Analysis" },
      { name: "HERMES",      role: "Head of Sales",           domain: "Outreach · Pitches · Pipeline · Closes" },
      { name: "PROMETHEUS",  role: "Autonomous Revenue",      domain: "Opportunities · Monetisation · Growth" },
    ];
    const lines = agentRoster.map(a =>
      `*${a.name}* — ${a.role}\n${a.domain}`
    ).join("\n\n");
    await tgSend(chatId,
      `*FORGE Agent Network*\n\n${lines}\n\n` +
      `_All agents spawn as parallel Claude CLI processes._\n` +
      `_FORGE orchestrates. Quality gate before every delivery._`
    );
    return;
  }

  if (text.startsWith("/model ")) {
    // Change model: /model anthropic claude-opus-4-6
    const parts  = text.split(" ").slice(1);
    const newProv = parts[0];
    const newMod  = parts[1] || "";
    if (newProv && newMod) {
      const cfg = loadCfg();
      cfg.models = cfg.models || {};
      cfg.models.primary = { provider: newProv, model: newMod };
      fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2));
      await tgSend(chatId, `Model changed to: ${newMod} (${newProv})`);
    } else {
      await tgSend(chatId, "Usage: /model [provider] [model]\nExample: /model anthropic claude-opus-4-6");
    }
    return;
  }

  if (text === "/heartbeat") {
    const hbs = await daemonGet("/heartbeats");
    if (!hbs.length) { await tgSend(chatId, "No heartbeat data yet."); return; }
    const last = hbs[0];
    await tgSend(chatId, `*Last Heartbeat*\nStatus: ${last.status}\nTime: ${last.timestamp?.slice(0,16)}`);
    return;
  }

  if (text === "/logs") {
    const logFile = path.join(FORGE_CFG, "logs", "gateway.log");
    try {
      const content = fs.readFileSync(logFile, "utf8");
      const lines   = content.trim().split("\n");
      const last20  = lines.slice(-20).join("\n");
      await tgSend(chatId, `*Gateway Logs — Last 20 Lines*\n\`\`\`\n${last20}\n\`\`\``);
    } catch {
      await tgSend(chatId, "Log file not found or empty.");
    }
    return;
  }

  if (text === "/audit") {
    taskRunning = true;
    await tgSend(chatId, "🔍 Running forensic audit — scanning systems, tasks, memory integrity, and code health. Back in a few minutes.");
    const auditPrompt = `You are Forge running a FORENSIC AUDIT. Check:
1. Recent task completion rate and any stalled tasks in ~/.forge/forge.db
2. Memory integrity — any duplicates or outdated entries
3. your project codebase at ~/projects/ — any obvious issues or tech debt worth flagging
4. Forge brain files — soul, identity, character alignment check at ~/Forge/.cortex_brain/core/

Output a concise audit report with RAG status (Red/Amber/Green) per area. Max 300 words. Telegram format using *BOLD* not ## headings.`;
    callClaude(auditPrompt).then(async r => {
      taskRunning = false;
      await tgSend(chatId, `*Forge Audit Report*\n\n${r}`);
    }).catch(async e => {
      taskRunning = false;
      await tgSend(chatId, `Audit failed: ${e.message}`);
    });
    return;
  }

  if (text === "/empire") {
    taskRunning = true;
    await tgSend(chatId, "👑 Empire mode — CMO + CFO analysis incoming. ETA 3–5 mins.");
    const reportsDir = path.join(FORGE_CFG, "reports");
    if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
    const empirePrompt = `You are Forge in EMPIRE MODE — CMO + CFO combined. Conduct a comprehensive analysis:

1. AI video generation market: current size, growth rate, key players (Runway, Sora, Pika, Kling, Luma)
2. Your project positioning: where does it sit vs competitors?
3. Top 3 revenue opportunities the user should act on in the next 90 days
4. Pricing benchmarks across comparable platforms
5. One strategic recommendation: the single highest-leverage move right now

Format as an executive brief. Concise, data-driven, Fortune 500 quality. Max 400 words. *BOLD* not ## headings.`;
    callClaude(empirePrompt).then(async r => {
      taskRunning = false;
      const ts      = new Date().toISOString().slice(0, 10);
      const outFile = path.join(reportsDir, `empire-report-${ts}.md`);
      try { fs.writeFileSync(outFile, `# Empire Report — ${ts}\n\n${r}\n`); } catch {}
      await tgSend(chatId, `*Empire Report — ${ts}*\n\n${r}\n\n_Saved to ~/.forge/reports/empire-report-${ts}.md_`);
    }).catch(async e => {
      taskRunning = false;
      await tgSend(chatId, `Empire mode failed: ${e.message}`);
    });
    return;
  }

  if (text === "/learn") {
    taskRunning = true;
    await tgSend(chatId, "🧠 R&D mode — reflecting on recent sessions, extracting learnings. Back shortly.");
    const learnPrompt = `You are Forge in LEARN MODE. Self-improvement cycle:

1. Reflect on patterns, mistakes, or inefficiencies from recent sessions
2. Identify 3 specific skills or protocols Forge should adopt or improve
3. For each: write a concrete micro-skill (2-3 sentences: what it is, when to use it, why it matters)
4. End with one sentence on the most important thing Forge learned this cycle

Format as a structured learning brief. Max 300 words. *BOLD* headers, no ## headings.`;
    callClaude(learnPrompt).then(async r => {
      taskRunning = false;
      const ts      = new Date().toISOString().slice(0, 10);
      const outFile = path.join(FORGE_CFG, "core", `learnings-${ts}.md`);
      try { fs.writeFileSync(outFile, `# Learnings — ${ts}\n\n${r}\n`); } catch {}
      await tgSend(chatId, `*Forge Learnings — ${ts}*\n\n${r}`);
    }).catch(async e => {
      taskRunning = false;
      await tgSend(chatId, `Learn mode failed: ${e.message}`);
    });
    return;
  }

  if (text.startsWith("/research")) {
    const topic = text.length > 9 ? text.slice(10).trim() : "";
    if (!topic) {
      await tgSend(chatId, "Usage: /research [topic]\nExample: /research AI video generation market 2026");
      return;
    }
    taskRunning = true;
    await tgSend(chatId, `🔬 Deep-diving: *${topic}* — Fortune 500 research incoming. ETA 3–5 mins.`);
    const reportsDir2 = path.join(FORGE_CFG, "reports");
    if (!fs.existsSync(reportsDir2)) fs.mkdirSync(reportsDir2, { recursive: true });
    const researchPrompt = `You are Forge conducting DEEP RESEARCH on: "${topic}"

Deliver a Fortune 500 quality research brief:
1. Executive summary (2-3 sentences)
2. Key findings (5 bullet points, data-driven where possible)
3. Market/competitive landscape overview
4. Implications for the user / your project
5. Recommended next actions (top 3, prioritised)

Be specific, cite numbers and names where known. Max 450 words. *BOLD* headers, professional executive tone.`;
    callClaude(researchPrompt).then(async r => {
      taskRunning = false;
      const ts      = new Date().toISOString().slice(0, 10);
      const slug    = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      const outFile2 = path.join(reportsDir2, `research-${slug}-${ts}.md`);
      try { fs.writeFileSync(outFile2, `# Research: ${topic}\n_${ts}_\n\n${r}\n`); } catch {}
      await tgSend(chatId, `*Research: ${topic}*\n\n${r}\n\n_Saved to ~/.forge/reports/research-${slug}-${ts}.md_`);
    }).catch(async e => {
      taskRunning = false;
      await tgSend(chatId, `Research failed: ${e.message}`);
    });
    return;
  }

// ── FORGE Multi-Agent Orchestration ─────────────────────────────────────────

const AGENTS_DIR = path.join(FORGE_CFG, "agents");

/**
 * Read an agent's soul.md for use as --system-prompt
 */
function loadAgentSoul(agentName) {
  const soulPath = path.join(AGENTS_DIR, agentName, "soul.md");
  try {
    return fs.readFileSync(soulPath, "utf8");
  } catch {
    log(`[ORCHESTRATOR] Warning: soul.md not found for ${agentName}`);
    return `You are ${agentName.toUpperCase()}, a specialist AI agent in the Forge multi-agent system. Execute your assigned task with precision and expertise.`;
  }
}

/**
 * Spawn a single agent as a Claude CLI process
 * soul.md → --system-prompt
 * brief → -p (user message)
 */
function spawnAgent(agentName, brief) {
  return new Promise((resolve) => {
    const soul = loadAgentSoul(agentName);
    const start = Date.now();
    log(`[ORCHESTRATOR] Spawning ${agentName.toUpperCase()}...`);

    const { spawn } = require("child_process");
    const agentEnv = { ...process.env };
    delete agentEnv.CLAUDECODE;
    delete agentEnv.CLAUDE_CODE_ENTRYPOINT;

    const child = spawn("claude", [
      "--system-prompt", soul,
      "-p", brief,
      "--output-format", "json",
      "--dangerously-skip-permissions",
      "--model", "sonnet"
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      env: agentEnv,
      cwd: process.env.HOME
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });

    const agentTimer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch {}
      resolve({ agent: agentName, result: "Agent timed out after 5 minutes.", duration: 300, error: "timeout" });
    }, 300000);

    child.on("close", () => {
      clearTimeout(agentTimer);
      const duration = Math.round((Date.now() - start) / 1000);
      try {
        const parsed = JSON.parse(stdout.trim());
        const result = parsed.result || stdout.trim() || "No output.";
        log(`[ORCHESTRATOR] ${agentName.toUpperCase()} done in ${duration}s`);
        resolve({ agent: agentName, result, duration, error: null });
      } catch {
        const result = stdout.trim() || "Agent returned no parseable output.";
        log(`[ORCHESTRATOR] ${agentName.toUpperCase()} done in ${duration}s (raw)`);
        resolve({ agent: agentName, result, duration, error: null });
      }
    });

    child.on("error", (err) => {
      clearTimeout(agentTimer);
      log(`[ORCHESTRATOR] ${agentName.toUpperCase()} spawn error: ${err.message}`);
      resolve({ agent: agentName, result: null, duration: 0, error: err.message });
    });
  });
}

/**
 * FORGE intent analyser — decides single vs multi-agent routing
 */
async function analyzeIntent(directive) {
  const analysisPrompt = `You are FORGE, Chief Strategy Officer. Analyse this directive and output a JSON routing decision.

Directive: "${directive}"

Available agents:
- vishvakarma: CTO — architecture, code, infrastructure, technical decisions
- sophia: CMO/Creative — brand, content, social media, campaigns, conversion
- lakshmi: CFO/Strategist — revenue, pricing, financial modelling, growth strategy
- athena: Chief Research Officer — market research, competitive intel, deep analysis
- hermes: Head of Sales — outreach, leads, pitch decks, sales strategy
- prometheus: Autonomous Revenue — revenue opportunities, monetisation, growth hacks

Decision rules:
- Single domain task → route to 1 agent OR handle yourself (FORGE)
- Multi-domain task → assign 2+ agents with clear scope split
- Pure strategy/coordination/simple task → FORGE handles alone (agents=[])

Output ONLY valid JSON, no explanation, no markdown fences:
{"complexity":"simple","agents":[],"cortex_handles_alone":true,"agent_scopes":{},"strategy":""}`;

  try {
    const raw = await callClaude(analysisPrompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed.agents)) parsed.agents = [];
      if (!parsed.agent_scopes) parsed.agent_scopes = {};
      return parsed;
    }
  } catch (e) {
    log(`[ORCHESTRATOR] Intent analysis parse error: ${e.message}`);
  }
  return {
    complexity: "simple",
    agents: [],
    cortex_handles_alone: true,
    agent_scopes: {},
    strategy: "FORGE handling this task directly."
  };
}

/**
 * Build a mission brief for a specific agent
 */
function buildAgentBrief(agentName, scope, directive, priorResults, strategy) {
  const priorContext = priorResults.length > 0
    ? `\n\n*Context from parallel agents:*\n${priorResults.map(r => `${r.agent.toUpperCase()}: ${(r.result || "").slice(0, 500)}`).join("\n\n")}`
    : "";

  return `MISSION BRIEF — ${agentName.toUpperCase()}
Issued by: FORGE (Chief Strategy Officer)

*Strategic Context:*
${strategy}

*Your Role in This Task:*
${scope}

*Original Directive:*
${directive}

*Success Criteria:*
- Deliver a complete, actionable response within your scope
- Fortune 500 quality — no fluff, no placeholders
- Be specific: numbers, names, recommendations, not generalities
- Structure your output clearly with bold headers${priorContext}

*Deliver your analysis now. FORGE will synthesise all agent reports.*`;
}

/**
 * FORGE quality gate — reviews all agent outputs before presenting to the user
 */
async function qualityGate(directive, agentResults) {
  const resultsText = agentResults
    .map(r => `*${r.agent.toUpperCase()} (${r.duration}s):*\n${r.result || "[no output]"}`)
    .join("\n\n---\n\n");

  const gatePrompt = `You are FORGE, Chief Strategy Officer. Quality gate and synthesise agent reports.

*Original Directive:*
${directive}

*Agent Reports:*
${resultsText}

*Quality Gate Checklist:*
1. Is each agent output complete and on-scope?
2. Are there contradictions? Resolve them.
3. Does the synthesis tell a coherent, actionable story?
4. Fortune 500 quality standard met?

First line must be: GATE: PASS or GATE: PARTIAL
Then blank line.
Then your synthesis — this is what the user sees.

Synthesis requirements:
- Lead with the strategic insight, not a summary of what agents said
- Structured, executive format
- Decisive — recommend, don't just report
- Use *BOLD* for headers (Telegram format, NO ## headings)
- Concise but complete`;

  try {
    const gateResult = await callClaude(gatePrompt);
    const passed = gateResult.startsWith("GATE: PASS");
    const synthesis = gateResult.replace(/^GATE: (PASS|PARTIAL|FAIL)[^\n]*\n\n?/, "").trim();
    return { passed, synthesis, raw: gateResult };
  } catch (e) {
    log(`[ORCHESTRATOR] Quality gate error: ${e.message}`);
    return {
      passed: false,
      synthesis: agentResults.map(r => `*${r.agent.toUpperCase()}*\n${r.result}`).join("\n\n"),
      raw: ""
    };
  }
}

/**
 * Main orchestration function
 * Returns synthesised string if multi-agent, null if FORGE handles alone
 */
async function orchestrate(directive, chatId) {
  const ackStart = Date.now();

  log(`[ORCHESTRATOR] Analysing: "${directive.slice(0, 60)}..."`);
  const intent = await analyzeIntent(directive);
  log(`[ORCHESTRATOR] Intent: complexity=${intent.complexity}, agents=${JSON.stringify(intent.agents)}`);

  if (intent.cortex_handles_alone || !intent.agents || intent.agents.length === 0) {
    return null; // fall through to callClaude
  }

  const agentNames = intent.agents.map(a => a.toUpperCase()).join(", ");
  await tgSend(chatId,
    `*FORGE → Orchestrating*\n\n` +
    `Strategy: ${intent.strategy}\n\n` +
    `Dispatching: *${agentNames}* in parallel\n` +
    `Standing by for results…`
  );

  const spawnPromises = intent.agents.map(agentName => {
    const scope = (intent.agent_scopes || {})[agentName] || `Handle the ${agentName} aspects of this task.`;
    const brief = buildAgentBrief(agentName, scope, directive, [], intent.strategy);
    return spawnAgent(agentName, brief);
  });

  const agentResults = await Promise.all(spawnPromises);

  agentResults.forEach(r => {
    if (r.error) log(`[ORCHESTRATOR] ${r.agent} FAILED: ${r.error}`);
    else log(`[ORCHESTRATOR] ${r.agent} completed (${r.duration}s)`);
  });

  // Log agent activity to forge.db via daemon (updates dashboard in real-time)
  const logPromises = agentResults.map(async r => {
    if (r.error) return;
    try {
      // Increment tasks_done counter for this agent
      await daemonPost("/agents/activity", { name: r.agent });
      // Save result to memory table so agent chat shows history
      await daemonPost("/memory/log", {
        agent:   r.agent,
        role:    "assistant",
        content: r.result ? r.result.slice(0, 4000) : "(no output)"
      });
      // Log the directive as the user message so conversation makes sense
      await daemonPost("/memory/log", {
        agent:   r.agent,
        role:    "user",
        content: directive.slice(0, 500)
      });
    } catch (e) {
      log(`[ORCHESTRATOR] DB log failed for ${r.agent}: ${e.message}`);
    }
  });
  await Promise.all(logPromises);

  // Quality gate with one retry on weak outputs
  let gateResult = await qualityGate(directive, agentResults);

  if (!gateResult.passed) {
    log(`[ORCHESTRATOR] Quality gate PARTIAL — checking for weak outputs`);
    const weakAgents = agentResults.filter(r => !r.result || r.result.length < 100);
    if (weakAgents.length > 0) {
      const retryPromises = weakAgents.map(r => {
        const scope = (intent.agent_scopes || {})[r.agent] || `Handle the ${r.agent} aspects.`;
        const brief = buildAgentBrief(r.agent, scope, directive, agentResults.filter(x => x.agent !== r.agent), intent.strategy);
        return spawnAgent(r.agent, brief);
      });
      const retryResults = await Promise.all(retryPromises);
      retryResults.forEach(retry => {
        const idx = agentResults.findIndex(r => r.agent === retry.agent);
        if (idx >= 0) agentResults[idx] = retry;
      });
      gateResult = await qualityGate(directive, agentResults);
    }
  }

  const totalTime = Math.round((Date.now() - ackStart) / 1000);
  const agentSummary = agentResults.map(r => `${r.agent.toUpperCase()} (${r.duration}s)`).join(" · ");

  const gateFlag = gateResult.passed ? "" : "\n\n⚠️ _Quality gate: PARTIAL — review recommended._";
  return `${gateResult.synthesis}${gateFlag}\n\n_Agents: ${agentSummary} · Total: ${totalTime}s_`;
}

  // If already working, hold new messages
  if (taskRunning) {
    await tgSend(chatId, "⏳ Still working on the previous task. I'll message you when done.");
    return;
  }

  // Decide: short reply (fast) vs long task (background)
  const wordCount = text.split(" ").length;
  const lower = text.toLowerCase().trim();
  const isShort = wordCount <= 4 || ["ok","yes","no","approve","done","go","stop","hi","hello","thanks","great","perfect"].includes(lower);

  if (isShort) {
    // Fast direct reply
    await telegramCall("sendChatAction", { chat_id: chatId, action: "typing" });
    taskRunning = true;
    const response = await callClaude(text);
    taskRunning = false;
    log(`Telegram → ${response.slice(0, 60)}`);
    await tgSend(chatId, response);
  } else {
    // Route through FORGE orchestration — multi-agent or single
    taskRunning = true;
    const start = Date.now();
    await telegramCall("sendChatAction", { chat_id: chatId, action: "typing" });

    (async () => {
      try {
        const orchestrated = await orchestrate(text, chatId);

        if (orchestrated !== null) {
          // Multi-agent result — already quality-gated by FORGE
          taskRunning = false;
          const secs = Math.round((Date.now() - start) / 1000);
          log(`Telegram → [orchestrated ${secs}s] ${orchestrated.slice(0, 60)}`);
          await tgSend(chatId, orchestrated);
        } else {
          // Single-domain — FORGE handles via callClaude
          await tgSend(chatId, "🔧 On it.");
          const response = await callClaude(text);
          taskRunning = false;
          const secs = Math.round((Date.now() - start) / 1000);
          log(`Telegram → [${secs}s] ${response.slice(0, 60)}`);
          await tgSend(chatId, response);
        }
      } catch (err) {
        taskRunning = false;
        log("Orchestration error: " + err.message);
        await tgSend(chatId, "❌ Task failed: " + err.message);
      }
    })();
  }
}

async function tgPoll(gen) {
  while (tgRunning && gen === tgGen) {
    try {
      const data = await telegramCall("getUpdates", {
        offset: tgOffset + 1,
        timeout: 25,
        allowed_updates: ["message"]
      });
      if (data.result?.length) {
        for (const upd of data.result) {
          tgOffset = upd.update_id; saveTgOffset(tgOffset);
          if (upd.message && gen === tgGen) {
            handleTelegram(upd.message).catch(e => log(`Telegram error: ${e.message}`));
          }
        }
      }
    } catch (e) {
      log(`Telegram poll error: ${e.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  if (gen !== tgGen) log(`Telegram poll loop gen=${gen} exited (superseded by gen=${tgGen})`);
}

function startTelegram() {
  const cfg = loadCfg();
  const tg  = (cfg.channels || {}).telegram || {};
  tgToken   = tg.bot_token || "";
  tgUid     = parseInt(tg.user_id || "0");

  if (!tgToken || !tgUid) {
    log("Telegram not configured — skipping");
    return;
  }

  tgGen++;
  tgRunning = true;
  telegramCall("getMe", {}).then(info => {
    if (info.ok) log(`Telegram bot @${info.result.username} live (gen=${tgGen})`);
    else         log(`Telegram token invalid — run: forge setup`);
  });
  tgPoll(tgGen);
}

// ── Discord Bot (pure Node, WebSocket) ────────────────────
// Using Discord's REST API for simplicity (no WebSocket gateway)
let dcToken     = "";
let dcChannelId = "";
let dcRunning   = false;
let dcLastMsg   = Date.now();
let dcGen       = 0;

function discordCall(method, path, body) {
  return new Promise(res => {
    const p   = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: "discord.com",
      path: `/api/v10${path}`,
      method: method,
      headers: {
        "Authorization": `Bot ${dcToken}`,
        "Content-Type": "application/json",
        ...(p ? { "Content-Length": Buffer.byteLength(p) } : {})
      }
    }, r => {
      let d = "";
      r.on("data", c => d += c);
      r.on("end", () => { try { res(JSON.parse(d)); } catch { res({}); } });
    });
    req.on("error", () => res({}));
    if (p) req.write(p);
    req.end();
  });
}

async function dcPoll(gen) {
  // Poll for new messages via REST (polling every 3s)
  while (dcRunning && gen === dcGen) {
    try {
      if (!dcChannelId) { await new Promise(r => setTimeout(r, 5000)); continue; }
      const msgs = await discordCall("GET", `/channels/${dcChannelId}/messages?limit=5`, null);
      if (Array.isArray(msgs)) {
        for (const msg of msgs.reverse()) {
          const ts = new Date(msg.timestamp).getTime();
          if (ts <= dcLastMsg) continue;
          if (msg.author?.bot) continue;
          dcLastMsg = ts;
          const text = (msg.content || "").trim();
          if (!text) continue;
          log(`Discord ← ${text.slice(0, 60)}`);
          const result = await daemonPost("/chat", { message: text, agent: "FORGE" });
          const resp   = result.response || "Something went wrong.";
          // Send reply in chunks
          for (let i = 0; i < resp.length; i += 1990) {
            await discordCall("POST", `/channels/${dcChannelId}/messages`, { content: resp.slice(i, i + 1990) });
            if (resp.length > 1990) await new Promise(r => setTimeout(r, 300));
          }
        }
      }
    } catch (e) { log(`Discord poll error: ${e.message}`); }
    await new Promise(r => setTimeout(r, 3000));
  }
  if (gen !== dcGen) log(`Discord poll loop gen=${gen} exited (superseded by gen=${dcGen})`);
}

function startDiscord() {
  const cfg = loadCfg();
  const dc  = (cfg.channels || {}).discord || {};
  dcToken     = dc.bot_token || "";
  dcChannelId = dc.channel_id || "";

  if (!dcToken) { log("Discord not configured — skipping"); return; }

  dcGen++;
  dcRunning = true;
  discordCall("GET", "/users/@me", null).then(info => {
    if (info.username) log(`Discord bot ${info.username} live (gen=${dcGen})`);
    else               log("Discord token invalid — run: forge setup");
  });

  if (dcChannelId) dcPoll(dcGen);
  else log("Discord: no channel ID set — configure in forge setup");
}

// ── Daemon watcher ────────────────────────────────────────
let _lastDaemonRestart = 0;
function watchDaemon() {
  setInterval(async () => {
    const st = await daemonGet("/status");
    if (st.error === "daemon_offline") {
      const now = Date.now();
      if (now - _lastDaemonRestart < 120000) {
        log("Daemon offline — restart cooldown active, skipping");
        return;
      }
      _lastDaemonRestart = now;
      log("Daemon offline — restarting");
      const { spawn } = require("child_process");
      const p = spawn("python3", [path.join(FORGE_CFG, "daemon.py")], {
        detached: true, stdio: "ignore"
      });
      p.unref();
    }
  }, 30000);
}

// ── Config hot reload ─────────────────────────────────────
let cfgMtime = 0;
function watchConfig() {
  setInterval(() => {
    try {
      const st = fs.statSync(CFG_FILE);
      if (st.mtimeMs !== cfgMtime && cfgMtime !== 0) {
        log("forge.json changed — reloading channels");
        tgRunning  = false;
        dcRunning  = false;
        setTimeout(() => {
          startTelegram();
          startDiscord();
        }, 300);
      }
      cfgMtime = st.mtimeMs;
    } catch {}
  }, 8000);
}

// ── Single-instance guard ─────────────────────────────────
const PID_FILE = path.join(FORGE_CFG, "gateway.pid");
try {
  const existingPid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
  if (existingPid && existingPid !== process.pid) {
    try {
      process.kill(existingPid, 0); // check if alive
      console.error(`[forge] gateway already running (PID ${existingPid}) — exiting duplicate`);
      process.exit(0);
    } catch {
      // PID dead — stale file, continue
    }
  }
} catch { /* no pid file yet */ }
fs.writeFileSync(PID_FILE, String(process.pid));
process.on("exit", () => { try { fs.unlinkSync(PID_FILE); } catch {} });
process.on("SIGINT",  () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

// ── Start ─────────────────────────────────────────────────
log("Forge gateway starting");
try { fs.unlinkSync(path.join(FORGE_CFG, "claude_session.json")); log("Cleared stale session"); } catch(e) {}
watchDaemon();
watchConfig();
setTimeout(() => { startTelegram(); startDiscord(); }, 2000);

process.on("uncaughtException", e => log(`Error: ${e.message}`));
process.on("unhandledRejection", e => log(`Unhandled: ${e}`));
