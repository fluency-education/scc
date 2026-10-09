// Writes preview/index.html with the chart from the compiled build.
import { mkdirSync, writeFileSync } from "node:fs";
import { renderChart } from "../dist/index.js";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Standard Celeration Chart</title>
<style>body { margin: 2rem; background: #fff; }</style>
</head>
<body>
${renderChart()}
</body>
</html>
`;

mkdirSync("preview", { recursive: true });
writeFileSync("preview/index.html", html);
console.log("Wrote preview/index.html");
