import { createReportHandler, mediaExtensions, type Report } from "../_shared/report-handler.ts";
const env = (key: string) => Deno.env.get(key) || "";
const url = env("SUPABASE_URL"),
  serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
const recipient = env("SUPPORT_TO"),
  sender = env("SUPPORT_FROM"),
  resendKey = env("RESEND_API_KEY"),
  salt = env("SUPPORT_RATE_LIMIT_SALT");
const ready = Boolean(url && serviceKey && recipient && sender && resendKey && salt.length >= 16);
const bucket = "hopper-problem-evidence";
const headers = { apikey: serviceKey, Authorization: "Bearer " + serviceKey };
async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(url + path, {
    ...options,
    headers: { ...headers, ...options.headers },
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error("Backend unavailable.");
  return response.status === 204 ? null : response.json();
}
const patch = (id: string, value: unknown) =>
  api("/rest/v1/hopper_problem_reports?id=eq." + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(value),
  });
Deno.serve(
  createReportHandler({
    ready,
    async clientHash(request) {
      const ip = (
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown"
      )
        .split(",")
        .at(-1)!
        .trim();
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(salt + ":" + ip),
      );
      return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    },
    async reserve(report, fingerprint, clientHash) {
      return api("/rest/v1/rpc/hopper_reserve_report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: report.id,
          report_fingerprint: fingerprint,
          client_hash: clientHash,
          report_summary: report.summary,
          report_description: report.description,
          report_version: report.version,
          report_build: report.build,
        }),
      });
    },
    async upload(id, files) {
      const paths = [];
      for (const [index, file] of files.entries()) {
        const path = id + "/evidence-" + (index + 1) + "." + mediaExtensions[file.type];
        await api("/storage/v1/object/" + bucket + "/" + path, {
          method: "POST",
          headers: { "Content-Type": file.type, "x-upsert": "true" },
          body: file,
        });
        paths.push(path);
      }
      return paths;
    },
    async deliver(report: Report, paths, payload) {
      let message = payload;
      if (!message) {
        const attachments = [];
        for (const path of paths) {
          const result = await api("/storage/v1/object/sign/" + bucket + "/" + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expiresIn: 86400 }),
          });
          const signedPath = result.signedURL;
          if (typeof signedPath !== "string" || !signedPath.startsWith("/object/sign/"))
            throw new Error("Invalid evidence URL.");
          attachments.push({
            path: url + "/storage/v1" + signedPath,
            filename: path.split("/").at(-1),
          });
        }
        message = {
          from: sender,
          to: [recipient],
          subject: "Hopper: " + report.summary.replace(/[\r\n]/g, " "),
          text:
            report.description +
            "\n\nHopper " +
            report.version +
            " (build " +
            report.build +
            ")\nRaport: " +
            report.id,
          attachments,
        };
        // Persist the identical payload for safe Resend idempotency on retries.
        await patch(report.id, { email_payload: message });
      }
      const result = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + resendKey,
          "Content-Type": "application/json",
          "Idempotency-Key": "hopper-report/" + report.id,
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(45000),
      });
      if (!result.ok) throw new Error("Email temporarily unavailable.");
      const accepted = await result.json();
      if (!accepted.id) throw new Error("Email was not accepted.");
    },
    async finish(id) {
      await patch(id, { state: "sent", sent_at: new Date().toISOString() });
    },
    async fail(id) {
      await patch(id, { state: "failed" });
    },
  }),
);
