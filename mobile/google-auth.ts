import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

type OAuthBridge = { open: (url: string) => Promise<void>; close: () => Promise<void> };
type Controller = {
  completeGoogle: (url: string) => Promise<void>;
  cancelGoogle: (fromBrowser?: boolean) => Promise<void>;
  googlePending: (nonce: string) => boolean;
};
declare global {
  interface Window {
    HopperOAuth?: OAuthBridge;
  }
}
const controller = () => (window as Window & { HopperAuth?: Controller }).HopperAuth;
export function isGoogleCallback(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "ro.hopper.budget:" &&
      url.hostname === "auth" &&
      url.pathname === "/google" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash
    );
  } catch {
    return false;
  }
}
export async function initializeGoogleAuth(): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) return async () => {};
  const listeners: { remove: () => Promise<void> }[] = [];
  let disposed = false;
  let oauthCheckController: AbortController | null = null;
  const close = async () => {
    oauthCheckController?.abort();
    try {
      await Browser.close();
    } catch {
      /* Android returns through the app link. */
    }
  };
  const bridge: OAuthBridge = {
    async open(value) {
      const url = new URL(value);
      const config = (
        window as Window & { HopperCloudConfig?: { url: string; publishableKey: string } }
      ).HopperCloudConfig;
      if (
        !config?.url ||
        url.origin !== new URL(config.url).origin ||
        url.username ||
        url.password ||
        url.hash ||
        url.protocol !== "https:" ||
        url.pathname !== "/auth/v1/authorize" ||
        url.searchParams.get("provider") !== "google"
      )
        throw Error("google-unavailable");
      const check = new AbortController();
      oauthCheckController = check;
      const timeout = setTimeout(() => check.abort(), 15000);
      try {
        const response = await fetch(new URL("/auth/v1/settings", config.url), {
          headers: { apikey: config.publishableKey },
          signal: check.signal,
        });
        if (!response.ok) throw Error("google-provider-disabled");
        const settings = (await response.json()) as { external?: { google?: boolean } };
        if (!settings.external?.google) throw Error("google-provider-disabled");
      } finally {
        clearTimeout(timeout);
        if (oauthCheckController === check) oauthCheckController = null;
      }
      const redirect = new URL(url.searchParams.get("redirect_to") || "");
      if (disposed || !controller()?.googlePending(redirect.searchParams.get("attempt") || ""))
        throw Error("google-cancelled");
      await Browser.open({ url: url.href, presentationStyle: "fullscreen" });
    },
    close,
  };
  window.HopperOAuth = bridge;
  const receive = async (value: string) => {
    if (!isGoogleCallback(value)) return;
    await controller()?.completeGoogle(value);
  };
  try {
    listeners.push(
      await App.addListener("appUrlOpen", ({ url }) => {
        void receive(url).catch(() => {});
      }),
    );
    listeners.push(
      await Browser.addListener("browserFinished", () => {
        void controller()?.cancelGoogle(true);
      }),
    );
    const launched = await App.getLaunchUrl();
    if (launched?.url) await receive(launched.url);
  } catch {
    await Promise.allSettled(listeners.splice(0).map((listener) => listener.remove()));
    delete window.HopperOAuth;
  }
  return async () => {
    disposed = true;
    oauthCheckController?.abort();
    if (window.HopperOAuth === bridge) delete window.HopperOAuth;
    await Promise.allSettled(listeners.map((listener) => listener.remove()));
  };
}
