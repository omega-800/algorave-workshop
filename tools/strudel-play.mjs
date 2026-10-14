#!/usr/bin/env node
// strudel-play: plays a strudel snippet through the nvim-strudel server and
// renders the code with a live playhead on top of the elements that are
// currently sounding. Zero dependencies.
//
//   node tools/strudel-play.mjs <snippet-file>
//
// TTY (presenterm +pty): starts/connects to the server, evals the snippet,
// re-renders the code as the playhead moves, keeps the socket open so the
// music keeps playing while you navigate the deck.
// Non-TTY (PDF export): prints a static colored render and exits.

import net from "net";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

// Find the repo root: walk up from the CWD (the presentation app runs us
// from a temp snippet dir whose ancestor is not the repo, so the app also
// exports STRUDEL_SERVER/STRUDEL_LOG_DIR); fall back to this file's location.
function findRepoRoot() {
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, "tools", "nvim-strudel", "server", "dist", "index.js"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const REPO_ROOT = findRepoRoot() || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_ENTRY = process.env.STRUDEL_SERVER || path.join(REPO_ROOT, "tools", "nvim-strudel", "server", "dist", "index.js");
const PORT = parseInt(process.env.STRUDEL_PORT || "37812", 10);
const HOST = process.env.STRUDEL_HOST || "127.0.0.1";
const LOG_DIR =
  process.env.STRUDEL_LOG_DIR ||
  (findRepoRoot() ? path.join(REPO_ROOT, "logs") : path.join(os.tmpdir(), "strudel-play"));

// Catppuccin Mocha (matches the deck theme)
const C = {
  text: "#cdd6f4", sub0: "#bac2de", sub1: "#a6adc8", sub2: "#9399b2", sub3: "#7f849c",
  red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af", blue: "#89b4fa",
  magenta: "#f5c2e7", orange: "#fab387", teal: "#94e2d5", pink: "#f5a97f",
  mauve: "#cba6f7", lavender: "#b4befe", overlay0: "#6c7086", surface1: "#45475a",
};

const hex2rgb = (h) => `${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)}`;
const fg = (h) => `\x1b[38;2;${hex2rgb(h)}m`;
const bg = (h) => `\x1b[48;2;${hex2rgb(h)}m`;
const RESET = "\x1b[0m";

const USAGE = "usage: strudel-play <snippet-file>";

function tokenizeLine(line) {
  const tokens = [];
  const re = /(#.*$)|(\/\/.*$)|("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)*')|(\d+(?:\.\d+)?)|([A-Za-z_$][\w$]*(?=\s*\())|(\.[A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)|([^\sA-Za-z0-9_$])/g;
  const push = (text, color) => {
    if (!text) return;
    if (tokens.length && tokens[tokens.length - 1].color === color) tokens[tokens.length - 1].text += text;
    else tokens.push({ text, color });
  };
  let last = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) push(line.slice(last, m.index), C.text);
    const [, hashComment, slashComment, dq, sq, num, call, method, ident] = m;
    const color = hashComment || slashComment ? C.sub3 : dq ? C.magenta : sq ? C.pink : num ? C.orange : call ? C.blue : method ? C.lavender : ident ? C.text : C.overlay0;
    push(m[0], color);
    last = re.lastIndex;
  }
  if (last < line.length) push(line.slice(last), C.text);
  return tokens;
}

// Server reports 1-based line/col with exclusive end; convert to 0-based
// [start, end) ranges per displayed line.
function activeRanges(codeLines, elements) {
  const ranges = new Map();
  for (const el of elements || []) {
    if (typeof el.startLine !== "number" || typeof el.startCol !== "number") continue;
    const l0 = el.startLine - 1;
    const l1 = (typeof el.endLine === "number" ? el.endLine : el.startLine) - 1;
    for (let l = l0; l <= l1; l++) {
      if (l < 0 || l >= codeLines.length) continue;
      const start = l === l0 ? el.startCol - 1 : 0;
      const end = l === l1 ? el.endCol - 1 : codeLines[l].length;
      if (end <= start) continue;
      if (!ranges.has(l)) ranges.set(l, []);
      ranges.get(l).push([Math.max(0, start), Math.min(codeLines[l].length, end)]);
    }
  }
  return ranges;
}

function colorLine(line, ranges) {
  const n = line.length;
  if (n === 0) return "";
  const inSpan = new Array(n).fill(false);
  for (const [s, e] of ranges || []) for (let i = s; i < e && i < n; i++) inSpan[i] = true;
  let out = "";
  let runText = "";
  let runColor = null;
  let runSpan = false;
  let pos = 0;
  const flush = () => {
    if (!runText) return;
    out += runSpan ? `${bg(C.surface1)}${fg(C.text)}\x1b[1m${runText}${RESET}` : `${fg(runColor)}${runText}${RESET}`;
    runText = "";
  };
  for (const tok of tokenizeLine(line)) {
    for (let i = 0; i < tok.text.length; i++, pos++) {
      const span = inSpan[pos];
      if (runText && (span !== runSpan || (!span && runColor !== tok.color))) flush();
      runSpan = span;
      runColor = tok.color;
      runText += tok.text[i];
    }
  }
  flush();
  return out;
}

function renderFrame(codeLines, ranges, statusText, hasGutter) {
  const lines = [];
  for (let l = 0; l < codeLines.length; l++) {
    const marker = hasGutter && ranges.has(l) ? "▶ " : hasGutter ? "  " : "";
    lines.push(marker + colorLine(codeLines[l], ranges.get(l)));
  }
  lines.push("");
  lines.push(statusText);
  return lines;
}

const PID_FILE = path.join(LOG_DIR, "strudel-server.pid");

