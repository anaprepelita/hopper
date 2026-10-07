import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: vi.fn(() => false),
  bars: vi.fn(async () => {}),
  minimize: vi.fn(async () => {}),
  listeners: new Map<string, (event: { isActive: boolean }) => void>(),
  removals: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: mocks.native },
  SystemBars: { setStyle: mocks.bars },
  SystemBarsStyle: { Dark: "DARK", Light: "LIGHT" },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    minimizeApp: mocks.minimize,
    addListener: vi.fn(async (name, handler) => {
      mocks.listeners.set(name, handler);
      return {
        remove: async () => {
          mocks.listeners.delete(name);
          mocks.removals(name);
        },
      };
    }),
  },
}));

import { handleNativeBack, initializeNativeShell } from "../mobile/runtime";
import { mobileHTML } from "../mobile/markup.mjs";
import { appScripts } from "../mobile/resources.mjs";

const original = readFileSync("mobile/app/index.html", "utf8");
const script = readFileSync("mobile/app/script.js", "utf8");
const legacy = {
  name: "Ana",
  email: "ana@example.test",
  password: "local-only",
  customMetadata: { retain: true },
  expenses: [
    { description: "Carte", amount: 20, category: "Education", date: "2026-10-01", custom: 3 },
  ],
  incomes: [{ amount: 100, source: "Bursă", date: "2026-10-01" }],
};
const bridge = window as Window & {
  HopperApp?: { dispose: () => void };
  HopperSync?: { synchronize: () => Promise<void> };
};
let dispose: (() => Promise<void>) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.native.mockReturnValue(false);
  document.documentElement.className = "";
  delete document.documentElement.dataset["theme"];
  localStorage.clear();
  document.body.innerHTML = new DOMParser().parseFromString(
    mobileHTML(original),
    "text/html",
  ).body.innerHTML;
  document.querySelectorAll<HTMLDialogElement>("dialog").forEach((dialog) => {
    dialog.close = vi.fn(() => {
      dialog.open = false;
      dialog.dispatchEvent(new Event("close"));
    });
  });
});
afterEach(async () => {
  await dispose?.();
  dispose = undefined;
  bridge.HopperApp?.dispose();
  delete bridge.HopperApp;
  delete bridge.HopperSync;
  mocks.listeners.clear();
  vi.restoreAllMocks();
});

