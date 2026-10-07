import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const packageRoot = dirname(dirname(require.resolve("@supabase/supabase-js")));
const project = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const installed = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
if (installed.version !== project.dependencies["@supabase/supabase-js"])
  throw new Error("Run npm install to match the pinned Supabase version.");
const vendor = join(root, "mobile/app/vendor");
await mkdir(vendor, { recursive: true });
await writeFile(
  join(vendor, "supabase.js"),
  await readFile(join(packageRoot, "dist/umd/supabase.js")),
);
await writeFile(join(vendor, "supabase.LICENSE.txt"), await readFile(join(packageRoot, "LICENSE")));
const env = {
  ...loadEnv(process.env.NODE_ENV || "production", root, [
    "VITE_SUPABASE_",
    "VITE_HOPPER_REPORTS_",
  ]),
  ...process.env,
};
const url = env.VITE_SUPABASE_URL || "";
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || "";
if (publishableKey.startsWith("sb_secret_"))
  throw new Error("Use a publishable key, never a secret key, in the app.");
if (publishableKey.split(".").length === 3) {
  const payload = JSON.parse(Buffer.from(publishableKey.split(".")[1], "base64url").toString());
  if (payload.role !== "anon") throw new Error("Only the anon JWT key may be packaged in the app.");
}
if (url && (!url.startsWith("https://") || !URL.canParse(url)))
  throw new Error("VITE_SUPABASE_URL must be a valid HTTPS URL.");
await writeFile(
  join(root, "mobile/app/sync-config.js"),
  `// Generated public configuration. Never put service_role or secret keys here.\nwindow.HopperCloudConfig = ${JSON.stringify({ url, publishableKey })};\n`,
);
console.log(
  `Supabase ${installed.version} ready locally. Cloud ${url && publishableKey ? "configured" : "awaiting project configuration"}.`,
);

const reportEndpoint = env.VITE_HOPPER_REPORTS_URL || "";
const reportKey = env.VITE_HOPPER_REPORTS_PUBLISHABLE_KEY || "";
if (reportEndpoint && (!URL.canParse(reportEndpoint) || !reportEndpoint.startsWith("https://")))
  throw new Error("VITE_HOPPER_REPORTS_URL must be an HTTPS URL.");
if (reportKey && !reportKey.startsWith("sb_publishable_")) {
  try {
    const payload = JSON.parse(Buffer.from(reportKey.split(".")[1] || "", "base64url").toString());
    if (payload.role !== "anon") throw new Error();
  } catch {
    throw new Error("Use a Supabase publishable/anon key for reports, never a secret key.");
  }
}
await writeFile(
  join(root, "mobile/app/report-config.js"),
  "// Public endpoint only. Mail recipient and credentials stay on the server.\nwindow.HopperReportConfig = " +
    JSON.stringify({ endpoint: reportEndpoint, publishableKey: reportKey }) +
    ";\n",
);
