(() => {
  "use strict";
  const languages = { ro: "ro-RO", en: "en-GB", fr: "fr-FR", ru: "ru-RU" };
  let language = "ro";
  const picker = document.getElementById("language-picker");
  const options = document.getElementById("language-options");
  let pickerTrigger = null;
  const renderedMessages = new Map();
  try {
    const saved = localStorage.getItem("hopper_language");
    if (saved in languages) language = saved;
  } catch {
    /* The selector still works without storage. */
  }
  function t(key, values = []) {
    if (!key) return "";
    const index = { en: 0, fr: 1, ru: 2 }[language];
    const message = (index !== undefined && window.HopperMessages?.[key]?.[index]) || key;
    const result = message.replace(/\{(\d+)\}/g, (_, i) => String(values[i] ?? ""));
    renderedMessages.set(result, { key, values });
    return result;
  }
  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    for (const attr of ["placeholder", "aria-label", "title"]) {
      root
        .querySelectorAll(`[data-i18n-${attr}]`)
        .forEach((el) => el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`))));
    }
    document.documentElement.lang = language;
    document.querySelectorAll("[data-language-choice]").forEach((el) => {
      el.value = language;
    });
    document.querySelectorAll("[data-language-trigger]").forEach((button) => {
      const field = document.getElementById(button.dataset.languageTrigger);
      button.querySelector(".language-field-value").textContent =
        field.selectedOptions[0]?.textContent || "";
    });
    options?.querySelectorAll("button").forEach((button) => {
      const selected = button.dataset.value === language;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll(".calendar-weekdays").forEach((row) =>
      [...row.children].forEach((day, i) => {
        day.textContent = new Intl.DateTimeFormat(languages[language], { weekday: "short" }).format(
          new Date(2026, 0, 5 + i),
        );
      }),
    );
  }
  function setLanguage(value) {
    if (!(value in languages)) return;
    const feedback = [
      ...document.querySelectorAll(".student-note[role], .field-error, #login-status"),
    ].map((el) => [el, renderedMessages.get(el.textContent)]);
    language = value;
    try {
      localStorage.setItem("hopper_language", value);
    } catch {
      /* Session-only preference. */
    }
    apply();
    feedback.forEach(([el, original]) => {
      if (original) el.textContent = t(original.key, original.values);
    });
    document.dispatchEvent(new CustomEvent("hopper:language"));
  }
  window.HopperI18n = {
    t,
    apply,
    setLanguage,
    language: () => language,
    locale: () => languages[language],
  };
  document
    .querySelectorAll("[data-language-choice]")
    .forEach((el) => el.addEventListener("change", () => setLanguage(el.value)));
  // Use the same retro dialog and option styles as study year; retain the native fallback.
  if (typeof picker?.showModal === "function") {
    document.querySelectorAll("[data-language-trigger]").forEach((trigger) => {
      const field = document.getElementById(trigger.dataset.languageTrigger);
      trigger.addEventListener("click", () => {
        pickerTrigger = trigger;
        options.replaceChildren();
        [...field.options].forEach((option) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "study-year-option";
          button.dataset.value = option.value;
          button.textContent = option.textContent;
          const selected = option.value === language;
          button.classList.toggle("selected", selected);
          button.setAttribute("aria-pressed", String(selected));
          button.tabIndex = selected ? 0 : -1;
          button.addEventListener("focus", () => {
            options.querySelectorAll("button").forEach((item) => {
              item.tabIndex = item === button ? 0 : -1;
            });
          });
          button.addEventListener("click", () => {
            setLanguage(option.value);
            picker.close();
          });
          options.appendChild(button);
        });
        picker.showModal();
        trigger.setAttribute("aria-expanded", "true");
        options.querySelector('[tabindex="0"]')?.focus();
      });
      field.hidden = true;
      trigger.hidden = false;
      document.getElementById(`${field.id}-label`).htmlFor = trigger.id;
    });
    options.addEventListener("keydown", (event) => {
      const buttons = [...options.querySelectorAll("button")];
      const index = buttons.indexOf(event.target);
      if (index < 0) return;
      const next = {
        ArrowDown: Math.min(index + 1, buttons.length - 1),
        ArrowUp: Math.max(index - 1, 0),
        Home: 0,
        End: buttons.length - 1,
      }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      buttons[next].focus();
    });
    document.getElementById("language-close").addEventListener("click", () => picker.close());
    picker.addEventListener("click", (event) => {
      if (event.target === picker) picker.close();
    });
    picker.addEventListener("close", () => {
      pickerTrigger?.setAttribute("aria-expanded", "false");
      pickerTrigger?.focus();
    });
  }
  apply();
})();
