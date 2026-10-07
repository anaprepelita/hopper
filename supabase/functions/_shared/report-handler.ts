import { evidenceError, mediaExtensions, MAX_TOTAL_BYTES } from "./report-contract.ts";
export type Report = {
  id: string;
  summary: string;
  description: string;
  version: string;
  build: string;
};
export type Reservation = {
  state: "new" | "retry" | "sent" | "busy" | "conflict" | "expired" | "rate_limited";
  payload?: unknown;
};
export type Backend = {
  ready: boolean;
  clientHash: (request: Request) => Promise<string>;
  reserve: (report: Report, fingerprint: string, clientHash: string) => Promise<Reservation>;
  upload: (id: string, files: File[]) => Promise<string[]>;
  deliver: (report: Report, paths: string[], payload?: unknown) => Promise<void>;
  finish: (id: string) => Promise<void>;
  fail: (id: string) => Promise<void>;
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
async function hash(value: Uint8Array | string) {
  const data = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
async function boundedForm(request: Request) {
  const max = MAX_TOTAL_BYTES + 512 * 1024;
  if (Number(request.headers.get("content-length")) > max) throw new Error("too_large");
  if (!request.body) throw new Error("invalid");
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new Error("too_large");
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let pos = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, pos);
    pos += chunk.length;
  }
  return new Response(bytes, {
    headers: { "Content-Type": request.headers.get("content-type") || "" },
  }).formData();
}
function mediaMatches(type: string, bytes: Uint8Array) {
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (type === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
  if (type === "video/mp4" || type === "video/quicktime") return ascii(4, 4) === "ftyp";
  if (type === "video/webm")
    return [26, 69, 223, 163].every((value, index) => bytes[index] === value);
  return false;
}
export function createReportHandler(backend: Backend) {
  return async (request: Request) => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return response(405, { error: "method_not_allowed" });
    if (!backend.ready) return response(503, { error: "unavailable" });
    let reservedId = "";
    try {
      const form = await boundedForm(request);
      const allowed = new Set(["reportId", "summary", "description", "version", "build", "files"]);
      if ([...form.keys()].some((key) => !allowed.has(key)))
        return response(400, { error: "invalid" });
      const field = (key: string, max: number, required = false) => {
        const values = form.getAll(key);
        if (values.length > 1 || values.some((value) => typeof value !== "string"))
          throw new Error("invalid");
        const value = String(values[0] ?? "").trim();
        if (value.length > max || (required && !value)) throw new Error("invalid");
        return value;
      };
      const report: Report = {
        id: field("reportId", 36, true),
        summary: field("summary", 120, true),
        description: field("description", 2000, true),
        version: field("version", 40),
        build: field("build", 40),
      };
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(report.id))
        return response(400, { error: "invalid" });
      const entries = form.getAll("files");
      if (entries.some((entry) => typeof entry === "string"))
        return response(400, { error: "invalid" });
      const files = entries as File[];
      if (evidenceError(files)) return response(400, { error: "invalid_files" });
      const hashes = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!mediaMatches(file.type, bytes)) return response(400, { error: "invalid_files" });
        hashes.push({ type: file.type, size: file.size, hash: await hash(bytes) });
      }
      const fingerprint = await hash(JSON.stringify({ ...report, files: hashes }));
      const reservation = await backend.reserve(
        report,
        fingerprint,
        await backend.clientHash(request),
      );
      if (reservation.state === "rate_limited") return response(429, { error: "rate_limited" });
      if (reservation.state === "sent") return response(200, { accepted: true });
      if (reservation.state === "busy") return response(409, { error: "in_progress" });
      if (["conflict", "expired"].includes(reservation.state))
        return response(409, { error: "invalid_retry" });
      reservedId = report.id;
      const paths = reservation.payload ? [] : await backend.upload(report.id, files);
      await backend.deliver(report, paths, reservation.payload);
      await backend.finish(report.id);
      return response(201, { accepted: true });
    } catch (error) {
      if (reservedId) await backend.fail(reservedId).catch(() => {});
      const kind = error instanceof Error ? error.message : "";
      if (kind === "too_large") return response(413, { error: "too_large" });
      if (kind === "invalid") return response(400, { error: "invalid" });
      // Provider responses, recipient, file URLs and credentials are never returned.
      return response(503, { error: "unavailable" });
    }
  };
}
export { mediaExtensions };
