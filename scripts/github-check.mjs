import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPublishablePath,
  assertSafeContent,
  targetRemote,
  targetUrl,
} from "./github-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function git(args, binary = false) {
  const result = spawnSync("git", args, {
    cwd: root,
    windowsHide: true,
    encoding: binary ? null : "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" },
  });
  if (result.error || result.status !== 0) throw new Error("Verificarea Git a eșuat: " + args[0]);
  return result.stdout;
}

try {
  if (git(["remote", "get-url", "--push", targetRemote]).trim() !== targetUrl) {
    throw new Error("Destinația GitHub diferă de proiectul Hopper.");
  }
  const paths = git(["diff", "--cached", "--no-renames", "--name-only", "--diff-filter=ACMT", "-z"])
    .split("\0")
    .filter(Boolean);
  for (const path of paths) {
    assertPublishablePath(path);
    if (git(["ls-files", "--stage", "-z", "--", path]).startsWith("120000 ")) {
      throw new Error("Verifică manual legătura simbolică: " + path);
    }
    assertSafeContent(path, git(["show", ":" + path], true));
  }
  console.log(
    paths.length
      ? "Verificate " +
          paths.length +
          " fișiere pregătite pentru commit. Tu alegi când faci commit și push."
      : "Nu există fișiere adăugate sau modificate în staging. Folosește git add pentru fișierele pe care vrei să le incluzi.",
  );
} catch (error) {
  console.error("Verificarea fișierelor a fost oprită: " + error.message);
  process.exitCode = 1;
}
