// Injected only into local development bundles, never into APK/AAB resources.
(() => {
  if (!window.Capacitor?.isNativePlatform()) return;
  const key = "hopper_live_view";
  let lastRevision = null;
  let pending = false;
  let rememberedView;
  try {
    rememberedView = window.sessionStorage.getItem(key);
  } catch {
    /* Optional UI state. */
  }
  const restoreView = (event) => {
    if (event.detail?.kind !== "screen" || event.detail.target !== "app-screen") return;
    document.removeEventListener("hopper:ui", restoreView);
    if (["home", "report", "goals", "settings"].includes(rememberedView)) {
      document.querySelector(`.view-tab[data-view="${rememberedView}"]`)?.click();
    }
  };
  document.addEventListener("hopper:ui", restoreView);
  const reload = () => {
    if (document.hidden) {
      pending = true;
      return;
    }
    try {
      const view = document.querySelector(".view-tab.active")?.dataset.view;
      if (view) window.sessionStorage.setItem(key, view);
    } catch {
      /* Reload works without session storage. */
    }
    window.location.reload();
  };
  const events = new window.EventSource("/__hopper_live_events");
  events.addEventListener("revision", (event) => {
    const revision = event.data;
    if (lastRevision !== null && revision !== lastRevision) reload();
    lastRevision = revision;
  });
  const onVisibility = () => {
    if (pending && !document.hidden) {
      pending = false;
      reload();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener(
    "pagehide",
    () => {
      events.close();
      document.removeEventListener("hopper:ui", restoreView);
      document.removeEventListener("visibilitychange", onVisibility);
    },
    { once: true },
  );
})();
