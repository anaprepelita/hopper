import { appScripts } from "./resources.mjs";

function loadLocalScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(`Unable to load app resource: ${src}`));
    };
    document.body.appendChild(script);
  });
}

export async function bootNativeInterface(
  isNative: boolean,
  loadScript: (src: string) => Promise<void> = loadLocalScript,
  prepareStorage?: () => Promise<void>,
): Promise<boolean> {
  const status = document.getElementById("native-launch-status");
  const message = document.getElementById("native-launch-message");
  const ui = document.getElementById("native-interface");
  const retry = document.getElementById("native-launch-retry");
  if (!status || !message || !ui || !retry) return false;
  if (!isNative) {
    message.textContent = "Deschide Hopper din aplicația pentru Android sau iPhone.";
    return false;
  }
  try {
    if (prepareStorage) await prepareStorage();
    for (const script of appScripts.filter((script) => script.required)) {
      await loadScript(script.src);
    }
    status.hidden = true;
    ui.hidden = false;
    // Layout and entry animations need the visible, initialized financial interface.
    for (const script of appScripts.filter((script) => !script.required)) {
      try {
        await loadScript(script.src);
      } catch {
        /* Optional synchronization/motion cannot block local use. */
      }
    }
    return true;
  } catch (error) {
    message.textContent =
      error instanceof Error && error.name === "HopperStorageError"
        ? error.message
        : "Aplicația nu s-a putut deschide. Încearcă din nou.";
    status.setAttribute("role", "alert");
    retry.hidden = false;
    retry.addEventListener("click", () => window.location.reload(), { once: true });
    return false;
  }
}
