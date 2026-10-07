import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const packageRoot = dirname(require.resolve("animejs/package.json"));
const project = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
const installed = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));

if (installed.version !== project.dependencies.animejs) {
  throw new Error("Anime.js must match the exact version in package.json. Run npm install.");
}

const destination = join(projectRoot, "mobile", "app", "vendor");
await mkdir(destination, { recursive: true });

for (const [source, name] of [
  [join(packageRoot, "dist", "bundles", "anime.umd.min.js"), "anime.umd.min.js"],
  [join(packageRoot, "LICENSE.md"), "anime.LICENSE.txt"],
]) {
  const contents = await readFile(source);
  const target = join(destination, name);
  const previous = await readFile(target).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (!previous?.equals(contents)) await writeFile(target, contents);
}

console.log(`Anime.js ${installed.version} is ready in mobile/app/vendor/.`);
