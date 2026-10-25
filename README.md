# @fluency-education/scc

A TypeScript library for creating Standard Celeration Charts (SCC): daily
per-minute charts of corrects, errors and record floors, with phases, aims,
learning lines and best fit lines.

## Install

```sh
npm install @fluency-education/scc
```

## Usage

`renderChart` returns the chart as an SVG string, so it runs anywhere,
including on a server. The SVG fills the width of its container.

```ts
import { renderChart } from "@fluency-education/scc";

const svg = renderChart({
  startDate: "2026-09-07",
  // One entry per day from startDate. -1 marks a day with nothing recorded.
  timingSeconds: [60, 60, 60, -1, 60],
  corrects: [12, 15, 14, -1, 18],
  errors: [4, 3, 3, -1, 1],
  phases: [
    { name: "Baseline", endDay: 1 },
    { name: "Practice", aim: 40, celeration: 1.25 },
  ],
});
```

Each day's counts are divided by its timing to plot them per minute. A timing
also sets the day's record floor: one count in that timing.

### Data format

`renderChart` draws the data exactly as given, or throws a `TypeError` or
`RangeError` that names the day and what is wrong with it. It never leaves data
out or guesses what was meant. The rules:

- `corrects`, `errors` and `timingSeconds` hold one entry per day, so the lists
  you pass must all be the same length. `corrects` and `errors` need
  `timingSeconds`.
- `-1` marks a day with nothing recorded, in every list at once: a day with a
  timing has a count in every list, and a day without one has `-1` in all of
  them.
- Counts are whole numbers of 0 or more. Timings are from 0.06 to 60000
  seconds, so the record floor lands on the chart, and no count can be more
  than 1000 per minute.
- Every entry is a number: `null`, `undefined`, `NaN` and strings like `"12"`
  are rejected, so convert data from forms or JSON first.
- The data must fit on the chart's 141 days (fewer with a `startDate` later in
  its week, as the chart starts on the Sunday before).
- Phases end on whole days, in order, on the chart. Aims are from .001 to 1000
  per minute, and celerations are above 0.

### Options

| Option | Description |
|---|---|
| `corrects` | Correct counts, one per day from day 0. `-1` marks a day with nothing recorded. |
| `errors` | Error counts, in the same format as `corrects`. |
| `timingSeconds` | Length of each day's timing in seconds. `-1` marks a day with no timing. |
| `phases` | Consecutive phases from day 0. Each has a `name` and, apart from the last, an `endDay`. A phase can also set an `aim` (count per minute, drawn as a star) and a `celeration` per week (such as `2` for ×2 or `0.5` for ÷2), drawn as a learning line. |
| `startDate` | The date of day 0, as a `Date` or a `"YYYY-MM-DD"` string. With it, the axis and cards show dates and weeks run Sunday to Saturday. |

### Zooming and hover cards

In the browser, put the SVG in the page and pass the element to `enableZoom`
for zoom buttons and drag-to-pan, and to `enableHover` for a card of details
over each mark and line. Each returns a function that undoes it.

```ts
import { enableHover, enableZoom, renderChart } from "@fluency-education/scc";

const container = document.querySelector("#chart")!;
container.innerHTML = renderChart(options);
const chart = container.querySelector("svg")!;
const disableZoom = enableZoom(chart);
const disableHover = enableHover(chart);
```

### Examples

[`examples/index.html`](examples/index.html) shows each of these in a working
page: an empty chart, plotted data, phases with zoom and hover cards, and a chart
that re-renders as its data is edited. To open it, clone this repository and run
`npm run example`.

## Development

```sh
npm install
npm test          # run tests once (vitest)
npm run typecheck # type-check with tsc
npm run build     # compile to dist/ with tsc
npm run preview   # write a sample chart to preview/index.html
npm run example   # serve examples/index.html on a local port
npm run bench     # time dragging and hovering in headless Chrome
```
