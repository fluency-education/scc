// Writes preview/index.html with the chart from the compiled build.
import { mkdirSync, writeFileSync } from "node:fs";
import { renderChart } from "../dist/index.js";

// Sample timings on weekdays only: 1 minute, then 2 minutes from day 28.
const timingSeconds = Array.from({ length: 60 }, (_, day) =>
  day % 7 === 0 || day % 7 === 6 ? -1 : day < 28 ? 60 : 120,
);
const minutes = (day) => timingSeconds[day] / 60;

// Sample correct counts, building fluency over a few weeks.
const corrects = timingSeconds.map((seconds, day) => {
  if (seconds < 0) return -1;
  if (day === 3) return 0;
  return Math.round(8 * 1.15 ** (day / 7) * (0.85 + ((day * 37) % 10) / 30) * minutes(day));
});

// Sample error counts on the same days, falling as corrects rise.
const errors = timingSeconds.map((seconds, day) =>
  seconds < 0
    ? -1
    : day === 3
      ? 4
      : Math.max(0, Math.round((6 * 0.8 ** (day / 7) - ((day * 13) % 3)) * minutes(day))),
);

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
${renderChart({ corrects, errors, timingSeconds })}
</main>
</body>
</html>
`;

mkdirSync("preview", { recursive: true });
writeFileSync("preview/index.html", html);
console.log("Wrote preview/index.html");
