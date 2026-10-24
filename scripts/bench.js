// Times dragging a zoomed chart and hovering over its marks in headless Chrome,
// driven through the DevTools protocol. Run with `npm run bench`; set CHROME to
// the browser to use, RUNS to the runs per scenario and CPU_SLOWDOWN to throttle.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { renderChart } from "../dist/index.js";

const CHROME = process.env.CHROME ?? "google-chrome";
const RUNS = Number(process.env.RUNS ?? 7);
const CPU_SLOWDOWN = Number(process.env.CPU_SLOWDOWN ?? 4);

// A full chart: timings and counts every day, and a phase every two weeks.
const timingSeconds = Array.from({ length: 141 }, () => 60);
const corrects = timingSeconds.map((_, day) => Math.round(8 * 1.15 ** (day / 7) * (0.85 + ((day * 37) % 10) / 30)));
const errors = timingSeconds.map((_, day) => Math.max(0, Math.round(6 * 0.8 ** (day / 7) - ((day * 13) % 3))));
const phases = Array.from({ length: 10 }, (_, index) => ({
  name: `Phase ${index + 1}`,
  endDay: index < 9 ? index * 14 + 13 : undefined,
  aim: 40,
  celeration: 1.25,
}));

const pageScript = (file) =>
  readFileSync(new URL(`../dist/${file}`, import.meta.url), "utf8")
    .replace(/^export /gm, "")
    .replace(/^\/\/# sourceMappingURL=.*$/m, "");

// Counts calls that make the browser lay out the page before returning.
const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><style>body { margin: 2rem; } main { max-width: 1100px; }</style></head>
<body>
<main>${renderChart({ corrects, errors, timingSeconds, phases, startDate: "2026-09-06" })}</main>
<script>
window.layoutReads = 0;
for (const [proto, name] of [[Element.prototype, "getBoundingClientRect"], [SVGGraphicsElement.prototype, "getBBox"], [SVGGraphicsElement.prototype, "getScreenCTM"]]) {
  const original = proto[name];
  proto[name] = function (...args) { window.layoutReads++; return original.apply(this, args); };
}
${pageScript("zoom.js")}
${pageScript("hover.js")}
const chart = document.querySelector("main > svg");
enableZoom(chart);
enableHover(chart);
</script>
</body>
</html>
`;

mkdirSync("preview", { recursive: true });
writeFileSync("preview/bench.html", html);
const pageUrl = pathToFileURL("preview/bench.html").href;

const profile = mkdtempSync(join(tmpdir(), "scc-bench-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "--window-size=1200,900",
  "--no-first-run",
  "about:blank",
]);
const port = await new Promise((resolve, reject) => {
  let output = "";
  chrome.stderr.on("data", (chunk) => {
    output += chunk;
    const match = /DevTools listening on ws:\/\/[^:]+:(\d+)/.exec(output);
    if (match) resolve(match[1]);
  });
  chrome.on("exit", () => reject(new Error(`Chrome exited:\n${output}`)));
});
const [target] = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === "page");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve));
let nextId = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  pending.get(message.id)?.(message);
  pending.delete(message.id);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    socket.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;

const METRICS = ["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "LayoutCount", "RecalcStyleCount"];
const metrics = async () => {
  const { metrics } = await send("Performance.getMetrics");
  return Object.fromEntries(metrics.filter(({ name }) => METRICS.includes(name)).map(({ name, value }) => [name, value]));
};
const mouse = (type, x, y, buttons = 0) =>
  send("Input.dispatchMouseEvent", { type, x, y, button: buttons ? "left" : "none", buttons, clickCount: type === "mouseMoved" ? 0 : 1 });

/** Loads a fresh page, runs `scenario` with the browser timing it, and returns the timings. */
async function measure(scenario) {
  await send("Page.navigate", { url: pageUrl });
  while ((await evaluate("document.readyState")) !== "complete");
  // Records the time between frames for the length of the scenario.
  await evaluate(`window.frames_ = []; (function tick(t) { frames_.push(t); requestAnimationFrame(tick); })(performance.now()); new Promise((r) => setTimeout(r, 200))`);
  const before = await metrics();
  const [reads, framesBefore] = await evaluate("[layoutReads, frames_.length]");
  await scenario();
  // Let the last frame draw before reading the totals.
  await evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
  const after = await metrics();
  const [readsAfter, frames] = await evaluate("[layoutReads, frames_]");
  const intervals = frames.slice(framesBefore).map((t, i, all) => (i === 0 ? 0 : t - all[i - 1])).slice(1).sort((a, b) => a - b);
  const delta = Object.fromEntries(METRICS.map((name) => [name, after[name] - before[name]]));
  return {
    "main thread ms": delta.TaskDuration * 1000,
    "script ms": delta.ScriptDuration * 1000,
    "style ms": delta.RecalcStyleDuration * 1000,
    "layout ms": delta.LayoutDuration * 1000,
    layouts: delta.LayoutCount,
    "style recalcs": delta.RecalcStyleCount,
    "layout reads": readsAfter - reads,
    "p95 frame ms": intervals[Math.floor(intervals.length * 0.95)] ?? 0,
  };
}

const zoomIn = () => evaluate(`for (let i = 0; i < 2; i++) document.querySelector(".zoom-in").dispatchEvent(new MouseEvent("click"))`);
const plotCentre = () =>
  evaluate(`(() => { const r = document.querySelector("svg.plot").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);

const scenarios = {
  // A real drag, moving faster than one frame per move, which the browser coalesces.
  async drag() {
    await zoomIn();
    const [cx, cy] = await plotCentre();
    await mouse("mousePressed", cx, cy, 1);
    for (let i = 0; i < 300; i++) {
      const t = (i / 300) * 4 * Math.PI;
      void mouse("mouseMoved", cx + 150 * Math.sin(t), cy + 80 * Math.sin(2 * t), 1);
      if (i % 3 === 2) await new Promise((r) => setTimeout(r, 16));
    }
    await mouse("mouseReleased", cx, cy, 1);
  },
  // Several pointermoves per frame, as when a browser hands them over without coalescing.
  async "drag, 4 moves per frame"() {
    await zoomIn();
    const [cx, cy] = await plotCentre();
    await mouse("mousePressed", cx, cy, 1);
    await evaluate(`new Promise((resolve) => {
      const plot = document.querySelector("svg.plot");
      let frame = 0;
      (function tick() {
        for (let move = 0; move < 4; move++) {
          const t = ((frame * 4 + move) / 400) * 4 * Math.PI;
          plot.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, bubbles: true, clientX: ${cx} + 150 * Math.sin(t), clientY: ${cy} + 80 * Math.sin(2 * t) }));
        }
        if (++frame < 100) requestAnimationFrame(tick); else resolve();
      })();
    })`);
    await mouse("mouseReleased", cx, cy, 1);
  },
  // Sweeps the pointer along the chart, over the marks and lines a little above and below each day.
  async hover() {
    const marks = await evaluate(`[...document.querySelectorAll("svg.plot .mark")].map((mark) => {
      const r = mark.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];
    })`);
    for (const [x, y] of marks) {
      for (const dy of [-1.5, 0, 1.5, 0]) void mouse("mouseMoved", x + dy, y + dy);
      await new Promise((r) => setTimeout(r, 4));
    }
  },
};

await send("Performance.enable");
await send("Page.enable");
await send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
console.log(`Chrome, ${CPU_SLOWDOWN}× CPU slowdown, median of ${RUNS} runs\n`);
for (const [name, scenario] of Object.entries(scenarios)) {
  const runs = [];
  for (let run = 0; run < RUNS; run++) runs.push(await measure(scenario));
  console.log(name);
  for (const key of Object.keys(runs[0])) {
    console.log(`  ${key.padEnd(16)}${median(runs.map((r) => r[key])).toFixed(1).padStart(9)}`);
  }
}

// Close Chrome and let it finish writing its profile before removing it.
const exited = new Promise((resolve) => chrome.on("exit", resolve));
await send("Browser.close").catch(() => {});
await exited;
rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
