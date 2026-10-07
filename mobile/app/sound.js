/* A local achievement chime, independent of decorative animation libraries. */
(() => {
  "use strict";
  const preferenceKey = "hopper_achievement_sound";
  const controls = document.getElementById("achievement-sound-settings");
  const toggle = document.getElementById("achievement-sound-enabled");
  const preview = document.getElementById("achievement-sound-preview");
  const Audio = window.AudioContext || window.webkitAudioContext;
  let enabled = true;
  let context = null;
  let generation = 0;
  const voices = new Set();
  try { enabled = localStorage.getItem(preferenceKey) !== "off"; } catch { /* Page-local preference still works. */ }

  function stopSound() {
    generation++;
    for (const voice of voices) {
      try { voice.oscillator.stop(); } catch { /* A finished note may already be stopped. */ }
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    }
    voices.clear();
  }

  async function prepareAudio() {
    if (!Audio || !enabled || document.hidden) return null;
    try {
      if (!context || context.state === "closed") context = new Audio();
      const audio = context;
      if (audio.state !== "running") await audio.resume();
      return audio.state === "running" ? audio : null;
    } catch { return null; }
  }

  async function playSound(notification = null) {
    if (!enabled || document.hidden || document.getElementById("app-screen")?.classList.contains("hidden")) return;
    stopSound();
    const ticket = generation;
    const requestedAt = Date.now();
    const audio = await prepareAudio();
    if (!audio || ticket !== generation || Date.now() - requestedAt > 800 ||
        !enabled || document.hidden ||
        document.getElementById("app-screen")?.classList.contains("hidden") ||
        (notification && !notification.classList.contains("visible"))) return;
    try {
      [523.25, 659.25, 1046.5].forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const voice = { oscillator, gain };
        voices.add(voice);
        oscillator.type = "triangle";
        const start = audio.currentTime + .01 + index * .12;
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(.045, start + .015);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .26);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.onended = () => {
          if (!voices.delete(voice)) return;
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + .28);
      });
    } catch { stopSound(); }
  }

  function gesture(event) {
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
    void prepareAudio();
  }
  function ui(event) {
    const { kind, target } = event.detail || {};
    if (kind === "achievement-celebration") {
      const notification = document.getElementById(target);
      if (notification?.classList.contains("visible")) void playSound(notification);
    } else if (kind === "achievement-dismissed" || kind === "view" ||
               (kind === "screen" && target === "auth-screen")) stopSound();
  }
  function syncControl() {
    if (toggle) toggle.checked = enabled;
    if (preview) preview.disabled = !enabled;
  }
  function change() {
    enabled = toggle.checked;
    if (!enabled) stopSound();
    syncControl();
    try { localStorage.setItem(preferenceKey, enabled ? "on" : "off"); } catch { /* Keep current-page choice. */ }
  }
  function previewSound() { void playSound(); }
  function background() {
    if (!document.hidden) return;
    stopSound();
    try { context?.suspend().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  function closeAudio() {
    stopSound();
    const audio = context;
    context = null;
    try { audio?.close().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  document.addEventListener("pointerup", gesture, true);
  document.addEventListener("click", gesture, true);
  document.addEventListener("keydown", gesture, true);
  document.addEventListener("hopper:ui", ui);
  document.addEventListener("visibilitychange", background);
  window.addEventListener("pagehide", closeAudio);
  toggle?.addEventListener("change", change);
  preview?.addEventListener("click", previewSound);
  syncControl();
  if (controls) controls.hidden = !Audio;
  window.HopperSound = {
    dispose() {
      closeAudio();
      document.removeEventListener("pointerup", gesture, true);
      document.removeEventListener("click", gesture, true);
      document.removeEventListener("keydown", gesture, true);
      document.removeEventListener("hopper:ui", ui);
      document.removeEventListener("visibilitychange", background);
      window.removeEventListener("pagehide", closeAudio);
      toggle?.removeEventListener("change", change);
      preview?.removeEventListener("click", previewSound);
      if (controls) controls.hidden = true;
    },
  };
})();
