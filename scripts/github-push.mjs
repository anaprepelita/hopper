import {
  appendDailyUpdate,
  bucharestMoment,
  journalPath,
  parseStagedChanges,
} from "./github-changelog.mjs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  unlinkSync,
  statSync,
  lstatSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPublishablePath,
  assertSafeContent,
  debounce,
  fingerprint,
  targetRemote,
  targetUrl,
} from "./github-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stateDirectory = join(root, ".github-local");
const stateFile = join(stateDirectory, "debounce.json");
const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" };

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    // Never copy arbitrary command output into public logs: it may contain secrets.
    throw new Error(command + " " + args[0] + " failed; check the command manually.");
  }
  return result.stdout;
}
function git(...args) {
  return run("git", args);
}
function list(...args) {
  return git(...args)
    .split("\0")
    .filter(Boolean);
}

function snapshot() {
  const paths = [
    ...new Set(list("ls-files", "--modified", "--deleted", "--others", "--exclude-standard", "-z")),
  ];
  return paths.map((path) => {
    const absolute = join(root, path);
    if (!existsSync(absolute)) return { path, hash: null };
    assertPublishablePath(path);
    if (lstatSync(absolute).isSymbolicLink() || !statSync(absolute).isFile()) {
      throw new Error("Automatic upload refuses links or non-files: " + path);
    }
    const content = readFileSync(absolute);
    assertSafeContent(path, content);
    return { path, hash: createHash("sha256").update(content).digest("hex") };
  });
}

function assertDestination() {
  if (
    git("rev-parse", "--show-toplevel").trim().replaceAll("\\", "/").toLowerCase() !==
    root.replaceAll("\\", "/").toLowerCase()
  ) {
    throw new Error("Unexpected repository location.");
  }
  if (git("branch", "--show-current").trim() !== "main")
    throw new Error("Automatic upload requires main.");
  if (git("remote", "get-url", "--push", targetRemote).trim() !== targetUrl)
    throw new Error("Unexpected GitHub destination.");
  if (git("config", "user.email").trim() !== "239871390+anaprepelita@users.noreply.github.com")
    throw new Error("Unexpected commit identity.");
  if (existsSync(join(root, ".git/index.lock"))) throw new Error("Git is already working.");
  for (const marker of ["MERGE_HEAD", "REBASE_HEAD", "CHERRY_PICK_HEAD"]) {
    if (existsSync(join(root, ".git", marker)))
      throw new Error("Finish the pending Git operation first.");
  }
  if (git("diff", "--cached", "--name-only").trim())
    throw new Error("Files are already staged; finish your manual commit first.");
}

// Inspect every historical blob before exposing history, including deleted credentials.
function auditHistory() {
  const objects = git("rev-list", "--objects", "HEAD").trim().split("\n");
  const paths = new Map();
  for (const line of objects) {
    const split = line.indexOf(" ");
    if (split > 0) paths.set(line.slice(0, split), line.slice(split + 1));
  }
  const info = git(
    "cat-file",
    "--batch-all-objects",
    "--batch-check=%(objectname) %(objecttype) %(objectsize)",
  )
    .trim()
    .split("\n");
  const blobs = info
    .map((line) => line.split(" "))
    .filter(([id, type]) => paths.has(id) && type === "blob");
  const packed = run("git", ["cat-file", "--batch"], {
    input: blobs.map(([id]) => id).join("\n") + "\n",
    encoding: null,
  });
  let offset = 0;
  for (const [id, , size] of blobs) {
    const path = paths.get(id);
    if (
      /\.(?:keystore|jks|p12|pfx|pem|key|mobileprovision)$/i.test(path) ||
      (/(?:^|\/)(?:\.env(?:\.[^/]*)?|signing\.properties)$/.test(path) && !/\.example$/.test(path))
    ) {
      throw new Error("Private file exists in Git history: " + path);
    }
    if (Number(size) > 20 * 1024 * 1024)
      throw new Error("Large file exists in Git history: " + path);
    const headerEnd = packed.indexOf(10, offset);
    if (
      headerEnd < 0 ||
      packed.subarray(offset, headerEnd).toString("ascii") !== id + " blob " + size
    ) {
      throw new Error("Could not verify a historical Git object.");
    }
    const start = headerEnd + 1;
    const end = start + Number(size);
    if (packed[end] !== 10) throw new Error("Incomplete historical Git object.");
    assertSafeContent(path, packed.subarray(start, end));
    offset = end + 1;
  }
}

function push() {
  auditHistory();
  // A non-fast-forward is rejected by Git; never rewrite remote history.
  git("push", "--set-upstream", targetRemote, "main");
  console.log("Pushed main to " + targetUrl);
}

