type CropWindow = Window & {
  HopperProfileCrop?: (file: File) => Promise<string>;
  HopperI18n?: { t: (key: string) => string };
};
export function cropRectangle(width: number, height: number, zoom: number, x: number, y: number) {
  if (!(width > 0 && height > 0)) throw new Error("Invalid dimensions.");
  const side = Math.min(width, height) / Math.max(1, Math.min(3, zoom));
  return {
    left: Math.max(0, Math.min(1, x)) * (width - side),
    top: Math.max(0, Math.min(1, y)) * (height - side),
    side,
  };
}
export function initializeProfileCrop() {
  const win = window as CropWindow;
  const dialog = document.querySelector<HTMLDialogElement>("#photo-crop-dialog");
  const stage = document.querySelector<HTMLElement>("#photo-crop-stage");
  const preview = document.querySelector<HTMLImageElement>("#photo-crop-preview");
  const zoom = document.querySelector<HTMLInputElement>("#photo-crop-zoom");
  const x = document.querySelector<HTMLInputElement>("#photo-crop-x");
  const y = document.querySelector<HTMLInputElement>("#photo-crop-y");
  const save = document.querySelector<HTMLButtonElement>("#photo-crop-save");
  const status = document.querySelector<HTMLElement>("#photo-crop-status");
  if (!dialog || !stage || !preview || !zoom || !x || !y || !save || !status) return () => {};
  let image: HTMLImageElement | undefined,
    url = "",
    generation = 0;
  let pending: { resolve: (photo: string) => void; reject: (error: Error) => void } | undefined;
  let pointer: { id: number; x: number; y: number } | undefined;
  const previous = win.HopperProfileCrop,
    cleanups: (() => void)[] = [];
  const text = (key: string) => win.HopperI18n?.t(key) ?? key;
  function listen(target: EventTarget, type: string, fn: EventListener) {
    target.addEventListener(type, fn);
    cleanups.push(() => target.removeEventListener(type, fn));
  }
  function release() {
    image = undefined;
    pointer = undefined;
    if (url) URL.revokeObjectURL(url);
    url = "";
    preview!.removeAttribute("src");
  }
  function cancel() {
    generation++;
    const old = pending;
    pending = undefined;
    release();
    old?.reject(new DOMException("Crop cancelled.", "AbortError"));
    if (dialog!.open) dialog!.close();
  }
  function rectangle() {
    return cropRectangle(
      image!.naturalWidth,
      image!.naturalHeight,
      Number(zoom!.value),
      Number(x!.value) / 100,
      Number(y!.value) / 100,
    );
  }
  function draw() {
    if (!image) return;
    const crop = rectangle(),
      ratio = (stage!.clientWidth || 240) / crop.side;
    Object.assign(preview!.style, {
      width: image.naturalWidth * ratio + "px",
      height: image.naturalHeight * ratio + "px",
      left: -crop.left * ratio + "px",
      top: -crop.top * ratio + "px",
    });
    x!.disabled = image.naturalWidth === crop.side;
    y!.disabled = image.naturalHeight === crop.side;
  }
  function center() {
    zoom!.value = "1";
    x!.value = y!.value = "50";
    draw();
  }
  const open = (file: File) => {
    cancel();
    const current = ++generation;
    return new Promise<string>((resolve, reject) => {
      pending = { resolve, reject };
      try {
        url = URL.createObjectURL(file);
        const source = new Image();
        source.onload = () => {
          if (current !== generation) return;
          if (!source.naturalWidth || !source.naturalHeight) {
            cancel();
            return;
          }
          image = source;
          preview.src = url;
          center();
          status.textContent = "";
          dialog.showModal();
          draw();
          stage.focus();
          document.dispatchEvent(
            new CustomEvent("hopper:ui", { detail: { kind: "dialog", target: dialog.id } }),
          );
        };
        source.onerror = () => {
          if (current !== generation) return;
          const old = pending;
          pending = undefined;
          release();
          old?.reject(new Error("Unable to decode photo."));
        };
        source.src = url;
      } catch (error) {
        const old = pending;
        pending = undefined;
        release();
        old?.reject(error instanceof Error ? error : new Error("Unable to load photo."));
      }
    });
  };
  win.HopperProfileCrop = open;
  for (const field of [zoom, x, y]) listen(field, "input", draw);
  listen(document.getElementById("photo-crop-center")!, "click", center);
  for (const button of dialog.querySelectorAll("[data-cancel-photo-crop]"))
    listen(button, "click", cancel);
  listen(dialog, "close", () => {
    if (pending) cancel();
    document.getElementById("choose-profile-photo")?.focus();
  });
  listen(document, "hopper:ui", (event) => {
    if ((event as CustomEvent<{ kind: string }>).detail?.kind === "screen") cancel();
  });
  listen(window, "resize", draw);
  listen(stage, "pointerdown", (event) => {
    const e = event as PointerEvent;
    if (!image || (e.pointerType === "mouse" && e.button !== 0)) return;
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    stage.setPointerCapture?.(e.pointerId);
    stage.focus();
    e.preventDefault();
  });
  listen(stage, "pointermove", (event) => {
    const e = event as PointerEvent;
    if (!image || !pointer || pointer.id !== e.pointerId) return;
    const crop = rectangle(),
      ratio = (stage.clientWidth || 240) / crop.side;
    if (image.naturalWidth > crop.side)
      x.value = String(
        Math.max(
          0,
          Math.min(
            100,
            Number(x.value) -
              (100 * (e.clientX - pointer.x)) / ratio / (image.naturalWidth - crop.side),
          ),
        ),
      );
    if (image.naturalHeight > crop.side)
      y.value = String(
        Math.max(
          0,
          Math.min(
            100,
            Number(y.value) -
              (100 * (e.clientY - pointer.y)) / ratio / (image.naturalHeight - crop.side),
          ),
        ),
      );
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    draw();
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    listen(stage, type, () => {
      pointer = undefined;
    });
  listen(stage, "keydown", (event) => {
    const e = event as KeyboardEvent,
      moves: Record<string, [number, number]> = {
        ArrowLeft: [5, 0],
        ArrowRight: [-5, 0],
        ArrowUp: [0, 5],
        ArrowDown: [0, -5],
      },
      move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    x.value = String(Math.max(0, Math.min(100, Number(x.value) + move[0])));
    y.value = String(Math.max(0, Math.min(100, Number(y.value) + move[1])));
    draw();
  });
  listen(save, "click", () => {
    if (!image || !pending) return;
    try {
      const crop = rectangle(),
        canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(image, crop.left, crop.top, crop.side, crop.side, 0, 0, 256, 256);
      const photo = canvas.toDataURL("image/jpeg", 0.85);
      if (!photo.startsWith("data:image/jpeg;base64,")) throw new Error("Encoding failed.");
      const old = pending;
      pending = undefined;
      generation++;
      release();
      dialog.close();
      old.resolve(photo);
    } catch {
      status.textContent = text("Poza nu a putut fi pregătită. Încearcă din nou.");
    }
  });
  return () => {
    cancel();
    cleanups.forEach((fn) => fn());
    if (win.HopperProfileCrop === open) {
      if (previous) win.HopperProfileCrop = previous;
      else delete win.HopperProfileCrop;
    }
  };
}
