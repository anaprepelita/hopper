import { App } from "@capacitor/app";
import {
  evidenceError,
  cleanText,
  newReportId,
} from "../supabase/functions/_shared/report-contract";
type ReportConfig = { endpoint?: string; publishableKey?: string };
type AppInfo = { version: string; build: string };
type SupportWindow = Window & {
  HopperReportConfig?: ReportConfig;
  HopperI18n?: { t: (key: string) => string };
};
const text = (key: string) => (window as SupportWindow).HopperI18n?.t(key) ?? key;

export async function sendProblemReport(
  form: FormData,
  signal: AbortSignal,
  config = (window as SupportWindow).HopperReportConfig ?? {},
) {
  if (!config.endpoint || !config.publishableKey || !config.endpoint.startsWith("https://"))
    throw new Error("unavailable");
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: { apikey: config.publishableKey },
    body: form,
    signal,
  });
  if (response.status === 429) throw new Error("rate_limited");
  if (!response.ok) throw new Error("unavailable");
  const result = (await response.json()) as { accepted?: boolean };
  if (result.accepted !== true) throw new Error("unavailable");
}
export function initializeProblemReports(
  options: {
    send?: (form: FormData, signal: AbortSignal) => Promise<void>;
    getInfo?: () => Promise<AppInfo>;
  } = {},
) {
  const dialog = document.querySelector<HTMLDialogElement>("#problem-report-dialog");
  const form = document.querySelector<HTMLFormElement>("#problem-report-form");
  const summary = document.querySelector<HTMLInputElement>("#problem-summary");
  const description = document.querySelector<HTMLTextAreaElement>("#problem-description");
  const input = document.querySelector<HTMLInputElement>("#problem-evidence");
  const list = document.querySelector<HTMLElement>("#problem-evidence-list");
  const status = document.querySelector<HTMLElement>("#problem-report-status");
  const submit = document.querySelector<HTMLButtonElement>("#problem-report-submit");
  const close = document.querySelector<HTMLButtonElement>("#problem-report-close");
  const choose = document.querySelector<HTMLButtonElement>("#choose-problem-evidence");
  if (
    !dialog ||
    !form ||
    !summary ||
    !description ||
    !input ||
    !list ||
    !status ||
    !submit ||
    !close ||
    !choose
  )
    return () => {};
  const send = options.send ?? sendProblemReport;
  let info: AppInfo | undefined, trigger: HTMLButtonElement | undefined;
  let files: File[] = [],
    urls: string[] = [],
    busy = false,
    disposed = false,
    reportId = "",
    request = 0;
  let abort: AbortController | undefined;
  const cleanups: (() => void)[] = [];
  void Promise.resolve()
    .then(options.getInfo ?? (() => App.getInfo()))
    .then((value) => {
      info = value;
    })
    .catch(() => {});
  function listen(target: EventTarget, event: string, handler: EventListener) {
    target.addEventListener(event, handler);
    cleanups.push(() => target.removeEventListener(event, handler));
  }
  function feedback(key: string, error = false) {
    status!.textContent = text(key);
    status!.setAttribute("role", error ? "alert" : "status");
    status!.classList.toggle(
      "problem-report-status-success",
      key === "Raportul a fost primit. Mulțumim!",
    );
  }
  function lock(value: boolean) {
    busy = value;
    for (const field of [summary, description, input, submit, choose]) field!.disabled = value;
    list!.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      button.disabled = value;
    });
  }
  function releaseURLs() {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls = [];
  }
  function renderEvidence() {
    releaseURLs();
    list!.replaceChildren();
    files.forEach((file, index) => {
      const row = document.createElement("li");
      const media = file.type.startsWith("video/")
        ? document.createElement("video")
        : document.createElement("img");
      const url = URL.createObjectURL(file);
      urls.push(url);
      media.src = url;
      if (media instanceof HTMLVideoElement) {
        media.controls = true;
        media.preload = "metadata";
      } else media.alt = "";
      const label = document.createElement("span");
      label.textContent = file.name + " · " + (file.size / 1024 / 1024).toFixed(1) + " MB";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", text("Elimină dovada") + ": " + file.name);
      remove.disabled = busy;
      remove.addEventListener("click", () => {
        if (busy) return;
        files.splice(index, 1);
        reportId = "";
        renderEvidence();
        input!.focus();
      });
      row.append(media, label, remove);
      list!.append(row);
    });
  }
  function reset() {
    request++;
    abort?.abort();
    lock(false);
    files = [];
    reportId = "";
    releaseURLs();
    list!.replaceChildren();
    form!.reset();
    status!.textContent = "";
    status!.classList.remove("problem-report-status-success");
    if (dialog!.open) dialog!.close();
  }
  document.querySelectorAll<HTMLButtonElement>("[data-open-problem-report]").forEach((button) =>
    listen(button, "click", () => {
      if (dialog.open) return;
      trigger = button;
      dialog.showModal();
      if (!options.send && !(window as SupportWindow).HopperReportConfig?.endpoint)
        feedback("Trimiterea rapoartelor nu este disponibilă momentan.");
      button.setAttribute("aria-expanded", "true");
      summary.focus();
      document.dispatchEvent(
        new CustomEvent("hopper:ui", { detail: { kind: "dialog", target: dialog.id } }),
      );
    }),
  );
  listen(close, "click", () => dialog.close());
  listen(dialog, "click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  listen(dialog, "close", () => {
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.focus();
  });
  listen(document, "hopper:ui", (event) => {
    if ((event as CustomEvent<{ kind: string }>).detail?.kind === "screen") reset();
  });
  listen(document, "hopper:language", renderEvidence);
  listen(form, "input", () => {
    if (!busy) reportId = "";
  });
  listen(choose, "click", () => input.click());
  listen(input, "change", () => {
    if (busy) return;
    const incoming = [...(input.files ?? [])];
    const combined = [...files];
    for (const file of incoming)
      if (
        !combined.some(
          (item) =>
            item.name === file.name &&
            item.size === file.size &&
            item.lastModified === file.lastModified,
        )
      )
        combined.push(file);
    const error = evidenceError(combined);
    input.value = "";
    if (error) {
      feedback(error, true);
      return;
    }
    files = combined;
    reportId = "";
    status.textContent = "";
    renderEvidence();
  });
  listen(form, "submit", (event) => {
    event.preventDefault();
    if (busy) return;
    if (!summary.value.trim()) {
      feedback("Scrie pe scurt problema.", true);
      summary.focus();
      return;
    }
    if (!description.value.trim()) {
      feedback("Descrie problema înainte de trimitere.", true);
      description.focus();
      return;
    }
    const error = evidenceError(files);
    if (error) {
      feedback(error, true);
      return;
    }
    const body = new FormData();
    reportId ||= newReportId();
    body.set("reportId", reportId);
    body.set("summary", cleanText(summary.value, 120));
    body.set("description", cleanText(description.value, 2000));
    if (info) {
      body.set("version", cleanText(info.version, 40));
      body.set("build", cleanText(info.build, 40));
    }
    files.forEach((file) => body.append("files", file, file.name));
    const current = ++request;
    abort = new AbortController();
    const controller = abort;
    const timeout = setTimeout(() => controller.abort(), 90000);
    lock(true);
    feedback("Se trimite raportul…");
    void Promise.resolve()
      .then(() => send(body, controller.signal))
      .then(() => {
        if (disposed || current !== request) return;
        files = [];
        reportId = "";
        releaseURLs();
        list.replaceChildren();
        form.reset();
        feedback("Raportul a fost primit. Mulțumim!");
      })
      .catch((error) => {
        if (disposed || current !== request) return;
        feedback(
          error?.message === "rate_limited"
            ? "Ai trimis mai multe rapoarte. Încearcă din nou mai târziu."
            : "Raportul nu s-a putut trimite. Descrierea și dovezile au fost păstrate; încearcă din nou mai târziu.",
          true,
        );
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!disposed && current === request) lock(false);
      });
  });
  return () => {
    disposed = true;
    reset();
    cleanups.forEach((fn) => fn());
  };
}
