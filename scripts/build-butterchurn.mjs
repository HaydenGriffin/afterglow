import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { gpuTimingSource } from "./butterchurn-source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(new URL("../node_modules/butterchurn/dist/butterchurn.js", import.meta.url), "utf8");
await build({
  stdin: { contents: gpuTimingSource(source) + "\nwindow.butterchurn = Butterchurn;\n", resolveDir: root, sourcefile: "butterchurn-tv.js" },
  bundle: true, format: "iife", target: "chrome68", minify: true, logLevel: "warning",
  outfile: root + "app/vendor/butterchurn.min.js",
});
