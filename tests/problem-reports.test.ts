import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@capacitor/app", () => ({
  App: { getInfo: vi.fn(async () => ({ version: "1.0", build: "1" })) },
}));
import { initializeProblemReports, sendProblemReport } from "../mobile/support";
const html = readFileSync("mobile/app/index.html", "utf8");
let dispose = () => {};
const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const status = () => document.getElementById("problem-report-status")!;
const submit = () =>
  document
    .getElementById("problem-report-form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
const settle = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
const fill = () => {
  field("problem-summary").value = "Calendar blocat";
  field("problem-description").value = "Luna nu se schimbă.";
};
function attach(files: File[]) {
  Object.defineProperty(field("problem-evidence"), "files", { configurable: true, value: files });
  field("problem-evidence").dispatchEvent(new Event("change"));
}
beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  const dialog = document.getElementById("problem-report-dialog") as HTMLDialogElement;
  dialog.showModal = vi.fn(() => {
    dialog.open = true;
  });
  dialog.close = vi.fn(() => {
    dialog.open = false;
    dialog.dispatchEvent(new Event("close"));
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:evidence"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => {
  dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as Window & { HopperReportConfig?: unknown }).HopperReportConfig;
});
describe("Private problem reports", () => {
  it("is accessible only from settings without recipient or synchronization on auth", () => {
    dispose = initializeProblemReports();
    const buttons = document.querySelectorAll<HTMLButtonElement>("[data-open-problem-report]");
    expect(buttons).toHaveLength(1);
    expect(document.querySelector("#auth-screen [data-open-problem-report]")).toBeNull();
    expect(document.querySelector("#auth-screen [data-open-cloud]")).toBeNull();
    expect(html).not.toMatch(/mailto:|anaprepelita29/);
    buttons[0]!.click();
    expect(document.activeElement).toBe(field("problem-summary"));
    expect(status().textContent).toContain("nu este disponibilă");
    field("problem-report-close").click();
    expect(document.activeElement).toBe(buttons[0]);
  });
  it("focuses missing fields and does not submit incomplete reports", () => {
    const send = vi.fn(async () => {});
    dispose = initializeProblemReports({ send });
    submit();
    expect(status().textContent).toBe("Scrie pe scurt problema.");
    field("problem-summary").value = "Test";
    submit();
    expect(document.activeElement).toBe(field("problem-description"));
    expect(send).not.toHaveBeenCalled();
  });
  it("previews images and videos, deduplicates, removes and revokes resources", () => {
    dispose = initializeProblemReports();
    const photo = new File(["photo"], "proof.png", { type: "image/png" });
    const clip = new File(["clip"], "proof.mp4", { type: "video/mp4" });
    attach([photo, clip]);
    attach([photo]);
    expect(document.querySelectorAll("#problem-evidence-list li")).toHaveLength(2);
    const video = document.querySelector("video")!;
    expect(video.controls).toBe(true);
    expect(video.autoplay).toBe(false);
    document.querySelector<HTMLButtonElement>("#problem-evidence-list button")!.click();
    expect(document.querySelectorAll("#problem-evidence-list li")).toHaveLength(1);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
  it("rejects excessive or unsupported evidence without losing selected files", () => {
    dispose = initializeProblemReports();
    const photo = new File(["p"], "p.png", { type: "image/png" });
    attach([photo]);
    attach([new File(["x"], "secret.txt", { type: "text/plain" })]);
    expect(document.querySelectorAll("#problem-evidence-list li")).toHaveLength(1);
    expect(status().getAttribute("role")).toBe("alert");
    attach([1, 2, 3].map((i) => new File(["p"], i + ".png", { type: "image/png" })));
    expect(document.querySelectorAll("#problem-evidence-list li")).toHaveLength(1);
    expect(status().textContent).toContain("3");
    attach([new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })]);
    expect(status().textContent).toContain("5 MB");
  });
  it("sends an explicit multipart allowlist once, without reading accounts, and waits for acceptance", async () => {
    let finish!: () => void;
    const send = vi.fn(
      (_body: FormData, _signal: AbortSignal) =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    dispose = initializeProblemReports({ send });
    await settle();
    const reads = vi.spyOn(Storage.prototype, "getItem"),
      writes = vi.spyOn(Storage.prototype, "setItem");
    fill();
    attach([new File(["p"], "proof.png", { type: "image/png" })]);
    submit();
    submit();
    await settle();
    expect(send).toHaveBeenCalledOnce();
    const body = send.mock.calls[0]![0] as unknown as FormData;
    expect([...body.keys()]).toEqual([
      "reportId",
      "summary",
      "description",
      "version",
      "build",
      "files",
    ]);
    expect(field("problem-report-submit").disabled).toBe(true);
    expect(field("problem-description").value).not.toBe("");
    finish();
    await settle();
    expect(status().textContent).toBe("Raportul a fost primit. Mulțumim!");
    expect(field("problem-description").value).toBe("");
    expect(reads).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
  });
  it("preserves failed evidence and reuses the report id on retry", async () => {
    const send = vi.fn(async (_body: FormData) => {
      throw new Error("offline");
    });
    dispose = initializeProblemReports({ send });
    fill();
    attach([new File(["p"], "p.png", { type: "image/png" })]);
    submit();
    await settle();
    submit();
    await settle();
    expect(send.mock.calls[0]![0].get("reportId")).toBe(send.mock.calls[1]![0].get("reportId"));
    expect(field("problem-description").value).not.toBe("");
    expect(document.querySelectorAll("#problem-evidence-list li")).toHaveLength(1);
    field("problem-description").dispatchEvent(new Event("input", { bubbles: true }));
    submit();
    await settle();
    expect(send.mock.calls[2]![0].get("reportId")).not.toBe(send.mock.calls[0]![0].get("reportId"));
  });
  it("aborts and clears reports on account changes and ignores late success", async () => {
    let finish!: () => void, signal!: AbortSignal;
    dispose = initializeProblemReports({
      send: (_body, s) => {
        signal = s;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    fill();
    submit();
    await settle();
    document.dispatchEvent(new CustomEvent("hopper:ui", { detail: { kind: "screen" } }));
    expect(signal.aborted).toBe(true);
    finish();
    await settle();
    expect(status().textContent).toBe("");
    expect(field("problem-description").value).toBe("");
  });
  it("uses HTTPS multipart and cannot claim acceptance from a failed or malformed response", async () => {
    const body = new FormData(),
      signal = new AbortController().signal;
    await expect(sendProblemReport(body, signal, {})).rejects.toThrow("unavailable");
    const fetchMock = vi.fn(async (_url: string, _options: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ accepted: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    await sendProblemReport(body, signal, {
      endpoint: "https://example.test/report",
      publishableKey: "public",
    });
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      body,
      signal,
      headers: { apikey: "public" },
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ accepted: false }),
    });
    await expect(
      sendProblemReport(body, signal, {
        endpoint: "https://example.test/report",
        publishableKey: "public",
      }),
    ).rejects.toThrow("rate_limited");
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ accepted: false }),
    });
    await expect(
      sendProblemReport(body, signal, {
        endpoint: "https://example.test/report",
        publishableKey: "public",
      }),
    ).rejects.toThrow("unavailable");
  });

  it("localizes report feedback in all four languages", async () => {
    const win = window as Window & {
      HopperMessages?: Record<string, string[]>;
      HopperI18n?: { t: (key: string) => string };
    };
    new Function("window", readFileSync("mobile/app/translations.js", "utf8"))(window);
    try {
      for (const language of ["ro", "en", "fr", "ru"]) {
        const index = ["en", "fr", "ru"].indexOf(language);
        win.HopperI18n = {
          t: (key) => (index < 0 ? key : (win.HopperMessages![key]?.[index] ?? key)),
        };
        dispose = initializeProblemReports({ send: async () => {} });
        fill();
        submit();
        await settle();
        const key = "Raportul a fost primit. Mulțumim!";
        expect(status().textContent).toBe(win.HopperI18n.t(key));
        dispose();
      }
    } finally {
      delete win.HopperI18n;
      delete win.HopperMessages;
    }
  });
});
