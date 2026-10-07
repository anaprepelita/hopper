import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

type MockAnimation = { revert: ReturnType<typeof vi.fn> };
type AnimationParameters = { onComplete: (animation: MockAnimation) => void };
type TestWindow = Window &
  typeof globalThis & {
    anime?: { animate: (element: HTMLElement, parameters: AnimationParameters) => MockAnimation };
  };
type Session = { window: TestWindow };
type AnimationRecord = {
  element: HTMLElement;
  parameters: AnimationParameters;
  animation: MockAnimation;
  finish: () => void;
};
// jsdom is already installed for Vitest; avoid adding a dependency for test-only types.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (
    html: string,
    options: { url: string; runScripts: string; pretendToBeVisual: boolean },
  ) => Session;
};

const html = readFileSync("mobile/app/index.html", "utf8");
const controller = readFileSync("mobile/app/motion.js", "utf8");
const vendor = readFileSync("mobile/app/vendor/anime.umd.min.js", "utf8");
const sessions: Session[] = [];

function start({ paused = false, reduced = false, library = "mock" } = {}) {
  const dom = new JSDOM(html, {
    url: "https://hopper.test/app/index.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  sessions.push(dom);
  const { window } = dom;
  const { document } = window;
  document.getElementById("native-interface")!.hidden = false;
  document.getElementById("native-launch-status")!.hidden = true;
  const listeners = new Set<() => void>();
  const media = {
    matches: reduced,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
  };
  window.matchMedia = (query) =>
    (query.includes("prefers-reduced-motion") ? media : { matches: true }) as MediaQueryList;
  const account = JSON.stringify({ email: "local@example.test", savingsGoal: { saved: 125 } });
  window.localStorage.setItem("expenses_users", account);
  window.localStorage.setItem("expenses_current_user", account);
  if (paused) window.localStorage.setItem("hopper_decor_paused", "true");
  document.getElementById("auth-screen")!.classList.add("hidden");
  document.getElementById("app-screen")!.classList.remove("hidden");
  document.getElementById("report-list")!.innerHTML =
    '<div class="report-item">Prima cheltuială</div><div class="report-item">A doua cheltuială</div>';
  const records: AnimationRecord[] = [];
  if (library === "mock") {
    window.anime = {
      animate: vi.fn((element, parameters) => {
        const original = element.getAttribute("style");
        element.style.opacity = "0";
        element.style.transform = "translateY(8px)";
        const animation = {
          revert: vi.fn(() => {
            if (original === null) element.removeAttribute("style");
            else element.setAttribute("style", original);
          }),
        };
        records.push({
          element,
          parameters,
          animation,
          finish: () => parameters.onComplete(animation),
        });
        return animation;
      }),
    };
  } else if (library === "broken") {
    window.anime = {
      animate: vi.fn((element) => {
        element.style.opacity = "0";
        throw new Error("library failure");
      }),
    };
  } else if (library === "real") {
    window.eval(vendor);
  }
  window.eval(controller);
  function emit(kind: string, target?: string) {
    document.dispatchEvent(new window.CustomEvent("hopper:ui", { detail: { kind, target } }));
  }
  function view(name: string) {
    document
      .querySelectorAll<HTMLElement>(".page-view")
      .forEach((page) => page.classList.toggle("active", page.dataset["view"] === name));
    emit("view", name);
  }
  return {
    window,
    document,
    records,
    account,
    emit,
    view,
    setReduced(value: boolean) {
      media.matches = value;
      listeners.forEach((listener) => listener());
    },
  };
}

afterEach(() => {
  for (const dom of sessions.splice(0)) {
    dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    dom.window.close();
  }
});

describe("Packaged decorative motion", () => {
  it("celebrates visible achievement cards and replaces notification bursts without accumulating particles", () => {
    const session = start();
    const { document, emit, records, window, account } = session;
    session.view("goals");
    document.getElementById("achievement-list")!.innerHTML =
      '<article id="achievement-first-saving" class="achievement earned"><span class="achievement-icon"></span></article><article id="achievement-goal-half" class="achievement earned" hidden><span class="achievement-icon"></span></article>';
    emit("achievement-unlocked", "achievement-first-saving");
    expect(document.querySelectorAll("#achievement-first-saving .motion-glimmer")).toHaveLength(1);
    emit("achievement-unlocked", "achievement-goal-half");
    expect(document.querySelectorAll("#achievement-goal-half .motion-glimmer")).toHaveLength(0);
    const notification = document.getElementById("achievement-notification")!;
    notification.classList.add("visible");
    emit("achievement-celebration", "achievement-notification");
    const firstBurst = records.filter(({ element }) => element.matches(".motion-particle"));
    expect(
      document.querySelectorAll("#achievement-notification .motion-particle.star"),
    ).toHaveLength(10);
    emit("achievement-celebration", "achievement-notification");
    expect(document.querySelectorAll("#achievement-notification .motion-particle")).toHaveLength(
      10,
    );
    for (const { animation } of firstBurst) expect(animation.revert).toHaveBeenCalledOnce();
    emit("achievement-dismissed", "achievement-notification");
    expect(notification.querySelectorAll(".motion-particles")).toHaveLength(0);
    expect(notification.querySelector(".achievement-icon")!.getAttribute("style")).toBeNull();
    session.view("home");
    expect(document.querySelectorAll(".motion-glimmer")).toHaveLength(0);
    expect(window.localStorage.getItem("expenses_users")).toBe(account);
    expect(window.localStorage.getItem("expenses_current_user")).toBe(account);
  });

  it("keeps achievement confirmations readable with a missing library or reduced motion and cleans effects on preference changes", () => {
    for (const options of [{ reduced: true }, { library: "missing" }, { library: "broken" }]) {
      const { document, emit } = start(options);
      const notification = document.getElementById("achievement-notification")!;
      notification.classList.add("visible");
      emit("achievement-celebration", "achievement-notification");
      expect(notification).toHaveClass("visible");
      expect(notification.querySelectorAll(".motion-particle")).toHaveLength(0);
      expect(notification.querySelector(".achievement-icon")!.getAttribute("style")).toBeNull();
    }
    const session = start();
    const notification = session.document.getElementById("achievement-notification")!;
    notification.classList.add("visible");
    session.emit("achievement-celebration", "achievement-notification");
    expect(notification.querySelectorAll(".motion-particle")).toHaveLength(10);
    session.setReduced(true);
    expect(notification.querySelectorAll(".motion-particle")).toHaveLength(0);
    expect(notification.querySelector(".achievement-icon")!.getAttribute("style")).toBeNull();
    session.setReduced(false);
    expect(notification.querySelectorAll(".motion-particle")).toHaveLength(0);
  });

  it("hops the Hopper logo only on activation and cancels an earlier hop without changing accounts", () => {
    const { document, window, records, account } = start();
    const button = document.getElementById("brand-bunny-button") as HTMLButtonElement;
    const bunny = button.querySelector<HTMLElement>(".hopper-brand-icon")!;
    expect(button.type).toBe("button");
    expect(button.textContent).toContain("Hopper");
    expect(records.filter(({ element }) => element === bunny)).toHaveLength(0);
    button.click();
    const firstHop = records.find(({ element }) => element === bunny)!;
    button.click();
    expect(firstHop.animation.revert).toHaveBeenCalledOnce();
    const hops = records.filter(({ element }) => element === bunny);
    expect(hops).toHaveLength(2);
    hops[1]!.finish();
    expect(bunny.getAttribute("style")).toBeNull();
    expect(window.localStorage.getItem("expenses_users")).toBe(account);
    expect(window.localStorage.getItem("expenses_current_user")).toBe(account);
  });

  it("suppresses logo hops with reduced motion or a missing library and cancels them when the preference changes", () => {
    for (const options of [{ reduced: true }, { library: "missing" }]) {
      const { document, records } = start(options);
      const button = document.getElementById("brand-bunny-button") as HTMLButtonElement;
      const bunny = button.querySelector(".hopper-brand-icon");
      button.click();
      expect(records.filter(({ element }) => element === bunny)).toHaveLength(0);
    }
    const session = start();
    const button = session.document.getElementById("brand-bunny-button") as HTMLButtonElement;
    const bunny = button.querySelector<HTMLElement>(".hopper-brand-icon")!;
    button.click();
    const hop = session.records.find(({ element }) => element === bunny)!;
    session.setReduced(true);
    expect(hop.animation.revert).toHaveBeenCalledOnce();
    expect(bunny.getAttribute("style")).toBeNull();
    session.setReduced(false);
    expect(session.records.filter(({ element }) => element === bunny)).toHaveLength(1);
  });

  it("runs without decor buttons and ignores the obsolete pause preference without changing accounts", () => {
    const session = start({ paused: true });
    const { document, window } = session;
    expect(
      document.querySelector(
        "#decor-toggle, #dashboard-decor-toggle, .decor-controls, .dashboard-decor-controls",
      ),
    ).toBeNull();
    expect(document.documentElement.dataset["decorPaused"]).toBe("false");
    expect(session.records.length).toBeGreaterThan(0);
    session.view("goals");
    session.emit("savings-reached", "savings-progress");
    expect(document.querySelectorAll(".motion-particle")).toHaveLength(12);
    window.dispatchEvent(
      new window.StorageEvent("storage", { key: "hopper_decor_paused", newValue: "true" }),
    );
    expect(document.documentElement.dataset["decorPaused"]).toBe("false");
    expect(window.localStorage.getItem("expenses_users")).toBe(session.account);
    expect(window.localStorage.getItem("expenses_current_user")).toBe(session.account);
  });

  it("pauses in background and removes transient effects before resuming decoration", () => {
    const { document, emit, view, records, window } = start();
    view("goals");
    emit("savings-reached", "savings-progress");
    const particles = records.filter(({ element }) => element.matches(".motion-particle"));
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new window.Event("visibilitychange"));
    expect(document.documentElement.dataset["decorPaused"]).toBe("true");
    expect(
      document.querySelectorAll(".motion-particle, .motion-glimmer, .motion-particles"),
    ).toHaveLength(0);
    for (const { animation } of particles) expect(animation.revert).toHaveBeenCalledOnce();
    emit("savings-reached", "savings-progress");
    expect(document.querySelectorAll(".motion-particle")).toHaveLength(0);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new window.Event("visibilitychange"));
    expect(document.documentElement.dataset["decorPaused"]).toBe("false");
    emit("savings-reached", "savings-progress");
    expect(document.querySelectorAll(".motion-particle")).toHaveLength(12);
  });

  it("keeps authentication forms static with bubbles in a separate decorative layer", () => {
    const session = start();
    session.document.getElementById("app-screen")!.classList.add("hidden");
    session.document.getElementById("auth-screen")!.classList.remove("hidden");
    session.records.length = 0;
    session.emit("screen", "auth-screen");
    session.emit("auth-form", "register-form");
    expect(session.records).toHaveLength(0);
    expect(session.document.querySelector(".animal-rain")).toBeNull();
    const decoration = session.document.querySelector(".auth-bubbles")!;
    expect(decoration).toHaveAttribute("aria-hidden", "true");
    expect(decoration.querySelectorAll(".auth-soap-bubble")).toHaveLength(8);
    expect(
      session.document.querySelector<HTMLElement>(".auth-card")!.getAttribute("style"),
    ).toBeNull();
  });

  it("respects live reduced motion changes with system preference taking priority", () => {
    const session = start({ paused: true });
    session.view("goals");
    session.emit("savings-reached", "savings-progress");
    session.setReduced(true);
    expect(session.document.querySelectorAll(".motion-particle, .motion-glimmer")).toHaveLength(0);
    expect(session.document.documentElement.dataset["decorPaused"]).toBe("true");
    expect(session.document.documentElement.dataset["reducedMotion"]).toBe("true");
    session.setReduced(false);
    expect(session.document.documentElement.dataset["decorPaused"]).toBe("false");
    session.emit("savings-reached", "savings-progress");
    expect(session.document.querySelectorAll(".motion-particle")).toHaveLength(12);
    const reducedAtLoad = start({ reduced: true });
    expect(reducedAtLoad.records).toHaveLength(0);
    reducedAtLoad.setReduced(false);
    expect(reducedAtLoad.document.documentElement.dataset["decorPaused"]).toBe("false");
  });

  it("cancels old effects on rapid navigation and restores original visible styles", () => {
    const session = start();
    session.view("report");
    const rows = session.records.filter(({ element }) => element.matches(".report-item"));
    expect(rows).toHaveLength(2);
    session.view("goals");
    for (const { element, animation } of rows) {
      expect(animation.revert).toHaveBeenCalledOnce();
      expect(element.getAttribute("style")).toBeNull();
    }
    session.emit("savings-reached", "savings-progress");
    session.view("settings");
    expect(
      session.document.querySelectorAll(".motion-particle, .motion-glimmer, .motion-particles"),
    ).toHaveLength(0);
    expect(session.window.localStorage.getItem("expenses_users")).toBe(session.account);
  });

  it.each(["missing", "broken"])(
    "keeps content usable and enables CSS decoration when the library is %s",
    (library) => {
      const { document, emit, view } = start({ library });
      expect(document.querySelector<HTMLElement>(".topbar")!.style.opacity).toBe("");
      view("goals");
      emit("savings-reached", "savings-progress");
      expect(document.querySelectorAll(".motion-particle, .motion-glimmer")).toHaveLength(0);
      expect(document.documentElement.dataset["decorPaused"]).toBe("false");
      expect(
        document
          .querySelector<HTMLElement>('.page-view[data-view="goals"]')!
          .classList.contains("active"),
      ).toBe(true);
    },
  );

  it("celebrates explicit successful actions and cleans up when animations finish", () => {
    const session = start();
    session.view("goals");
    session.emit("render");
    expect(session.document.querySelectorAll(".motion-particle")).toHaveLength(0);
    session.emit("savings-contribution", "savings-progress");
    expect(session.document.querySelectorAll(".motion-glimmer")).toHaveLength(1);
    session.emit("savings-reached", "savings-progress");
    expect(session.document.querySelectorAll(".motion-particle")).toHaveLength(12);
    session.emit("savings-reached", "savings-progress");
    expect(session.document.querySelectorAll(".motion-particle")).toHaveLength(12);
    for (const record of session.records) record.finish();
    expect(
      session.document.querySelectorAll(".motion-particle, .motion-glimmer, .motion-particles"),
    ).toHaveLength(0);
    session.emit("expense-added", "expense-notification");
    expect(session.document.querySelectorAll(".motion-particle.star")).toHaveLength(6);
    session.emit("profile-saved", "header-profile-button");
    expect(session.records.some(({ element }) => element.id === "header-profile-button")).toBe(
      true,
    );
  });

  it("runs and cleans up the effects with the installed Anime.js distribution", async () => {
    const session = start({ library: "real" });
    session.view("goals");
    session.emit("savings-reached", "savings-progress");
    expect(session.document.querySelectorAll(".motion-particle")).toHaveLength(12);
    await vi.waitFor(
      () => {
        expect(
          session.document.querySelectorAll(".motion-particle, .motion-glimmer, .motion-particles"),
        ).toHaveLength(0);
        expect(
          session.document.querySelector<HTMLElement>(".topbar")!.getAttribute("style"),
        ).toBeNull();
      },
      { timeout: 2500, interval: 50 },
    );
  });
});
