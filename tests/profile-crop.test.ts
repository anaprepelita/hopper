import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { cropRectangle, initializeProfileCrop } from "../mobile/profile-crop";
type CropWindow = Window & { HopperProfileCrop?: (file: File) => Promise<string> };
const win = window as CropWindow;
const field = (id: string) => document.getElementById(id) as HTMLInputElement;
let dispose = () => {},
  images: HTMLImageElement[] = [],
  draw: ReturnType<typeof vi.fn>;
beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(
    readFileSync("mobile/app/index.html", "utf8"),
    "text/html",
  ).body.innerHTML;
  const dialog = document.getElementById("photo-crop-dialog") as HTMLDialogElement;
  dialog.showModal = vi.fn(() => {
    dialog.open = true;
  });
  dialog.close = vi.fn(() => {
    dialog.open = false;
    dialog.dispatchEvent(new Event("close"));
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:crop"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  images = [];
  vi.stubGlobal(
    "Image",
    class {
      constructor() {
        const image = document.createElement("img");
        Object.defineProperties(image, {
          naturalWidth: { value: 800 },
          naturalHeight: { value: 400 },
        });
        images.push(image);
        return image;
      }
    },
  );
  draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: vi.fn(),
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,cropped",
  );
  dispose = initializeProfileCrop();
});
afterEach(() => {
  dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const open = () => {
  const promise = win.HopperProfileCrop!(new File(["p"], "p.png", { type: "image/png" }));
  images.at(-1)!.dispatchEvent(new Event("load"));
  return promise;
};
describe("Profile photo positioning", () => {
  it("calculates crops for landscape, portrait, zoom and boundary clamping", () => {
    expect(cropRectangle(800, 400, 1, 0.5, 0.5)).toEqual({ left: 200, top: 0, side: 400 });
    expect(cropRectangle(400, 800, 2, 0, 1)).toEqual({ left: 0, top: 600, side: 200 });
    expect(cropRectangle(300, 300, 9, -1, 2)).toEqual({ left: 0, top: 200, side: 100 });
    expect(() => cropRectangle(0, 400, 1, 0, 0)).toThrow();
  });
  it("uses the chosen zoom and position only when saving", async () => {
    const promise = open();
    expect(draw).not.toHaveBeenCalled();
    field("photo-crop-zoom").value = "2";
    field("photo-crop-x").value = "100";
    field("photo-crop-y").value = "0";
    field("photo-crop-zoom").dispatchEvent(new Event("input"));
    field("photo-crop-save").click();
    await expect(promise).resolves.toBe("data:image/jpeg;base64,cropped");
    expect(draw).toHaveBeenCalledWith(images[0], 600, 0, 200, 200, 0, 0, 256, 256);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:crop");
  });
  it("supports keyboard positioning and recentering", async () => {
    const promise = open();
    field("photo-crop-stage").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", cancelable: true }),
    );
    expect(field("photo-crop-x").value).toBe("55");
    field("photo-crop-center").click();
    expect(field("photo-crop-x").value).toBe("50");
    const rejection = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    document.querySelector<HTMLButtonElement>("[data-cancel-photo-crop]")!.click();
    await rejection;
    expect(draw).not.toHaveBeenCalled();
  });
  it("cancels on account changes without saving or leaking blobs", async () => {
    const promise = open(),
      rejection = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    document.dispatchEvent(new CustomEvent("hopper:ui", { detail: { kind: "screen" } }));
    await rejection;
    field("photo-crop-save").click();
    expect(draw).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
});
