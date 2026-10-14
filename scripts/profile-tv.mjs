#!/usr/bin/env node
// Read-only TV soak telemetry. First forward the TV's debug port over SSH:
// ssh -N -L 127.0.0.1:19998:127.0.0.1:9998 lg-tv
// node scripts/profile-tv.mjs [seconds=600] [output=.dev/profile.jsonl]
// No auth/config/localStorage dumps; the output contains timing and memory only.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const seconds = Number(process.argv[2] || 600);
if (!Number.isFinite(seconds) || seconds < 0) throw new Error("seconds must be a finite non-negative number");
const output = process.argv[3] || ".dev/profile.jsonl";
const endpoint = process.env.TV_DEBUG_URL || "http://127.0.0.1:19998";
const sshHost = process.env.TV_SSH_HOST || "lg-tv";
mkdirSync(dirname(output), { recursive: true });
const write = (data) => appendFileSync(output, JSON.stringify({ at: new Date().toISOString(), ...data }) + "\n", { mode: 0o600 });
const tabs = await (await fetch(endpoint + "/json/list", { signal: AbortSignal.timeout(10000) })).json();
const tab = tabs.find((t) => t.url.endsWith("/net.botworth.vizman/index.html"));
if (!tab) throw new Error("viz-man is not open");
const wsUrl = new URL(tab.webSocketDebuggerUrl);
wsUrl.host = new URL(endpoint).host;
const ws = new WebSocket(wsUrl);
const pending = new Map();
let id = 0;
let connected = false;
let fresh = false;
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const request = pending.get(message.id);
    if (request) {
      clearTimeout(request.timer);
      pending.delete(message.id);
      message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
    }
  } else if (message.method === "Runtime.consoleAPICalled") {
    const text = message.params.args.map((a) => typeof a.value === "string" ? a.value : "").join(" ");
    // These messages contain counters/format only. Do not persist URLs, ids or arbitrary console objects.
    if (/^Sendspin: (sync=|Stream started|Stream ended|WebSocket disconnected|Connection closed|Codec=|cutover)/.test(text)) {
      write({ kind: "audio", fresh, eventAt: new Date(message.params.timestamp).toISOString(), text });
    }
  }
};
ws.onclose = () => {
  connected = false;
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error("TV debug connection closed")); }
  pending.clear();
};
await new Promise((resolve, reject) => { ws.onopen = () => { connected = true; resolve(); }; ws.onerror = reject; });
function call(method, params = {}) {
  if (!connected) return Promise.reject(new Error("TV debug connection closed"));
  return new Promise((resolve, reject) => {
    const next = ++id;
    const timer = setTimeout(() => { pending.delete(next); reject(new Error(method + " timed out")); }, 10000);
    pending.set(next, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: next, method, params }));
  });
}
const processCommand = `for p in $(pidof WebAppMgr); do
  role=main
  case "$(tr '\\000' ' ' < /proc/$p/cmdline)" in *--type=renderer*) role=renderer;; *--type=*) role=other;; esac
  echo "process $p $role"
  grep -E '^VmRSS:|^VmSwap:' /proc/$p/status
done
grep -E '^pswpin |^pswpout ' /proc/vmstat`;
try {
  await call("Runtime.enable");
  fresh = true;
  await call("Performance.enable");
  const start = Date.now();
  do {
    const metrics = await call("Performance.getMetrics");
    const page = await call("Runtime.evaluate", { expression: 'JSON.stringify({hidden:document.hidden,uptimeSec:performance.now()/1000,diagnostics:window.vizmanDiagnostics ? window.vizmanDiagnostics() : null})', returnByValue: true });
    if (page.exceptionDetails) throw new Error("diagnostics evaluation failed");
    const { stdout } = await exec("ssh", ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", sshHost, processCommand], { timeout: 10000 });
    const processes = [];
    let current;
    const swap = {};
    for (const line of stdout.trim().split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === "process") { current = { pid: Number(parts[1]), role: parts[2] }; processes.push(current); }
      else if (parts[0] === "VmRSS:") current.rssKiB = Number(parts[1]);
      else if (parts[0] === "VmSwap:") current.swapKiB = Number(parts[1]);
      else swap[parts[0]] = Number(parts[1]);
    }
    const wanted = ["Timestamp", "TaskDuration", "ScriptDuration", "JSHeapUsedSize", "JSHeapTotalSize", "Nodes", "Documents"];
    const sample = { kind: "sample", elapsedSec: Math.round((Date.now() - start) / 1000), page: JSON.parse(page.result.value),
      metrics: Object.fromEntries(metrics.metrics.filter((m) => wanted.includes(m.name)).map((m) => [m.name, m.value])), processes, swap };
    write(sample);
    console.log(JSON.stringify(sample));
    if (Date.now() - start >= seconds * 1000) break;
    await new Promise((r) => setTimeout(r, Math.min(30000, seconds * 1000 - (Date.now() - start))));
  } while (connected);
} finally {
  if (connected) {
    await call("Performance.disable").catch(() => {});
    await call("Runtime.disable").catch(() => {});
  }
  ws.close();
}
