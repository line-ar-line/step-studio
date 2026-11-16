import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const source = dirname(require.resolve("occt-import-js"));
const destination = new URL("../public/vendor/", import.meta.url);
await mkdir(destination, { recursive: true });
await Promise.all(
  ["occt-import-js.js", "occt-import-js.wasm"].map((file) =>
    copyFile(join(source, file), new URL(file, destination)),
  ),
);
await copyFile(
  join(source, '..', 'LICENSE.md'),
  new URL('LICENSE-occt-import-js.md', destination),
);
console.log("OpenCascade JS / WASM assets ready (served locally).");
