import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializePhoneNavigation } from "../mobile/navigation";
let dispose: (() => void) | undefined;
const viewport = new EventTarget() as EventTarget & { height: number };
function view(next: string) {
  document
    .querySelectorAll<HTMLElement>(".view-tab")
    .forEach((button) => button.classList.toggle("active", button.dataset["view"] === next));
  document.dispatchEvent(new CustomEvent("hopper:ui", { detail: { kind: "view", target: next } }));
}
beforeEach(() => {
  document.body.innerHTML =
    '<button class="view-tab active" data-view="home"></button><button class="view-tab" data-view="report"></button><button class="view-tab" data-view="settings"></button><input id="entry" /><input id="amount" /><input id="range" type="range" />';
  localStorage.setItem("expenses_users", "unchanged");
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("scrollY", 0);
  viewport.height = 800;
  vi.stubGlobal("visualViewport", viewport);
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Native phone navigation", () => {
  it("restores each tab's scroll position and never changes account storage", () => {
    const writes = vi.spyOn(Storage.prototype, "setItem");
    dispose = initializePhoneNavigation();
    vi.stubGlobal("scrollY", 600);
    window.dispatchEvent(new Event("scroll"));
    view("report");
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
    expect(document.documentElement.dataset["nativeView"]).toBe("report");
    vi.stubGlobal("scrollY", 150);
    window.dispatchEvent(new Event("scroll"));
    view("home");
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 600, behavior: "auto" });
    view("report");
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 150, behavior: "auto" });
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem("expenses_users")).toBe("unchanged");
  });
  it("starts the next login with fresh tab positions", () => {
    dispose = initializePhoneNavigation();
    vi.stubGlobal("scrollY", 400);
    window.dispatchEvent(new Event("scroll"));
    view("report");
    document.dispatchEvent(
      new CustomEvent("hopper:ui", { detail: { kind: "screen", target: "auth-screen" } }),
    );
    view("home");
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
  });
  it("clears the phone dock for the software keyboard and restores it on blur", async () => {
    dispose = initializePhoneNavigation();
    document.getElementById("entry")!.focus();
    await Promise.resolve();
    expect(document.documentElement.dataset["keyboardVisible"]).toBe("false");
    viewport.height = 460;
    window.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("resize"));
    expect(document.documentElement.dataset["keyboardVisible"]).toBe("true");
    document.getElementById("amount")!.focus();
    await Promise.resolve();
    expect(document.documentElement.dataset["keyboardVisible"]).toBe("true");
    (document.activeElement as HTMLElement).blur();
    await Promise.resolve();
    expect(document.documentElement.dataset["keyboardVisible"]).toBe("false");
  });
  it("keeps the dock for non-keyboard controls and tablet layout", async () => {
    dispose = initializePhoneNavigation();
    document.getElementById("range")!.focus();
    viewport.height = 400;
    viewport.dispatchEvent(new Event("resize"));
    await Promise.resolve();
    expect(document.documentElement.dataset["keyboardVisible"]).toBe("false");
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList);
    view("settings");
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
  it("removes listeners and queued focus work when the native shell is disposed", async () => {
    dispose = initializePhoneNavigation();
    document.getElementById("entry")!.focus();
    dispose();
    dispose = undefined;
    await Promise.resolve();
    view("report");
    expect(document.documentElement.dataset["nativeView"]).toBeUndefined();
    expect(document.documentElement.dataset["keyboardVisible"]).toBeUndefined();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
