// Reassembles the split modules from their parts.
// Every file in this repo must stay <= 30,000 bytes (GitHub / Arena limit),
// so the four large modules are stored as ordered parts:
//   src/engine/parts/boat.part01.js   ... boat.part05.js   -> src/engine/boat.js
//   src/engine/parts/sea.part01.js    ... sea.part03.js    -> src/engine/sea.js
//   src/game/parts/nets3d.part01.js   ... nets3d.part02.js -> src/game/nets3d.js
//   src/game/parts/world.part01.js    ... world.part02.js  -> src/game/world.js
//   src/game/parts/fish.part01.js     ... fish.part02.js   -> src/game/fish.js
// The generated files are git-ignored. This runs automatically as part of
// `npm run dev`, `npm run build` and `npm run preview` (see package.json).
// Parts are concatenated byte-for-byte with nothing added between them, so
// each generated file is identical to the original module.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIMIT = 30000;
const TARGETS = [
  ["boat", "engine"],
  ["sea", "engine"],
  ["nets3d", "game"],
  ["world", "game"],
  ["fish", "game"],
];

for (const [name, dir] of TARGETS) {
  const partsDir = join(root, "src", dir, "parts");
  const parts = readdirSync(partsDir)
    .filter((f) => f.startsWith(`${name}.part`) && f.endsWith(".js"))
    .sort();
  if (parts.length === 0) throw new Error(`No parts found for ${name} in ${partsDir}`);
  const chunks = parts.map((f) => {
    const p = join(partsDir, f);
    const size = statSync(p).size;
    if (size > LIMIT) throw new Error(`${f} is ${size} bytes, over the ${LIMIT}-byte limit`);
    return readFileSync(p);
  });
  const out = join(root, "src", dir, `${name}.js`);
  const data = Buffer.concat(chunks);
  writeFileSync(out, data);
  console.log(`${name}.js: reassembled ${data.length} bytes from ${parts.length} parts`);
}
