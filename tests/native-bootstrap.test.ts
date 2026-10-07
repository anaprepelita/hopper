import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { bootNativeInterface } from "../mobile/bootstrap";
import { appScripts } from "../mobile/resources.mjs";

const html = readFileSync("mobile/app/index.html", "utf8");
const ui = () => document.getElementById("native-interface")!;
const status = () => document.getElementById("native-launch-status")!;

beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  localStorage.clear();
  localStorage.setItem("expenses_users", JSON.stringify([{ name: "Ana", customMetadata: true }]));
});
afterEach(() => vi.restoreAllMocks());

describe("Native-only launch", () => {
  it("keeps the financial interface hidden and does not load its scripts in a browser", async () => {
    const load = vi.fn(async () => {});
    const writes = vi.spyOn(Storage.prototype, "setItem");
    expect(await bootNativeInterface(false, load)).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(ui().hidden).toBe(true);
    expect(status().hidden).toBe(false);
    expect(document.getElementById("native-launch-message")?.textContent).toContain("Android");
    expect(writes).not.toHaveBeenCalled();
  });

  it("loads scripts in order, showing the app only once its core is ready", async () => {
    const loaded: string[] = [];
    const load = vi.fn(async (src: string) => {
      if (appScripts.find((script) => script.src === src)?.required) expect(ui().hidden).toBe(true);
      else expect(ui().hidden).toBe(false);
      loaded.push(src);
    });
    const writes = vi.spyOn(Storage.prototype, "setItem");
    expect(await bootNativeInterface(true, load)).toBe(true);
    expect(loaded).toEqual(appScripts.map((script) => script.src));
    expect(ui().hidden).toBe(false);
    expect(status().hidden).toBe(true);
    expect(writes).not.toHaveBeenCalled();
  });

  it("keeps the interface hidden on a core loading failure and offers a retry", async () => {
    const load = vi.fn(async (src: string) => {
      if (src === "script.js") throw new Error("Missing local core");
    });
    expect(await bootNativeInterface(true, load)).toBe(false);
    expect(load.mock.calls.map(([src]) => src)).toEqual([
      "translations.js",
      "i18n.js",
      "script.js",
    ]);
    expect(ui().hidden).toBe(true);
    expect(status().hidden).toBe(false);
    expect(status().getAttribute("role")).toBe("alert");
    expect(document.getElementById("native-launch-retry")?.hidden).toBe(false);
  });

  it("opens the local app even when optional motion and synchronization resources fail", async () => {
    const load = vi.fn(async (src: string) => {
      if (!appScripts.find((script) => script.src === src)?.required)
        throw new Error("Unavailable");
    });
    expect(await bootNativeInterface(true, load)).toBe(true);
    expect(load).toHaveBeenCalledTimes(appScripts.length);
    expect(ui().hidden).toBe(false);
    expect(document.getElementById("native-launch-retry")?.hidden).toBe(true);
  });

  it("uses real local script elements sequentially in the default loader", async () => {
    const pending = bootNativeInterface(true);
    for (const { src, required } of appScripts) {
      const script = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)!;
      expect(script).not.toBeNull();
      expect(script.async).toBe(false);
      script.dispatchEvent(new Event(required ? "load" : "error"));
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(await pending).toBe(true);
    expect(ui().hidden).toBe(false);
  });
});