function saveState(value) {
  writeFileSync(stateFile, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
}

function main() {
  mkdirSync(stateDirectory, { recursive: true });
  const lock = join(stateDirectory, "push.lock");
  // A terminated build may leave this local lock. The scheduled task has a 20-minute limit.
  if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 30 * 60 * 1000) unlinkSync(lock);
  let descriptor;
  try {
    descriptor = openSync(lock, "wx");
  } catch (error) {
    if (error.code === "EEXIST") return;
    throw error;
  }
  try {
    assertDestination();
    const changes = snapshot();
    const current = fingerprint(changes);
    let previous = null;
    try {
      previous = JSON.parse(readFileSync(stateFile, "utf8"));
    } catch {
      /* first run */
    }
    if (changes.length === 0) {
      if (previous?.committedHead && git("rev-parse", "HEAD").trim() === previous.committedHead) {
        push();
        saveState({ fingerprint: current, changedAt: Date.now() });
      }
      return;
    }
    const pending = debounce(previous, current, Date.now());
    if (!process.argv.includes("--now") && !pending.ready) {
      if (!previous || previous.fingerprint !== current) {
        saveState({ ...pending, committedHead: previous?.committedHead });
        console.log("Changes detected. Waiting for 10 minutes without further edits.");
      }
      return;
    }
    if (previous?.failedFingerprint === current && !process.argv.includes("--now")) return;
    try {
      console.log("Checking Hopper before commit...");
      const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
      for (const args of [["test"], ["run", "typecheck"], ["run", "lint"], ["run", "build"]]) {
        if (!existsSync(npmCli))
          throw new Error("npm is not installed beside Node; configure this installation.");
        run(process.execPath, [npmCli, ...args]);
      }
      assertDestination();
      if (fingerprint(snapshot()) !== current) {
        saveState(debounce(null, fingerprint(snapshot()), Date.now()));
        console.log("Files changed during checks. Waiting another 10 minutes.");
        return;
      }
      const expectedObjects = new Map(
        changes
          .filter(({ hash }) => hash !== null)
          .map(({ path }) => [
            path,
            run("git", ["hash-object", "--path=" + path, "--stdin"], {
              input: readFileSync(join(root, path)),
            }).trim(),
          ]),
      );
      if (fingerprint(snapshot()) !== current) {
        saveState(debounce(null, fingerprint(snapshot()), Date.now()));
        console.log("Files changed before staging. Waiting another 10 minutes.");
        return;
      }
      // Stage only the exact audited paths, never a new unreviewed directory.
      for (let index = 0; index < changes.length; index += 40) {
        git("add", "-A", "--", ...changes.slice(index, index + 40).map(({ path }) => path));
      }
      for (const path of list("diff", "--cached", "--name-only", "--diff-filter=ACMRT", "-z")) {
        assertPublishablePath(path);
        assertSafeContent(path, run("git", ["show", ":" + path], { encoding: null }));
      }
      for (const [path, expected] of expectedObjects) {
        if (git("rev-parse", ":" + path).trim() !== expected) {
          throw new Error("A file changed while staging. Review the staged files: " + path);
        }
      }
      if (!git("diff", "--cached", "--name-only").trim()) return;
      const moment = bucharestMoment();
      const journalChanges = parseStagedChanges(
        git("diff", "--cached", "--name-status", "--no-renames", "-z"),
        git("diff", "--cached", "--numstat", "--no-renames", "-z"),
      );
      if (journalChanges.length) {
        const updateId = createHash("sha256")
          .update(git("rev-parse", "HEAD"))
          .update(
            git(
              "diff",
              "--cached",
              "--raw",
              "--no-abbrev",
              "--no-renames",
              "--",
              ".",
              ":(exclude)" + journalPath,
            ),
          )
          .digest("hex");
        const absoluteJournal = join(root, journalPath);
        if (existsSync(absoluteJournal) && lstatSync(absoluteJournal).isSymbolicLink()) {
          throw new Error("The daily journal must be a regular local file.");
        }
        const journalExists = existsSync(absoluteJournal);
        const journalBytes = journalExists ? readFileSync(absoluteJournal) : Buffer.alloc(0);
        const plannedJournal = list("ls-files", "--stage", "-z", "--", journalPath)[0];
        if (
          plannedJournal &&
          (!journalExists ||
            run("git", ["hash-object", "--path=" + journalPath, "--stdin"], {
              input: journalBytes,
            }).trim() !== plannedJournal.split(" ")[1])
        ) {
          throw new Error(
            "The journal changed while staging. Your notes were preserved; review the staged files.",
          );
        }
        const existingJournal = journalBytes.toString("utf8");
        const updatedJournal = appendDailyUpdate(existingJournal, journalChanges, moment, updateId);
        assertPublishablePath(journalPath);
        assertSafeContent(journalPath, Buffer.from(updatedJournal, "utf8"));
        writeFileSync(absoluteJournal, updatedJournal, "utf8");
        git("add", "--", journalPath);
        console.log("Daily change journal updated for " + moment.date);
      }
      const date = moment.date;
      git(
        "commit",
        "-m",
        process.argv.includes("--now")
          ? "Update Hopper native Android and iOS app"
          : "Update Hopper: saved changes " + date,
      );
      const committedHead = git("rev-parse", "HEAD").trim();
      saveState({ fingerprint: current, changedAt: Date.now(), committedHead });
      push();
      saveState({ fingerprint: fingerprint(snapshot()), changedAt: Date.now() });
    } catch (error) {
      // A failed push is retried later; failed checks wait for another edit.
      let after = null;
      try {
        after = JSON.parse(readFileSync(stateFile, "utf8"));
      } catch {
        /* missing */
      }
      if (!after?.committedHead) saveState({ ...pending, failedFingerprint: current });
      throw error;
    }
  } finally {
    closeSync(descriptor);
    unlinkSync(lock);
  }
}

try {
  if (process.argv.includes("--audit-only")) {
    auditHistory();
    console.log("Git history credential audit passed.");
  } else {
    main();
  }
} catch (error) {
  console.error("Hopper automatic push stopped: " + error.message);
  process.exitCode = 1;
}
