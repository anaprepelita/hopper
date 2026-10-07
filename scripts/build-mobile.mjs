import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mobileHTML } from "../mobile/markup.mjs";
import { assertPackagedBuild } from "./live-session.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

async function copyFont(name, weights, destination) {
  const source = dirname(require.resolve(`@fontsource/${name}/package.json`));
  const target = join(destination, name);
  await mkdir(join(target, "files"), { recursive: true });
  await cp(join(source, "LICENSE"), join(target, "LICENSE"));
  for (const weight of weights) {
    const css = await readFile(join(source, `${weight}.css`), "utf8");
    await writeFile(join(target, `${weight}.css`), css);
    for (const match of css.matchAll(/url\(\.\/files\/([^)]*)\)/g)) {
      await cp(join(source, "files", match[1]), join(target, "files", match[1]));
    }
  }
}

export async function buildMobile(root = projectRoot, mode = "packaged") {
  const outputs = {
    packaged: "mobile-dist",
    "live-a": ".mobile-live/a",
    "live-b": ".mobile-live/b",
  };
  if (!Object.hasOwn(outputs, mode)) throw new Error("Invalid mobile build mode.");
  if (mode === "packaged") await assertPackagedBuild(root);
  const destination = resolve(root, outputs[mode]);
  // Only clean this dedicated generated directory, never sources or native projects.
  const parent = mode === "packaged" ? dirname(destination) : dirname(dirname(destination));
  if (parent !== resolve(root)) throw new Error("Invalid mobile output path.");
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const app = join(destination, "app");
  await cp(join(root, "mobile/app"), app, { recursive: true });
  const html = await readFile(join(app, "index.html"), "utf8");
  const entryHTML = (atRoot) => {
    const entry = mobileHTML(html, atRoot);
    return mode === "packaged"
      ? entry
      : entry.replace("</body>", '<script src="hopper-live.js"></script>\n</body>');
  };
  await writeFile(join(app, "index.html"), entryHTML(false));
  await writeFile(join(destination, "index.html"), entryHTML(true));
  if (mode !== "packaged")
    await cp(join(root, "mobile/live-client.js"), join(app, "hopper-live.js"));
  await cp(join(root, "mobile/native.css"), join(app, "native.css"));
  await cp(join(root, "mobile/webview-update.html"), join(app, "webview-update.html"));
  await copyFont("press-start-2p", [400], join(app, "fonts"));
  await copyFont("nunito", [400, 600, 700, 800], join(app, "fonts"));
  const { build } = await import("vite");
  await build({
    configFile: false,
    publicDir: false,
    logLevel: mode === "packaged" ? "info" : "warn",
    build: {
      target: ["chrome105", "safari15.4"],
      outDir: app,
      emptyOutDir: false,
      lib: {
        entry: join(root, "mobile/runtime.ts"),
        name: "HopperNative",
        formats: ["iife"],
        fileName: () => "native-runtime.js",
      },
    },
  });
  if (mode === "packaged")
    console.log("Hopper mobile bundle ready in mobile-dist/ (no development server needed).");
  return destination;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await buildMobile();
}
