import { watch } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMobile } from "./build-mobile.mjs";
import { androidEnvironment } from "./android-toolchain.mjs";
import {
  liveOptions,
  createLiveServer,
  createRebuilder,
  createAlternatingBuilder,
} from "./live-server.mjs";
import {
  assertPackagedBuild,
  beginLiveSession,
  restoreLiveSession,
  allowIOSLiveNetworking,
  requestLiveStop,
} from "./live-session.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const cap = join(dirname(require.resolve("@capacitor/cli/package.json")), "bin/capacitor");
const options = liveOptions(process.argv.slice(2));

function runNode(file) {
  const child = spawnSync(process.execPath, [join(root, file)], { cwd: root, stdio: "inherit" });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`${file} failed.`);
}

function stopOwnedChild(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else child.kill("SIGINT");
}

async function main() {
  if (options.platform === "stop") {
    await requestLiveStop(root);
    return;
  }
  if (options.platform === "restore") {
    await restoreLiveSession(root);
    console.log("Native configuration restored. Packaged builds are available again.");
    return;
  }
  await assertPackagedBuild(root);
  let env = process.env;
  if (!options.serverOnly) {
    if (options.platform === "android") env = androidEnvironment(root);
    else if (process.platform !== "darwin")
      throw new Error(
        "iOS Live Reload needs a Mac with Xcode. Android Live Reload works on this computer after Android Studio/SDK is installed.",
      );
  }
  runNode("scripts/sync-motion.mjs");
  runNode("scripts/sync-cloud.mjs");
  // The installed debug binary embeds normal local assets; only its temporary URL differs.
  await buildMobile(root);
  runNode("scripts/check-mobile.mjs");
  const initial = await buildMobile(root, "live-a");
  const token = randomUUID();
  const live = createLiveServer(initial, { stopToken: token, onStop: () => stop() });
  let lease = false;
  let watcher;
  let child;
  let childFinished;
  let finish;
  let stopRequested = false;
  const stopped = new Promise((done) => {
    finish = done;
  });
  const stop = () => {
    stopRequested = true;
    finish();
  };
  const rebuilder = createRebuilder(
    createAlternatingBuilder((mode) => buildMobile(root, mode)),
    (bundle) => {
      live.publish(bundle);
      console.log("Live: modificările au fost încărcate în aplicație.");
    },
    (error) =>
      console.error(`Live build failed; the previous interface stays available. ${error.message}`),
  );
  try {
    await beginLiveSession(root, options.platform, options.serverOnly, {
      host: options.host,
      port: options.port,
      token,
    });
    lease = true;
    await new Promise((done, reject) => {
      live.server.once("error", reject);
      live.server.listen(options.port, options.host, done);
    });
    watcher = watch(join(root, "mobile"), { recursive: true }, (_, file) => {
      const path = String(file || "").replaceAll("\\", "/");
      if (path.startsWith("app/vendor/") || path === "app/sync-config.js") return;
      rebuilder.schedule();
    });
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    console.log(
      `Live Reload ready at http://${options.host}:${options.port} (native development only).`,
    );
    console.log(
      "Save files in mobile/ to refresh the installed preview. Stop with Ctrl+C or npm run mobile:live:stop.",
    );
    if (!options.serverOnly) {
      if (options.platform === "ios") await allowIOSLiveNetworking(root);
      const args = [
        cap,
        "run",
        options.platform,
        "--live-reload",
        "--host",
        options.host,
        "--port",
        String(options.port),
      ];
      if (options.platform === "android" && options.host === "127.0.0.1")
        args.push("--forwardPorts", `${options.port}:${options.port}`);
      if (options.target) args.push("--target", options.target);
      child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", env });
      childFinished = new Promise((done) => {
        child.once("error", (error) => {
          console.error(error.message);
          process.exitCode = 1;
          finish();
          done();
        });
        child.once("exit", (code) => {
          if (code && !stopRequested && process.exitCode === undefined) process.exitCode = code;
          finish();
          done();
        });
      });
    } else
      console.log(
        "Server verification mode: no native app was compiled or installed. A browser cannot open the financial interface.",
      );
    await stopped;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    watcher?.close();
    await rebuilder.stop();
    stopOwnedChild(child);
    await childFinished;
    await live.close();
    if (lease) await restoreLiveSession(root, process.pid);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
