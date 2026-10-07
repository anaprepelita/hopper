import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { liveOptions } from "./live-server.mjs";

const nativeFiles = {
  android: [
    "android/app/src/main/assets/capacitor.config.json",
    "android/capacitor-cordova-android-plugins/src/main/AndroidManifest.xml",
  ],
  ios: ["ios/App/App/capacitor.config.json", "ios/App/App/Info.plist"],
};
const sessionFile = (root) => join(root, ".mobile-live/session.json");

async function session(root) {
  try {
    return JSON.parse(await readFile(sessionFile(root), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function assertPackagedBuild(root) {
  if (await session(root)) {
    throw new Error(
      "Stop Live Reload with Ctrl+C before building/syncing packaged apps. After an interrupted session, run npm run mobile:live:restore.",
    );
  }
}

export async function beginLiveSession(root, platform, previewOnly = false, control = {}) {
  await mkdir(join(root, ".mobile-live"), { recursive: true });
  const files = [];
  for (const path of previewOnly ? [] : nativeFiles[platform]) {
    try {
      files.push({ path, content: (await readFile(join(root, path))).toString("base64") });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      files.push({ path, content: null });
    }
  }
  await writeFile(
    sessionFile(root),
    JSON.stringify({ ...control, pid: process.pid, platform, files }),
    {
      flag: "wx",
    },
  );
}

export async function requestLiveStop(root) {
  const saved = await session(root);
  if (!saved) {
    console.log("No Live Reload session is running.");
    return;
  }
  if (!saved.token || !saved.host || !saved.port)
    throw new Error(
      "This session has no stop endpoint; use Ctrl+C or restore after its process exits.",
    );
  const target = liveOptions([saved.platform, "--host", saved.host, "--port", String(saved.port)]);
  const response = await fetch(`http://${target.host}:${target.port}/__hopper_live_stop`, {
    method: "POST",
    headers: { "x-hopper-live-token": saved.token },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("The Live Reload server refused the stop request.");
  const end = Date.now() + 15000;
  while (await session(root)) {
    if (Date.now() >= end)
      throw new Error(
        "Live Reload is still finishing its shutdown. Check its terminal before restoring or building.",
      );
    await delay(50);
  }
  console.log("Live Reload stopped; native configuration restored.");
}

export async function restoreLiveSession(root, owner = undefined) {
  const saved = await session(root);
  if (!saved) return;
  if (owner !== saved.pid) {
    let running = false;
    if (!Number.isInteger(saved.pid) || saved.pid < 1)
      throw new Error("Invalid Live Reload session.");
    try {
      process.kill(saved.pid, 0);
      running = true;
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    if (running)
      throw new Error("Live Reload is still running. Stop its terminal with Ctrl+C first.");
  }
  const allowed = nativeFiles[saved.platform];
  if (
    !allowed ||
    !Array.isArray(saved.files) ||
    saved.files.some(({ path }) => !allowed.includes(path))
  ) {
    throw new Error("Invalid native restoration paths; no files were restored.");
  }
  for (const { path, content } of saved.files) {
    const file = join(root, path);
    if (path.endsWith("Info.plist")) {
      // Remove only our marked development permission; preserve concurrent native edits.
      let current;
      try {
        current = await readFile(file, "utf8");
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      const restored = current.replace(
        /\n<!-- HOPPER_LIVE_START -->[\s\S]*?<!-- HOPPER_LIVE_END -->\n/g,
        "",
      );
      if (restored !== current) await writeFile(file, restored);
    } else if (content === null) {
      await rm(file, { force: true });
    } else {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(content, "base64"));
    }
  }
  await rm(sessionFile(root));
}

export async function allowIOSLiveNetworking(root) {
  const file = join(root, "ios/App/App/Info.plist");
  const source = await readFile(file, "utf8");
  if (source.includes("<key>NSAppTransportSecurity</key>")) {
    throw new Error(
      "An existing iOS ATS configuration needs review before enabling HTTP Live Reload.",
    );
  }
  const description = source.includes("<key>NSLocalNetworkUsageDescription</key>")
    ? ""
    : "<key>NSLocalNetworkUsageDescription</key><string>Previzualizare Hopper de pe calculator în timpul dezvoltării.</string>\n";
  const patch = `\n<!-- HOPPER_LIVE_START -->\n<key>NSAppTransportSecurity</key><dict><key>NSAllowsArbitraryLoadsInWebContent</key><true/></dict>\n${description}<!-- HOPPER_LIVE_END -->\n`;
  if (!/<\/dict>\s*<\/plist>\s*$/.test(source)) throw new Error("Invalid iOS Info.plist.");
  await writeFile(file, source.replace(/(<\/dict>\s*<\/plist>\s*)$/, `${patch}$1`));
}
