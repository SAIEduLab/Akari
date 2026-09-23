import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';

const [browser, input, output] = process.argv.slice(2);
if (!browser || !input || !output) {
  console.error("usage: node run-headless-selftest.mjs <browser> <html> <output-json>");
  process.exit(2);
}
if (typeof WebSocket !== "function") {
  console.error("WebSocket is unavailable; run Node with --experimental-websocket when required");
  process.exit(2);
}

if(existsSync(output))throw Error('New evidence output required');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), "akari-selftest-"));
const pageUrl = pathToFileURL(resolve(input)).href + "?selftest=1";
let child;
let socket;

async function waitForDevToolsPort() {
  const file = join(profile, "DevToolsActivePort");
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const lines = (await readFile(file, "utf8")).trim().split(/\r?\n/);
      if (lines[0]) return Number(lines[0]);
    } catch {}
    if (Date.now() >= deadline) throw new Error("Chrome DevTools port was not created");
    await sleep(100);
  }
}

async function waitForPage(port) {
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = pages.find((item) => item.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    if (Date.now() >= deadline) throw new Error("Chrome page target was not created");
    await sleep(100);
  }
}

async function connect(url) {
  return await new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error("CDP websocket connection timed out")), 10000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve(ws);
    }, { once: true });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("CDP websocket connection failed"));
    }, { once: true });
  });
}

function makeCdp(ws) {
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message || "CDP error"));
    else entry.resolve(message.result);
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
}

try {
  child = spawn(browser, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--allow-file-access-from-files",
    "--host-resolver-rules=MAP * 0.0.0.0",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    pageUrl,
  ], { stdio: ["ignore", "ignore", "inherit"] });

  const port = await waitForDevToolsPort();
  socket = await connect(await waitForPage(port));
  const cdp = makeCdp(socket);
  await cdp("Runtime.enable");

  const deadline = Date.now() + 240000;
  let payload = null;
  while (Date.now() < deadline) {
    const result = await cdp("Runtime.evaluate", {
      expression: `(() => {
        const marker = document.documentElement.getAttribute("data-selftest-failed");
        const report = document.getElementById("selfTestReport")?.textContent || null;
        return { marker, report };
      })()`,
      returnByValue: true,
    });
    const value = result?.result?.value;
    if (value?.marker !== null && value?.report) {
      payload = JSON.parse(value.report);
      break;
    }
    await sleep(200);
  }
  if (!payload) throw new Error("Akari self-test did not finish within 240 seconds");

  payload.browser=(await cdp('Browser.getVersion')).product;
  payload.fixtureSha256=createHash('sha256').update(await readFile(input)).digest('hex');
  await writeFile(output, JSON.stringify(payload, null, 2) + "\n", "utf8");
  if(payload.failed)process.exitCode=1;
  console.log(
    `${input}: self-test completed: ${payload.passed} passed, ${payload.failed} failed, ${payload.total} total`,
  );
} finally {
  try { socket?.close(); } catch {}
  try {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await Promise.race([
        exited,
        sleep(2000),
      ]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
    }
  } catch {}
  if(!resolve(profile).startsWith(join(resolve(tmpdir()),'akari-selftest-')))throw Error('Unexpected temporary profile path');
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  }).catch(() => {});
}