describe("Packaged mobile app", () => {
  it.each([false, true])("resolves local resources at the native entry (root: %s)", (atRoot) => {
    const html = mobileHTML(original, atRoot);
    const dom = new DOMParser().parseFromString(html, "text/html");
    const base = new URL(atRoot ? "/" : "/app/index.html", "https://localhost");
    const baseLink = dom.querySelector("base");
    const effective = baseLink ? new URL(baseLink.getAttribute("href")!, base) : base;
    expect(dom.querySelectorAll("script[src]")).toHaveLength(1);
    expect(dom.querySelector("script[src]")?.getAttribute("src")).toBe("native-runtime.js");
    for (const { src } of appScripts) {
      expect(new URL(src, effective).pathname).toBe(`/app/${src}`);
      expect(readFileSync(`mobile/app/${src}`, "utf8").length).toBeGreaterThan(0);
    }
    for (const image of dom.querySelectorAll(
      'img[src], link[rel="icon"], link[rel="apple-touch-icon"]',
    )) {
      const url = new URL(image.getAttribute("src") || image.getAttribute("href")!, effective);
      expect(url.origin).toBe(base.origin);
      const png = readFileSync(`mobile${url.pathname}`);
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png.readUInt32BE(16)).toBeGreaterThan(0);
      expect(png.readUInt32BE(20)).toBeGreaterThan(0);
    }
    expect(dom.querySelectorAll("base")).toHaveLength(atRoot ? 1 : 0);
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).toContain('href="fonts/press-start-2p/400.css"');
    expect(html).toContain('href="fonts/nunito/800.css"');
    expect(dom.querySelector("iframe")).toBeNull();
    expect(dom.querySelector('link[rel="manifest"]')).toBeNull();
    expect(dom.getElementById("native-interface")?.hasAttribute("hidden")).toBe(true);
    expect(dom.querySelectorAll("form")).toHaveLength(
      new DOMParser().parseFromString(original, "text/html").querySelectorAll("form").length,
    );
  });

  it("does not register native helpers outside Capacitor", async () => {
    dispose = await initializeNativeShell();
    expect(mocks.listeners.size).toBe(0);
    expect(document.documentElement.classList.contains("hopper-native")).toBe(false);
    expect(mocks.bars).not.toHaveBeenCalled();
  });

  it("closes only the current dialog and respects cancellation", () => {
    const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog"));
    dialogs[0]!.open = true;
    dialogs.at(-1)!.open = true;
    expect(handleNativeBack(document)).toBe(true);
    expect(dialogs[0]!.open).toBe(true);
    expect(dialogs.at(-1)!.open).toBe(false);
    dialogs[0]!.addEventListener("cancel", (event) => event.preventDefault(), { once: true });
    expect(handleNativeBack(document)).toBe(true);
    expect(dialogs[0]!.open).toBe(true);
  });

  it("returns from other tabs without writing or migrating saved accounts", () => {
    localStorage.setItem("expenses_users", JSON.stringify([legacy]));
    localStorage.setItem("expenses_current_user", JSON.stringify(legacy));
    const beforeUsers = localStorage.getItem("expenses_users");
    const beforeCurrent = localStorage.getItem("expenses_current_user");
    new Function("window", "document", "localStorage", "alert", script)(
      window,
      document,
      localStorage,
      vi.fn(),
    );
    const writes = vi.spyOn(Storage.prototype, "setItem");
    for (const view of ["report", "goals", "settings"]) {
      document.querySelector<HTMLButtonElement>(`.view-tab[data-view="${view}"]`)!.click();
      expect(handleNativeBack(document)).toBe(true);
      expect(document.querySelector(".page-view.active")?.getAttribute("data-view")).toBe("home");
    }
    expect(handleNativeBack(document)).toBe(false);
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem("expenses_users")).toBe(beforeUsers);
    expect(localStorage.getItem("expenses_current_user")).toBe(beforeCurrent);
  });

  it("returns from registration before minimizing the app", () => {
    new Function("window", "document", "localStorage", "alert", script)(
      window,
      document,
      localStorage,
      vi.fn(),
    );
    document.querySelector<HTMLButtonElement>('[data-target="register-form"]')!.click();
    expect(handleNativeBack(document)).toBe(true);
    expect(document.getElementById("login-form")!.classList.contains("active")).toBe(true);
    expect(handleNativeBack(document)).toBe(false);
  });

  it("handles native back, updates bars for themes and resumes synchronization without writes", async () => {
    mocks.native.mockReturnValue(true);
    bridge.HopperSync = { synchronize: vi.fn(async () => {}) };
    const writes = vi.spyOn(Storage.prototype, "setItem");
    dispose = await initializeNativeShell();
    expect(mocks.bars).toHaveBeenLastCalledWith({ style: "LIGHT" });
    document.documentElement.dataset["theme"] = "night";
    await Promise.resolve();
    expect(mocks.bars).toHaveBeenLastCalledWith({ style: "DARK" });
    mocks.listeners.get("backButton")!({ isActive: true });
    expect(mocks.minimize).toHaveBeenCalledOnce();
    mocks.listeners.get("appStateChange")!({ isActive: false });
    expect(bridge.HopperSync.synchronize).not.toHaveBeenCalled();
    mocks.listeners.get("appStateChange")!({ isActive: true });
    expect(bridge.HopperSync.synchronize).toHaveBeenCalledOnce();
    expect(writes).not.toHaveBeenCalled();
    await dispose();
    expect(mocks.listeners.size).toBe(0);
    expect(mocks.removals).toHaveBeenCalledTimes(2);
  });
});
