import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  liveOptions,
  createLiveServer,
  createRebuilder,
  createAlternatingBuilder,
} from "../scripts/live-server.mjs";
import {
  assertPackagedBuild,
  beginLiveSession,
  restoreLiveSession,
  allowIOSLiveNetworking,
} from "../scripts/live-session.mjs";

const fixtures = resolve(".mobile-live");
let fixture: string;
let live: ReturnType<typeof createLiveServer> | undefined;
const clientDisposals: (() => void)[] = [];

beforeEach(async () => {
  await mkdir(fixtures, { recursive: true });
  fixture = await mkdtemp(join(fixtures, "test-"));
});
afterEach(async () => {
  for (const dispose of clientDisposals.splice(0)) dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await live?.close();
  live = undefined;
  if (!resolve(fixture).startsWith(fixtures + sep + "test-"))
    throw new Error("Invalid fixture cleanup path.");
  await rm(fixture, { recursive: true, force: true });
});

describe("Native Live Reload server", () => {
  it("defaults to a loopback server and accepts only explicit private LAN hosts", () => {
    expect(liveOptions(["android"]).host).toBe("127.0.0.1");
    expect(
      liveOptions(["ios", "--host", "192.168.1.4", "--port", "5174", "--target", "device-1"])
        .target,
    ).toBe("device-1");
    for (const args of [
      ["web"],
      ["android", "--host", "example.com"],
      ["android", "--host", "8.8.8.8"],
      ["android", "--port", "0"],
      ["android", "--target"],
    ]) {
      expect(() => liveOptions(args)).toThrow();
    }
  });

  it("serves only a complete bundle and notifies clients after a bundle switch", async () => {
    const first = join(fixture, "a");
    const next = join(fixture, "b");
    for (const [dir, css] of [
      [first, "before"],
      [next, "after"],
    ]) {
      await mkdir(join(dir!, "app"), { recursive: true });
      await writeFile(join(dir!, "index.html"), '<div id="native-interface" hidden></div>');
      await writeFile(join(dir!, "app/styles.css"), css!);
    }
    await writeFile(join(fixture, ".env.local"), "not-a-served-resource");
    const stopped = vi.fn();
    live = createLiveServer(first, { stopToken: "private-test-token", onStop: stopped });
    await new Promise<void>((done) => live!.server.listen(0, "127.0.0.1", done));
    const address = live.server.address();
    if (!address || typeof address === "string") throw new Error("No test server address.");
    const url = `http://127.0.0.1:${address.port}`;
    expect(await (await fetch(`${url}/app/styles.css`)).text()).toBe("before");
    expect((await fetch(`${url}/.env.local`)).status).toBe(404);
    expect((await fetch(`${url}/app/..%2f..%2f.env.local`)).status).toBe(403);
    expect((await fetch(`${url}/`, { method: "POST" })).status).toBe(405);
    const source = await fetch(`${url}/__hopper_live_events`);
    const reader = source.body!.getReader();
    const initial = new TextDecoder().decode((await reader.read()).value);
    expect(initial).toContain("event: revision");
    expect(initial).toContain(":0");
    live.publish(next);
    const updated = new TextDecoder().decode((await reader.read()).value);
    expect(updated).toContain(":1");
    const response = await fetch(`${url}/app/styles.css`);
    expect(await response.text()).toBe("after");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await reader.cancel();
    expect((await fetch(`${url}/__hopper_live_stop`, { method: "POST" })).status).toBe(403);
    expect(stopped).not.toHaveBeenCalled();
    expect(
      (
        await fetch(`${url}/__hopper_live_stop`, {
          method: "POST",
          headers: { "x-hopper-live-token": "private-test-token" },
        })
      ).status,
    ).toBe(200);
    expect(stopped).toHaveBeenCalledOnce();
  });

  it("coalesces saves, serializes builds and retains the old bundle after an invalid build", async () => {
    vi.useFakeTimers();
    let complete: (bundle: string) => void = () => {};
    const first = new Promise<string>((done) => {
      complete = done;
    });
    const build = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockRejectedValueOnce(new Error("invalid code"))
      .mockResolvedValueOnce("fixed");
    const publish = vi.fn();
    const error = vi.fn();
    const queue = createRebuilder(build, publish, error, 10);
    queue.schedule();
    queue.schedule();
    queue.schedule();
    await vi.advanceTimersByTimeAsync(10);
    expect(build).toHaveBeenCalledTimes(1);
    queue.schedule();
    await vi.advanceTimersByTimeAsync(10);
    expect(build).toHaveBeenCalledTimes(1);
    complete("valid");
    await vi.advanceTimersByTimeAsync(1);
    expect(publish).toHaveBeenCalledExactlyOnceWith("valid");
    expect(error).toHaveBeenCalledOnce();
    queue.schedule();
    await vi.advanceTimersByTimeAsync(10);
    expect(publish).toHaveBeenLastCalledWith("fixed");
    await queue.stop();
    queue.schedule();
    await vi.advanceTimersByTimeAsync(10);
    expect(build).toHaveBeenCalledTimes(3);
  });

  it("retries a failed build in the unused directory instead of deleting the served bundle", async () => {
    const build = vi
      .fn()
      .mockRejectedValueOnce(new Error("invalid code"))
      .mockResolvedValue("complete");
    const next = createAlternatingBuilder(build);
    await expect(next()).rejects.toThrow("invalid code");
    await expect(next()).resolves.toBe("complete");
    await next();
    expect(build.mock.calls.map(([mode]) => mode)).toEqual(["live-b", "live-b", "live-a"]);
  });

  it("restores generated native configuration and blocks packaged builds during live sessions", async () => {
    const native = join(fixture, "android/app/src/main/assets/capacitor.config.json");
    await mkdir(join(native, ".."), { recursive: true });
    const original =
      '{"appId":"ro.hopper.budget","server":{"hostname":"localhost","androidScheme":"https"}}';
    await writeFile(native, original);
    await beginLiveSession(fixture, "android");
    await expect(assertPackagedBuild(fixture)).rejects.toThrow("Stop Live Reload");
    await expect(restoreLiveSession(fixture)).rejects.toThrow("still running");
    await writeFile(native, '{"server":{"url":"http://127.0.0.1:5173"}}');
    await restoreLiveSession(fixture, process.pid);
    expect(await readFile(native, "utf8")).toBe(original);
    await expect(assertPackagedBuild(fixture)).resolves.toBeUndefined();
  });

  it("removes only temporary iOS networking permissions, preserving source edits", async () => {
    const info = join(fixture, "ios/App/App/Info.plist");
    await mkdir(join(info, ".."), { recursive: true });
    const original =
      "<plist><dict><key>CFBundleDisplayName</key><string>Hopper</string></dict></plist>\n";
    await writeFile(info, original);
    await beginLiveSession(fixture, "ios");
    await allowIOSLiveNetworking(fixture);
    let current = await readFile(info, "utf8");
    expect(current).toContain("NSAllowsArbitraryLoadsInWebContent");
    await writeFile(info, current.replace("<string>Hopper</string>", "<string>Edited</string>"));
    await restoreLiveSession(fixture, process.pid);
    current = await readFile(info, "utf8");
    expect(current).toBe(original.replace("Hopper", "Edited"));
  });

  it("rejects corrupted restoration paths without writing outside native directories", async () => {
    await mkdir(join(fixture, ".mobile-live"));
    await writeFile(
      join(fixture, ".mobile-live/session.json"),
      JSON.stringify({
        pid: process.pid,
        platform: "android",
        files: [{ path: "../package.json", content: "" }],
      }),
    );
    await expect(restoreLiveSession(fixture, process.pid)).rejects.toThrow(
      "Invalid native restoration paths",
    );
  });
});