// NOTE: never probe the port with a throwaway TCP connection — the server
// auto-shuts-down when its last client disconnects, so a probe that
// connects and closes would kill a freshly spawned server.
function serverRunning() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, "utf8"), 10);
    process.kill(pid, 0);
    return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").includes("dist/index.js");
  } catch {
    return false;
  }
}

function ensureServer() {
  if (!fs.existsSync(SERVER_ENTRY)) {
    console.error(`strudel server not found at ${SERVER_ENTRY}`);
    console.error("run: bash tools/setup-strudel-server.sh   (or: nix develop)");
    process.exit(1);
  }
  fs.mkdirSync(LOG_DIR, { recursive: true });
  if (!serverRunning()) {
    process.stdout.write(`… starting strudel server (first run downloads samples, may take a minute)\r\n`);
    const logFd = fs.openSync(path.join(LOG_DIR, "strudel-server.log"), "a");
    const child = spawn(process.execPath, [SERVER_ENTRY, "--port", String(PORT), "--host", HOST], {
      stdio: ["ignore", logFd, logFd],
      detached: true,
      env: process.env,
    });
    fs.closeSync(logFd);
    fs.writeFileSync(PID_FILE, String(child.pid));
    child.on("close", (code) => {
      if (code !== null && code !== 0) {
        process.stdout.write(`\r\nstrudel server exited early (code ${code}), see logs/strudel-server.log\r\n`);
      }
    });
    child.unref();
  }
}

function connectWithRetry(deadlineMs) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (Date.now() > deadlineMs) {
        reject(new Error(`strudel server did not come up on ${HOST}:${PORT}`));
        return;
      }
      const s = net.connect(PORT, HOST);
      s.once("connect", () => resolve(s));
      s.once("error", () => {
        s.destroy();
        // NOTE: keep this timer REF'd — it is often the only active handle
        // while the server is still starting; an unref'd timer would let
        // the event loop drain and the client would exit silently.
        setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function staticRender(code) {
  const lines = code.replace(/\n$/, "").split("\n");
  for (const line of renderFrame(lines, new Map(), `${fg(C.sub3)}static preview (no audio)${RESET}`, false)) {
    process.stdout.write(line + "\n");
  }
}

async function livePlay(code) {
  const codeLines = code.replace(/\n$/, "").split("\n");
  ensureServer();
  process.stdout.write(`… connecting to strudel server on ${HOST}:${PORT}\r\n`);
  let sock;
  try {
    // The successful connection is the client socket — keep it open for the
    // whole presentation (the server shuts down when the last client leaves).
    sock = await connectWithRetry(Date.now() + 90_000);
  } catch (err) {
    console.error(String(err.message || err));
    console.error(`see ${path.join(LOG_DIR, "strudel-server.log")}`);
    process.exit(1);
  }
  process.stdout.write(`… playing — the music keeps going on other slides; quit the deck to stop\r\n`);

  let status = { playing: false, paused: false, cycle: 0, cps: 0.5 };
  let elements = [];
  let evalError = null;
  let lastDraw = 0;
  let pending = null;
  let frameCount = 0;

  const statusText = () => {
    if (evalError) return `${fg(C.red)}⚠ ${evalError}${RESET}`;
    const icon = status.playing ? `${fg(C.green)}▶` : status.paused ? `${fg(C.yellow)}⏸` : `${fg(C.sub3)}■`;
    return `${icon} ${status.playing ? "playing" : status.paused ? "paused" : "idle"} · cycle ${status.cycle.toFixed(1)} · ${status.cps} cps`;
  };

  const draw = () => {
    pending = null;
    const ranges = activeRanges(codeLines, elements);
    const frame = renderFrame(codeLines, ranges, statusText(), true);
    if (frameCount === 0) {
      process.stdout.write(frame.map((l) => l + "\n").join(""));
      frameCount = frame.length;
    } else {
      let out = `\x1b[${frameCount}A`;
      for (const l of frame) out += `\x1b[2K${l}\r\n`;
      process.stdout.write(out);
    }
    lastDraw = Date.now();
  };

  const queueDraw = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      if (Date.now() - lastDraw >= 80) draw();
      else queueDraw();
    }, 80 - (Date.now() - lastDraw));
    if (typeof pending.unref === "function") pending.unref();
  };

  let buf = "";
  sock.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type === "status") {
        status = msg;
        elements = [];
        queueDraw();
      } else if (msg.type === "active") {
        elements = msg.elements || [];
        status.cycle = msg.cycle ?? status.cycle;
        queueDraw();
      } else if (msg.type === "error") {
        evalError = msg.message || "eval failed";
        queueDraw();
      }
    }
  });
  sock.on("error", (err) => {
    process.stderr.write(`strudel connection error: ${err.message}\n`);
    process.exit(1);
  });
  sock.on("close", () => {
    process.stderr.write("strudel server connection closed\n");
    process.exit(1);
  });
  for (const sig of ["SIGHUP", "SIGTERM", "SIGINT"]) {
    process.on(sig, () => {
      process.stderr.write(`strudel-play: received ${sig}, stopping\n`);
      try { sock.destroy(); } catch {}
      process.exit(0);
    });
  }

  // sock is already connected (connectWithRetry resolved on "connect")
  sock.write(JSON.stringify({ type: "eval", code }) + "\n");
  draw();
  // Keep the process alive until the deck kills us (or the server closes).
  await new Promise(() => {});
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write(USAGE + "\n");
    process.exit(2);
  }
  const code = fs.readFileSync(file, "utf8");
  if (!process.stdout.isTTY) {
    staticRender(code);
    return;
  }
  await livePlay(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
