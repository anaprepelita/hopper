import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appScripts } from "../mobile/resources.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "mobile-dist");
const files = new Set();
for (const entry of ["index.html", "app/index.html"]) {
  const html = await readFile(join(output, entry), "utf8");
  assert(!html.includes("<iframe"), "Native entry must run the tracker directly.");
  assert(!html.includes("fonts.googleapis.com"), "Native fonts must be local.");
  assert(!html.includes('rel="manifest"'), "There must be no browser install entry.");
  assert(!html.includes("hopper-live.js"), "Live Reload must not be packaged for distribution.");
  assert(
    html.includes('id="native-interface" hidden'),
    "Only the native bootstrap may show the UI.",
  );
  assert.equal([...html.matchAll(/<script src=/g)].length, 1, "Load only the native bootstrap.");
  const base = new URL(entry, "https://localhost/");
  const explicit = html.match(/<base href="([^"]+)"/);
  const effective = explicit ? new URL(explicit[1], base) : base;
  for (const match of html.matchAll(/<(?:script|link|img)[^>]*(?:src|href)="([^"]+)"/g)) {
    const url = new URL(match[1], effective);
    if (url.origin !== base.origin) continue;
    const file = resolve(output, `.${url.pathname}`);
    assert(file.startsWith(output), "An asset escaped the mobile bundle.");
    assert((await stat(file)).isFile(), `Missing packaged resource: ${url.pathname}`);
    files.add(file);
  }
}
for (const css of files) {
  if (!css.endsWith(".css")) continue;
  const contents = await readFile(css, "utf8");
  for (const match of contents.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    if (/^(?:https?:|data:)/.test(match[1])) continue;
    const asset = resolve(dirname(css), match[1]);
    assert((await stat(asset)).isFile(), `Missing font/image referenced by ${css}: ${match[1]}`);
    files.add(asset);
  }
}
for (const { src: name } of appScripts) {
  assert.equal(
    await readFile(join(output, "app", name), "utf8"),
    await readFile(join(root, "mobile/app", name), "utf8"),
    `Packaging changed financial app behavior: ${name}`,
  );
  files.add(join(output, "app", name));
}
await assert.rejects(stat(join(output, "app/manifest.webmanifest")), { code: "ENOENT" });
assert((await stat(join(output, "app/webview-update.html"))).isFile());
console.log(
  `Native entries verified: ${files.size} local resources, unchanged financial scripts, no browser install.`,
);
