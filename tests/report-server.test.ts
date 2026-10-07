// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  createReportHandler,
  type Backend,
  type Reservation,
} from "../supabase/functions/_shared/report-handler";
const id = "12345678-1234-4123-8123-123456789abc";
function backend(): Backend {
  return {
    ready: true,
    clientHash: vi.fn(async () => "hashed-client"),
    reserve: vi.fn(async () => ({ state: "new" }) as Reservation),
    upload: vi.fn(async () => ["private/evidence.png"]),
    deliver: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
  };
}
function draft() {
  const form = new FormData();
  form.set("reportId", id);
  form.set("summary", "Calendar");
  form.set("description", "Luna nu se schimbă.");
  return form;
}
const request = (body: FormData) =>
  new Request("https://example.test/report", { method: "POST", body });
const png = () =>
  new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "proof.png", { type: "image/png" });
describe("Private report server", () => {
  it("uploads evidence privately and confirms only after provider and database success", async () => {
    const b = backend(),
      form = draft();
    form.append("files", png());
    const response = await createReportHandler(b)(request(form));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ accepted: true });
    expect(b.upload).toHaveBeenCalledWith(id, [expect.any(File)]);
    expect(b.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ id }),
      ["private/evidence.png"],
      undefined,
    );
    expect(b.finish).toHaveBeenCalledWith(id);
  });
  it.each(["to", "recipient", "password", "photo", "income"])(
    "rejects unapproved field %s before reservation or sending",
    async (key) => {
      const b = backend(),
        form = draft();
      form.set(key, "private");
      expect((await createReportHandler(b)(request(form))).status).toBe(400);
      expect(b.reserve).not.toHaveBeenCalled();
      expect(b.deliver).not.toHaveBeenCalled();
    },
  );
  it("rejects disguised and excessive files", async () => {
    for (const files of [
      [new File(["not png"], "proof.png", { type: "image/png" })],
      [png(), png(), png(), png()],
    ]) {
      const b = backend(),
        form = draft();
      files.forEach((file) => form.append("files", file));
      expect((await createReportHandler(b)(request(form))).status).toBe(400);
      expect(b.upload).not.toHaveBeenCalled();
    }
  });
  it("bounds request bytes before parsing or allocating evidence", async () => {
    const b = backend();
    const req = new Request("https://example.test/report", {
      method: "POST",
      body: "x",
      headers: { "content-length": "25000000" },
    });
    expect((await createReportHandler(b)(req)).status).toBe(413);
    expect(b.reserve).not.toHaveBeenCalled();
  });
  it.each([
    ["sent", 200],
    ["rate_limited", 429],
    ["busy", 409],
    ["expired", 409],
    ["conflict", 409],
  ] as const)("handles %s without another email", async (state, status) => {
    const b = backend();
    vi.mocked(b.reserve).mockResolvedValue({ state });
    expect((await createReportHandler(b)(request(draft()))).status).toBe(status);
    expect(b.deliver).not.toHaveBeenCalled();
  });
  it("reuses frozen server email payload on retry", async () => {
    const b = backend(),
      payload = { private: "server-only" };
    vi.mocked(b.reserve).mockResolvedValue({ state: "retry", payload });
    const response = await createReportHandler(b)(request(draft()));
    expect(response.status).toBe(201);
    expect(b.upload).not.toHaveBeenCalled();
    expect(b.deliver).toHaveBeenCalledWith(expect.anything(), [], payload);
    expect(await response.text()).not.toContain("server-only");
  });
  it("does not expose provider failures or falsely confirm delivery", async () => {
    const b = backend();
    vi.mocked(b.deliver).mockRejectedValue(new Error("recipient/private-token"));
    const response = await createReportHandler(b)(request(draft()));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(b.fail).toHaveBeenCalledWith(id);
    expect(b.finish).not.toHaveBeenCalled();
  });
  it("keeps unconfigured backends unavailable while supporting CORS", async () => {
    const b = backend();
    b.ready = false;
    const handler = createReportHandler(b);
    expect((await handler(request(draft()))).status).toBe(503);
    expect(
      (await handler(new Request("https://example.test/report", { method: "OPTIONS" }))).status,
    ).toBe(204);
  });
});
