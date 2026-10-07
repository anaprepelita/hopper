import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const html = readFileSync("mobile/app/index.html", "utf8");
const source = readFileSync("mobile/app/sound.js", "utf8");
const bridge = window as typeof window & { HopperSound?: { dispose: () => void } };
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function boot({
  muted = false,
  unavailable = false,
  suspended = false,
  resumeResult = Promise.resolve(),
} = {}) {
  document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  document.getElementById("auth-screen")!.classList.add("hidden");
  document.getElementById("app-screen")!.classList.remove("hidden");
  document.getElementById("native-interface")!.hidden = false;
  if (muted) localStorage.setItem("hopper_achievement_sound", "off");
  let hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  const notes: Array<{
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
    frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
    type: string;
  }> = [];
  const contexts: MockAudioContext[] = [];
  class MockAudioContext {
    state = suspended ? "suspended" : "running";
    currentTime = 10;
    destination = {};
    constructor() {
      contexts.push(this);
    }
    resume = vi.fn(async () => {
      await resumeResult;
      this.state = "running";
    });
    suspend = vi.fn(async () => {
      this.state = "suspended";
    });
    close = vi.fn(async () => {
      this.state = "closed";
    });
    createOscillator = vi.fn(() => {
      const node = {
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        connect: vi.fn(),
        frequency: { setValueAtTime: vi.fn() },
        type: "",
        onended: null as (() => void) | null,
      };
      notes.push(node);
      return node;
    });
    createGain = vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    }));
  }
  vi.stubGlobal("AudioContext", unavailable ? undefined : MockAudioContext);
  vi.stubGlobal("webkitAudioContext", undefined);
  new Function(source)();
  const notify = (kind = "achievement-celebration") => {
    document.getElementById("achievement-notification")!.classList.add("visible");
    document.dispatchEvent(
      new CustomEvent("hopper:ui", { detail: { kind, target: "achievement-notification" } }),
    );
  };
  const toggle = document.getElementById("achievement-sound-enabled") as HTMLInputElement;
  const preview = document.getElementById("achievement-sound-preview") as HTMLButtonElement;
  return {
    notes,
    contexts,
    notify,
    toggle,
    preview,
    background() {
      hidden = true;
      document.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    "expenses_users",
    '[{"email":"local@example.test","expenses":[{"amount":25}]}]',
  );
  localStorage.setItem("expenses_current_user", '{"email":"local@example.test"}');
});
afterEach(() => {
  bridge.HopperSound?.dispose();
  delete bridge.HopperSound;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Achievement sound", () => {
  it("plays one three-note chime for a new notification, with no sound on startup or badge paging", async () => {
    const session = boot();
    const accounts = localStorage.getItem("expenses_users");
    const current = localStorage.getItem("expenses_current_user");
    expect(session.contexts).toHaveLength(0);
    for (const kind of ["render", "screen", "achievement-unlocked"]) session.notify(kind);
    await flush();
    expect(session.notes).toHaveLength(0);
    session.notify();
    await flush();
    expect(session.notes).toHaveLength(3);
    expect(session.notes.map((n) => n.frequency.setValueAtTime.mock.calls[0]![0])).toEqual([
      523.25, 659.25, 1046.5,
    ]);
    expect(session.notes.every((n) => n.start.mock.calls.length === 1)).toBe(true);
    expect(localStorage.getItem("expenses_users")).toBe(accounts);
    expect(localStorage.getItem("expenses_current_user")).toBe(current);
    session.notes.forEach((n) => n.onended?.());
    expect(session.notes.every((n) => n.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it("previews the chime and persists muting independently of accounts", async () => {
    const session = boot();
    session.preview.click();
    await flush();
    expect(session.notes).toHaveLength(3);
    session.toggle.checked = false;
    session.toggle.dispatchEvent(new Event("change"));
    expect(localStorage.getItem("hopper_achievement_sound")).toBe("off");
    expect(session.preview.disabled).toBe(true);
    expect(session.notes.every((n) => n.disconnect.mock.calls.length === 1)).toBe(true);
    session.notify();
    await flush();
    expect(session.notes).toHaveLength(3);
    bridge.HopperSound?.dispose();
    const reloaded = boot();
    expect(reloaded.toggle.checked).toBe(false);
    reloaded.notify();
    await flush();
    expect(reloaded.notes).toHaveLength(0);
    reloaded.toggle.checked = true;
    reloaded.toggle.dispatchEvent(new Event("change"));
    reloaded.preview.click();
    await flush();
    expect(reloaded.notes).toHaveLength(3);
  });

  it("keeps muting effective if preference storage fails", async () => {
    const session = boot();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Unavailable");
    });
    session.toggle.checked = false;
    expect(() => session.toggle.dispatchEvent(new Event("change"))).not.toThrow();
    session.notify();
    await flush();
    expect(session.notes).toHaveLength(0);
    expect(session.preview.disabled).toBe(true);
  });

  it("does not queue a delayed chime after cancellation or backgrounding", async () => {
    let resolveResume!: () => void;
    const resumeResult = new Promise<void>((resolve) => {
      resolveResume = resolve;
    });
    const session = boot({ suspended: true, resumeResult });
    session.notify();
    session.notify("achievement-dismissed");
    resolveResume();
    await flush();
    expect(session.notes).toHaveLength(0);
    session.notify();
    await flush();
    expect(session.notes).toHaveLength(3);
    session.background();
    expect(session.contexts[0]!.suspend).toHaveBeenCalledOnce();
    expect(session.notes.every((n) => n.disconnect.mock.calls.length === 1)).toBe(true);
    session.notify();
    await flush();
    expect(session.notes).toHaveLength(3);
  });

  it("replaces overlapping chimes and closes audio on page hide", async () => {
    const session = boot();
    session.notify();
    await flush();
    session.notify();
    await flush();
    expect(session.notes).toHaveLength(6);
    expect(session.notes.slice(0, 3).every((n) => n.disconnect.mock.calls.length === 1)).toBe(true);
    window.dispatchEvent(new Event("pagehide"));
    expect(session.contexts[0]!.close).toHaveBeenCalledOnce();
    expect(session.notes.slice(3).every((n) => n.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it("keeps visual achievements usable when audio is unavailable or blocked", async () => {
    const missing = boot({ unavailable: true });
    missing.notify();
    await flush();
    expect(missing.notes).toHaveLength(0);
    expect(document.getElementById("achievement-sound-settings")).toHaveAttribute("hidden");
    bridge.HopperSound?.dispose();
    const blocked = boot({ suspended: true, resumeResult: Promise.reject(new Error("Blocked")) });
    blocked.notify();
    await flush();
    expect(blocked.notes).toHaveLength(0);
    expect(document.getElementById("achievement-notification")).toHaveClass("visible");
  });

  it("keeps sound independent of Anime.js and reduced motion", async () => {
    vi.stubGlobal("anime", undefined);
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const session = boot();
    session.notify();
    await flush();
    expect(session.notes).toHaveLength(3);
  });
});
