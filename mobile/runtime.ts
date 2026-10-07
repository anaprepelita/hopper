import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { bootNativeInterface } from "./bootstrap";
import { initializeProblemReports } from "./support";
import { initializeProfileCrop } from "./profile-crop";
import { initializeAccountPersistence } from "./persistence";
import { initializePhoneNavigation } from "./navigation";

// Reuse the existing buttons and dialog cancellation; never write account data.
export function handleNativeBack(document: Document): boolean {
  const dialog = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).at(-1);
  if (dialog) {
    if (dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) dialog.close();
    return true;
  }
  const tab = document.querySelector<HTMLButtonElement>(".view-tab.active");
  if (tab && tab.dataset["view"] !== "home") {
    document.querySelector<HTMLButtonElement>('.view-tab[data-view="home"]')?.click();
    return true;
  }
  const registration = document.querySelector("#register-form.active");
  if (registration && !document.querySelector("#auth-screen.hidden")) {
    document.querySelector<HTMLButtonElement>('[data-target="login-form"]')?.click();
    return true;
  }
  return false;
}

export async function initializeNativeShell() {
  if (!Capacitor.isNativePlatform()) return async () => {};
  const root = document.documentElement;
  root.classList.add("hopper-native");
  const updateBars = () => {
    void SystemBars.setStyle({
      style: root.dataset["theme"] === "night" ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    }).catch(() => {});
  };
  updateBars();
  const disposeReports = initializeProblemReports();
  const disposeCrop = initializeProfileCrop();
  const disposeNavigation = initializePhoneNavigation();
  const observer = new MutationObserver(updateBars);
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  const listeners: { remove: () => Promise<void> }[] = [];
  const dispose = async () => {
    observer.disconnect();
    disposeReports();
    disposeCrop();
    disposeNavigation();
    await Promise.allSettled(listeners.map((listener) => listener.remove()));
  };
  try {
    listeners.push(
      await App.addListener("backButton", () => {
        if (!handleNativeBack(document)) void App.minimizeApp().catch(() => {});
      }),
    );
    listeners.push(
      await App.addListener("appStateChange", ({ isActive }) => {
        // Resume the existing guarded synchronizer; an unavailable/offline backend is safe.
        if (!isActive) void window.HopperPersistence?.flush().catch(() => {});
        if (isActive) {
          const sync = (window as Window & { HopperSync?: { synchronize: () => Promise<void> } })
            .HopperSync;
          void sync?.synchronize().catch(() => {});
          updateBars();
        }
      }),
    );
  } catch {
    // Report sending and photo cropping remain usable if lifecycle listeners fail.
    await Promise.allSettled(listeners.splice(0).map((listener) => listener.remove()));
  }
  return dispose;
}

void bootNativeInterface(Capacitor.isNativePlatform(), undefined, initializeAccountPersistence)
  .then(async (started) => {
    if (started) await initializeNativeShell();
  })
  .catch(() => {
    // Native helpers are optional; the tracker remains usable if a plugin fails.
  });
