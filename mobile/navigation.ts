// Native presentation only: tab positions and keyboard clearance never store account data.
export function initializePhoneNavigation(): () => void {
  const root = document.documentElement;
  const positions = new Map<string, number>();
  const activeView = () =>
    document.querySelector<HTMLElement>(".view-tab.active")?.dataset["view"] ?? "home";
  let current = activeView();
  positions.set(current, window.scrollY);
  const rememberPosition = () => positions.set(current, window.scrollY);
  root.dataset["nativeView"] = current;
  let viewportHeight = window.innerHeight;
  let disposed = false;
  const phone = () => window.matchMedia("(max-width: 720px)").matches;
  const updateKeyboard = () => {
    if (disposed) return;
    const editing = !!document.activeElement?.matches(
      "input:not([type=hidden]):not([type=range]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea, [contenteditable=true]",
    );
    const height = window.visualViewport?.height ?? window.innerHeight;
    if (!editing) viewportHeight = window.innerHeight;
    root.dataset["keyboardVisible"] = String(editing && viewportHeight - height > 140);
  };
  const afterFocus = () => queueMicrotask(updateKeyboard);
  const onUI = (event: Event) => {
    const detail = (event as CustomEvent<{ kind: string; target?: string }>).detail;
    if (detail?.kind === "view") {
      const next = activeView();
      if (next === current) return;
      current = next;
      root.dataset["nativeView"] = current;
      if (phone()) window.scrollTo({ top: positions.get(current) ?? 0, behavior: "auto" });
    } else if (detail?.kind === "screen") {
      positions.clear();
      current = activeView();
      root.dataset["nativeView"] = current;
      if (phone()) window.scrollTo({ top: 0, behavior: "auto" });
    }
    updateKeyboard();
  };
  window.addEventListener("scroll", rememberPosition, { passive: true });
  document.addEventListener("hopper:ui", onUI);
  document.addEventListener("focusin", afterFocus);
  document.addEventListener("focusout", afterFocus);
  window.addEventListener("resize", updateKeyboard);
  window.visualViewport?.addEventListener("resize", updateKeyboard);
  updateKeyboard();
  return () => {
    disposed = true;
    window.removeEventListener("scroll", rememberPosition);
    document.removeEventListener("hopper:ui", onUI);
    document.removeEventListener("focusin", afterFocus);
    document.removeEventListener("focusout", afterFocus);
    window.removeEventListener("resize", updateKeyboard);
    window.visualViewport?.removeEventListener("resize", updateKeyboard);
    delete root.dataset["keyboardVisible"];
    delete root.dataset["nativeView"];
  };
}
