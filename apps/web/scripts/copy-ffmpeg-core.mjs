// Copies the self-hosted ffmpeg.wasm core into public/ (no CDN dependency).
// Runs via predev/prebuild.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// exports map hides package.json — resolve the entry module instead
// (…/dist/esm/ffmpeg-core.js) and take its directory.
const source = dirname(require.resolve("@ffmpeg/core"));
const target = join(here, "..", "public", "ffmpeg");

mkdirSync(target, { recursive: true });
for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  copyFileSync(join(source, file), join(target, file));
}
console.log("ffmpeg core copied to public/ffmpeg");
