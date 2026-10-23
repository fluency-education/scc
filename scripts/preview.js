// Writes preview/index.html with the chart from the compiled build.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { renderChart } from "../dist/index.js";

// Sample timings on weekdays only: 1 minute, then 2 minutes from day 28.
const timingSeconds = Array.from({ length: 60 }, (_, day) =>
  day % 7 === 0 || day % 7 === 6 ? -1 : day < 28 ? 60 : 120,
);
const minutes = (day) => timingSeconds[day] / 60;

// Sample correct counts, building fluency over a few weeks.
const corrects = timingSeconds.map((seconds, day) => {
  if (seconds < 0) return -1;
  if (day === 3 || day === 10) return 0;
  return Math.round(8 * 1.15 ** (day / 7) * (0.85 + ((day * 37) % 10) / 30) * minutes(day));
});

// Sample error counts on the same days, falling as corrects rise.
const errors = timingSeconds.map((seconds, day) =>
  seconds < 0
    ? -1
    : day === 3
      ? 4
      : day === 10
        ? 0
        : Math.max(0, Math.round((6 * 0.8 ** (day / 7) - ((day * 13) % 3)) * minutes(day))),
);

// Sample phases: a baseline week, then practice towards an aim at ×1.25 per week.
const phases = [
  { name: "Baseline", endDay: 6 },
  { name: "Practice", endDay: 34, aim: 20, celeration: 1.25 },
  { name: "Two minute timings", aim: 40, celeration: 1.25 },
];

// The preview opens from disk, where modules cannot be imported, so the zoom
// and hover code is copied into the page as plain scripts.
const pageScript = (file) =>
  readFileSync(new URL(`../dist/${file}`, import.meta.url), "utf8")
    .replace(/^export /gm, "")
    .replace(/^\/\/# sourceMappingURL=.*$/m, "");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Standard Celeration Chart</title>
<style>
body { margin: 2rem; background: #fff; }
main { max-width: 1100px; }
</style>
</head>
<body>
<main>
${renderChart({ corrects, errors, timingSeconds, phases, startDate: "2026-09-06" })}
</main>
<script>
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
writeFileSync("preview/index.html", html);
console.log("Wrote preview/index.html");