describe("Native development reload client", () => {
  const code = readFileSync("mobile/live-client.js", "utf8");
  function start(native = true) {
    document.body.innerHTML =
      '<button class="view-tab active" data-view="goals"></button><button class="view-tab" data-view="report"></button>';
    const handlers = new Map<string, (event: { data: string }) => void>();
    const events = {
      addEventListener: vi.fn((kind, handler) => handlers.set(kind, handler)),
      close: vi.fn(),
    };
    const stored = new Map([["hopper_live_view", "report"]]);
    const fake = {
      Capacitor: { isNativePlatform: () => native },
      EventSource: vi.fn(function () {
        return events;
      }),
      location: { reload: vi.fn() },
      sessionStorage: {
        getItem: (key: string) => stored.get(key),
        setItem: vi.fn((key, value) => stored.set(key, value)),
      },
      addEventListener: vi.fn((kind, handler) => {
        if (kind === "pagehide") clientDisposals.push(handler);
      }),
    };
    new Function("window", "document", code)(fake, document);
    return { fake, events, revision: (data: string) => handlers.get("revision")?.({ data }) };
  }

  it("ignores browsers and the initial revision, then reloads changed native previews without financial writes", () => {
    expect(start(false).fake.EventSource).not.toHaveBeenCalled();
    const session = start();
    const writes = vi.spyOn(Storage.prototype, "setItem");
    session.revision("session:0");
    expect(session.fake.location.reload).not.toHaveBeenCalled();
    session.revision("session:1");
    expect(session.fake.location.reload).toHaveBeenCalledOnce();
    expect(session.fake.sessionStorage.setItem).toHaveBeenCalledWith("hopper_live_view", "goals");
    expect(writes).not.toHaveBeenCalled();
  });

  it("restores the last tab only after the native financial interface has initialized", () => {
    start();
    const clicked = vi.fn();
    document.querySelector('[data-view="report"]')!.addEventListener("click", clicked);
    document.dispatchEvent(
      new CustomEvent("hopper:ui", { detail: { kind: "screen", target: "auth-screen" } }),
    );
    expect(clicked).not.toHaveBeenCalled();
    document.dispatchEvent(
      new CustomEvent("hopper:ui", { detail: { kind: "screen", target: "app-screen" } }),
    );
    expect(clicked).toHaveBeenCalledOnce();
  });
});
