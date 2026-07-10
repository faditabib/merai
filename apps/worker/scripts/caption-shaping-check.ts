// Visual smoke test: rasterize an Arabic caption server-side and save it so
// shaping (connected letterforms, RTL order) can be inspected by a human.
import { writeFileSync } from "node:fs";
import { renderCaptionImages, resolveStyleSpec } from "../src/render/captions";

const OUT = process.argv[2]!;

const line = {
  words: [],
  text: "اليوم رح نجرب رفع الفيديو على منصة ميراي",
  startMs: 0,
  endMs: 3000,
};

const images = renderCaptionImages(
  [{ file: "shaping-check.png", line, startOutMs: 0, endOutMs: 3000 }],
  resolveStyleSpec("minimal-white-bottom"),
  720,
  240, // short strip is enough for inspection
);

writeFileSync(OUT, images[0]!.data);
console.log(`wrote ${OUT} (${images[0]!.data.length} bytes)`);
