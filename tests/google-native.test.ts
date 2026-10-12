import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  native: vi.fn(() => true),
  open: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  launch: vi.fn(async (): Promise<{ url: string } | undefined> => undefined),
  callbacks: new Map<string, (event: { url: string }) => void>(),
  remove: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: mocks.native } }));
vi.mock("@capacitor/app", () => ({
  App: {
    getLaunchUrl: mocks.launch,
    addListener: vi.fn(async (name, callback) => {
      mocks.callbacks.set(name, callback);
      return {
        remove: async () => {
          mocks.callbacks.delete(name);
          mocks.remove(name);
        },
      };
    }),
  },
}));
vi.mock("@capacitor/browser", () => ({
  Browser: {
    open: mocks.open,
    close: mocks.close,
    addListener: vi.fn(async (name, callback) => {
      mocks.callbacks.set(name, callback);
      return {
        remove: async () => {
          mocks.callbacks.delete(name);
          mocks.remove(name);
        },
      };
    }),
  },
}));
import { initializeGoogleAuth, isGoogleCallback } from "../mobile/google-auth";
const state = window as Window & {
  HopperAuth?: {
    completeGoogle: ReturnType<typeof vi.fn>;
    cancelGoogle: ReturnType<typeof vi.fn>;
    googlePending: ReturnType<typeof vi.fn>;
  };
  HopperCloudConfig?: { url: string; publishableKey: string };
};
let dispose: (() => Promise<void>) | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.callbacks.clear();
  mocks.native.mockReturnValue(true);
  mocks.launch.mockResolvedValue(undefined);
  state.HopperCloudConfig = {
    url: "https://project.supabase.co",
    publishableKey: "sb_publishable_test",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ external: { google: true } }) })),
  );
  state.HopperAuth = {
    completeGoogle: vi.fn(async () => {}),
    cancelGoogle: vi.fn(async () => {}),
    googlePending: vi.fn(() => true),
  };
});
afterEach(async () => {
  await dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
  delete state.HopperAuth;
  delete state.HopperCloudConfig;
  delete window.HopperOAuth;
});
describe("Native Google OAuth routing", () => {
  it("does not create a browser bridge outside the native app", async () => {
    mocks.native.mockReturnValue(false);
    dispose = await initializeGoogleAuth();
    expect(window.HopperOAuth).toBeUndefined();
    expect(mocks.callbacks.size).toBe(0);
  });
  it("uses the native secure browser for only the configured Google authorization endpoint", async () => {
    dispose = await initializeGoogleAuth();
    const url =
      "https://project.supabase.co/auth/v1/authorize?provider=google&redirect_to=ro.hopper.budget%3A%2F%2Fauth%2Fgoogle%3Fattempt%3Dtest-attempt";
    await window.HopperOAuth!.open(url);
    expect(mocks.open).toHaveBeenCalledWith({ url, presentationStyle: "fullscreen" });
  });
  it.each([
    "https://other.supabase.co/auth/v1/authorize?provider=google",
    "http://project.supabase.co/auth/v1/authorize?provider=google",
    "https://project.supabase.co/auth/v1/authorize?provider=github",
    "https://project.supabase.co/other?provider=google",
    "https://user:pass@project.supabase.co/auth/v1/authorize?provider=google",
  ])("rejects unrelated browser destinations %s", async (url) => {
    dispose = await initializeGoogleAuth();
    await expect(window.HopperOAuth!.open(url)).rejects.toThrow("google-unavailable");
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it.each([
    "https://example.test/google",
    "ro.hopper.budget://other/google",
    "ro.hopper.budget://auth/other",
    "ro.hopper.budget://auth/google#access_token=untrusted",
    "ro.hopper.budget://user:pass@auth/google",
  ])("ignores unrelated deep links %s", (url) => {
    expect(isGoogleCallback(url)).toBe(false);
  });
  it("keeps a disabled provider from opening a dead login page", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ external: { google: false } }),
    } as Response);
    dispose = await initializeGoogleAuth();
    await expect(
      window.HopperOAuth!.open(
        "https://project.supabase.co/auth/v1/authorize?provider=google&redirect_to=ro.hopper.budget%3A%2F%2Fauth%2Fgoogle%3Fattempt%3Dtest-attempt",
      ),
    ).rejects.toThrow("google-provider-disabled");
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("keeps network failures from opening the browser", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(Error("offline"));
    dispose = await initializeGoogleAuth();
    await expect(
      window.HopperOAuth!.open(
        "https://project.supabase.co/auth/v1/authorize?provider=google&redirect_to=ro.hopper.budget%3A%2F%2Fauth%2Fgoogle%3Fattempt%3Dtest-attempt",
      ),
    ).rejects.toThrow("offline");
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("does not open a late browser window after cancellation during the provider check", async () => {
    let done!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    dispose = await initializeGoogleAuth();
    const pending = window.HopperOAuth!.open(
      "https://project.supabase.co/auth/v1/authorize?provider=google&redirect_to=ro.hopper.budget%3A%2F%2Fauth%2Fgoogle%3Fattempt%3Dtest-attempt",
    );
    state.HopperAuth!.googlePending.mockReturnValue(false);
    done({ ok: true, json: async () => ({ external: { google: true } }) } as Response);
    await expect(pending).rejects.toThrow("google-cancelled");
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("routes warm app callbacks to the controller without closing a queued browser early", async () => {
    dispose = await initializeGoogleAuth();
    const url = "ro.hopper.budget://auth/google?attempt=test&code=test";
    mocks.callbacks.get("appUrlOpen")!({ url });
    await Promise.resolve();
    expect(state.HopperAuth!.completeGoogle).toHaveBeenCalledWith(url);
    expect(mocks.close).not.toHaveBeenCalled();
  });
  it("routes the launch URL after the app was closed during sign-in", async () => {
    const url = "ro.hopper.budget://auth/google?attempt=test&code=cold-test";
    mocks.launch.mockResolvedValueOnce({ url });
    dispose = await initializeGoogleAuth();
    expect(state.HopperAuth!.completeGoogle).toHaveBeenCalledWith(url);
  });
  it("cancels through the controller when the native browser is dismissed", async () => {
    dispose = await initializeGoogleAuth();
    mocks.callbacks.get("browserFinished")!({ url: "" });
    expect(state.HopperAuth!.cancelGoogle).toHaveBeenCalledOnce();
  });
  it("removes both native listeners and its bridge on disposal", async () => {
    dispose = await initializeGoogleAuth();
    await dispose();
    dispose = undefined;
    expect(window.HopperOAuth).toBeUndefined();
    expect(mocks.callbacks.size).toBe(0);
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });
  it("cleans up if the native launch API fails", async () => {
    mocks.launch.mockRejectedValueOnce(Error("plugin unavailable"));
    dispose = await initializeGoogleAuth();
    expect(window.HopperOAuth).toBeUndefined();
    expect(mocks.callbacks.size).toBe(0);
  });
});
