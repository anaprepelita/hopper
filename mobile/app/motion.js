/* Standalone presentation controls; financial data remains owned by script.js. */
(() => {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const animator = window.anime;
  const activeAnimations = new Map();
  const previousValues = new Map();
  const valueSelector =
    "#monthly-income, #monthly-expenses, #monthly-balance, #budget-remaining, #report-total";
  let animationFailed = false;

  function restore(element, originalStyle) {
    if (originalStyle === null) element.removeAttribute("style");
    else element.setAttribute("style", originalStyle);
    if (element.matches(".motion-particle, .motion-glimmer")) {
      const parent = element.parentElement;
      element.remove();
      if (parent?.matches(".motion-particles") && !parent.childElementCount) parent.remove();
    }
  }

  function stopAnimation(element) {
    const record = activeAnimations.get(element);
    if (!record) return;
    activeAnimations.delete(element);
    try {
      record.animation.revert();
    } catch {
      // Restore content even if the animation library fails during cancellation.
    }
    restore(element, record.originalStyle);
  }

  function stopAll() {
    for (const element of activeAnimations.keys()) stopAnimation(element);
  }

  function visible(element) {
    return (
      element?.isConnected &&
      !element.closest(
        ".hidden, [hidden], .page-view:not(.active), .auth-form:not(.active), dialog:not([open])",
      )
    );
  }

  function play(element, parameters, decorative = false) {
    stopAnimation(element);
    if (
      !visible(element) ||
      reducedMotion?.matches ||
      document.hidden ||
      animationFailed ||
      !animator?.animate
    )
      return false;

    const originalStyle = element.getAttribute("style");
    try {
      const animation = animator.animate(element, {
        ease: "outQuad",
        ...parameters,
        onComplete(self) {
          if (activeAnimations.get(element)?.animation !== self) return;
          stopAnimation(element);
        },
      });
      activeAnimations.set(element, { animation, originalStyle, decorative });
      return true;
    } catch {
      // A presentation failure must never leave an element hidden or block input.
      restore(element, originalStyle);
      animationFailed = true;
      stopAll();
      return false;
    }
  }

  function enter(element, duration, delay = 0) {
    play(element, { opacity: [0, 1], translateY: [8, 0], duration, delay });
  }

  function enterPage(page, duration) {
    if (!visible(page)) return;
    page.querySelectorAll(".panel").forEach((panel, index) => {
      enter(panel, duration, Math.min(index * 35, 175));
    });
    if (page.dataset.view === "home") {
      page.querySelectorAll(".icon-box").forEach((icon, index) => {
        play(
          icon,
          {
            keyframes: [
              { translateY: 0, scale: 0.9 },
              { translateY: -4, scale: 1.06 },
              { translateY: 0, scale: 1 },
            ],
            duration: 380,
            delay: Math.min(index * 35, 175),
          },
          true,
        );
      });
    } else if (page.dataset.view === "report") {
      enterReportRows(page);
    }
  }

  function enterReportRows(page) {
    Array.from(page.querySelectorAll(".report-item"))
      .slice(0, 12)
      .forEach((row, index) => {
        play(
          row,
          { opacity: [0, 1], translateY: [5, 0], duration: 220, delay: Math.min(index * 25, 175) },
          true,
        );
      });
  }

  function canDecorate(host) {
    return (
      visible(host) &&
      !reducedMotion?.matches &&
      !document.hidden &&
      !animationFailed &&
      Boolean(animator?.animate)
    );
  }

  function sparkle(host, count = 8, stars = false) {
    if (!canDecorate(host)) return;
    // Replace an earlier burst so rapid actions cannot accumulate particle layers.
    host.querySelectorAll(".motion-particle").forEach(stopAnimation);
    const layer = document.createElement("span");
    layer.className = "motion-particles";
    layer.setAttribute("aria-hidden", "true");
    host.appendChild(layer);
    const colors = ["var(--w-pink)", "var(--w-lilac)", "var(--w-mint)", "var(--w-sky)"];
    for (let index = 0; index < count; index++) {
      if (!canDecorate(host)) break;
      const particle = document.createElement("span");
      particle.className = stars ? "motion-particle star" : "motion-particle";
      particle.style.setProperty("--particle-color", colors[index % colors.length]);
      layer.appendChild(particle);
      const angle = Math.PI + ((index + 0.5) / count) * Math.PI;
      if (
        !play(
          particle,
          {
            translateX: [0, Math.cos(angle) * 58],
            translateY: [0, Math.sin(angle) * 38 - 10],
            opacity: [1, 0],
            scale: [1, 0.6],
            duration: 700,
            delay: index * 18,
          },
          true,
        )
      )
        particle.remove();
    }
    if (!layer.childElementCount) layer.remove();
  }

  function glowCard(card) {
    if (!canDecorate(card)) return;
    card.querySelectorAll(".motion-glimmer").forEach(stopAnimation);
    const glow = document.createElement("span");
    glow.className = "motion-glimmer";
    glow.setAttribute("aria-hidden", "true");
    card.appendChild(glow);
    if (
      !play(
        glow,
        {
          keyframes: [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }],
          duration: 550,
        },
        true,
      )
    )
      glow.remove();
  }

  function glowGoal(progress) {
    glowCard(progress?.closest(".goal-card"));
  }

  function enterScreen(id) {
    stopAll();
    const screen = document.getElementById(id);
    if (!visible(screen)) return;
    if (id === "app-screen") {
      enter(screen.querySelector(".topbar"), 240);
      enter(screen.querySelector(".view-tabs"), 240);
      enterPage(screen.querySelector(".page-view.active"), 240);
    }
  }

  function syncValues(feedback = false) {
    document.querySelectorAll(valueSelector).forEach((element) => {
      const value = element.textContent;
      const previous = previousValues.get(element);
      previousValues.set(element, value);
      if (feedback && previous !== undefined && previous !== value) {
        play(element, { scale: [1.025, 1], duration: 180 });
      }
    });
  }

  function syncDecor() {
    const reduced = Boolean(reducedMotion?.matches);
    document.documentElement.dataset.reducedMotion = String(reduced);
    document.documentElement.dataset.decorPaused = String(reduced || document.hidden);
    if (reduced || document.hidden) stopAll();
  }

  reducedMotion?.addEventListener("change", syncDecor);
  document.addEventListener("visibilitychange", syncDecor);

  document.getElementById("brand-bunny-button")?.addEventListener("click", (event) => {
    play(
      event.currentTarget.querySelector(".hopper-brand-icon"),
      {
        keyframes: [
          { translateY: 0 },
          { translateY: -8 },
          { translateY: 0 },
          { translateY: -4 },
          { translateY: 0 },
        ],
        duration: 600,
      },
      true,
    );
  });

  document.addEventListener("hopper:ui", (event) => {
    const { kind, target } = event.detail || {};
    if (kind === "screen") {
      syncValues();
      enterScreen(target);
    } else if (kind === "view") {
      stopAll();
      const page = Array.from(document.querySelectorAll(".page-view")).find(
        (element) => element.dataset.view === target,
      );
      enterPage(page, 180);
    } else if (kind === "auth-form") {
      stopAll();
    } else if (kind === "dialog") {
      const dialog = document.getElementById(target);
      play(dialog, { opacity: [0, 1], scale: [0.98, 1], duration: 160 });
    } else if (kind === "render") {
      for (const element of activeAnimations.keys()) {
        if (!element.isConnected) stopAnimation(element);
      }
      syncValues(true);
      const report = document.querySelector('.page-view.active[data-view="report"]');
      if (report) enterReportRows(report);
    } else if (kind === "expense-added") {
      sparkle(document.getElementById(target), 6, true);
    } else if (kind === "savings-contribution" || kind === "savings-reached") {
      const progress = document.getElementById(target);
      glowGoal(progress);
      if (kind === "savings-reached") sparkle(progress?.closest(".goal-card"), 12);
    } else if (kind === "achievement-unlocked") {
      const card = document.getElementById(target);
      if (!canDecorate(card)) return;
      glowCard(card);
      play(
        card.querySelector(".achievement-icon"),
        { keyframes: [{ scale: 1, translateY: 0 }, { scale: 1.15, translateY: -4 }, { scale: 1, translateY: 0 }], duration: 600 },
        true,
      );
    } else if (kind === "achievement-celebration") {
      const notification = document.getElementById(target);
      if (!notification?.classList.contains("visible")) return;
      sparkle(notification, 10, true);
      play(
        notification.querySelector(".achievement-icon"),
        { keyframes: [{ scale: 0.8 }, { scale: 1.15 }, { scale: 1 }], duration: 600 },
        true,
      );
    } else if (kind === "achievement-dismissed") {
      const notification = document.getElementById(target);
      for (const element of activeAnimations.keys()) {
        if (notification?.contains(element)) stopAnimation(element);
      }
    } else if (kind === "profile-saved") {
      play(
        document.getElementById(target),
        {
          keyframes: [{ scale: 1 }, { scale: 1.06 }, { scale: 1 }],
          duration: 360,
        },
        true,
      );
    }
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("close", () => stopAnimation(dialog));
  });
  window.addEventListener("pagehide", stopAll);

  syncDecor();
  syncValues();
  const screen = document.querySelector(".app-screen:not(.hidden), .auth-screen:not(.hidden)");
  if (screen) enterScreen(screen.id);
})();
