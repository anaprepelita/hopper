import { readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMobile } from "./build-mobile.mjs";
import { androidTargets, androidVersion } from "./android-config.mjs";
import { androidEnvironment } from "./android-toolchain.mjs";
import { assertPackagedBuild } from "./live-session.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const android = join(root, "android");
const windows = process.platform === "win32";
const command = (name) => (windows ? `${name}.cmd` : name);

function run(file, args, options = {}) {
  // Windows batch commands use only fixed names/arguments, never credentials or user paths.
  const result = spawnSync(
    windows && /\.(?:cmd|bat)$/.test(file) ? "cmd.exe" : file,
    windows && /\.(?:cmd|bat)$/.test(file) ? ["/d", "/c", file, ...args] : args,
    { cwd: root, stdio: "inherit", ...options },
  );
  if (result.error) throw new Error(`Could not run ${file}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${file} failed; no new artifact was exported.`);
  return result;
}

async function main() {
  const mode = process.argv[2];
  const targets = androidTargets(mode);
  await assertPackagedBuild(root);
  const version = androidVersion(readFileSync(join(android, "version.properties"), "utf8"));
  const env = androidEnvironment(root);
  // Each build refreshes local resources before Capacitor/Gradle packaging.
  run(command("npm"), ["run", "sync:motion"]);
  run(command("npm"), ["run", "sync:cloud"]);
  await buildMobile(root);
  run(process.execPath, [join(root, "scripts/check-mobile.mjs")]);
  run(command("npx"), ["--no-install", "cap", "sync", "android"]);
  for (const target of targets) {
    run(
      windows ? "gradlew.bat" : "./gradlew",
      ["--no-daemon", target.task, `-PhopperDistribution=${target.distribution}`],
      { cwd: android, env },
    );
    const source = join(android, "app/build/outputs", target.source);
    const content = await readFile(source);
    const filename = `hopper-${version.name}-v${version.code}${target.suffix}.${target.extension}`;
    const output = join(root, "artifacts/android");
    const checksum = createHash("sha256").update(content).digest("hex");
    await mkdir(output, { recursive: true });
    await copyFile(source, join(output, filename));
    await writeFile(join(output, `${filename}.sha256`), `${checksum}  ${filename}\n`);
    console.log(
      `Generated: artifacts/android/${filename}${target.suffix ? " (testing only; not for Google Play)" : ""}`,
    );
  }
  console.log("No store upload or public distribution was performed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
