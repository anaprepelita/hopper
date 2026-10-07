import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";

export function liveOptions(args) {
  const options = {
    platform: args[0] || "android",
    host: "127.0.0.1",
    port: 5173,
    target: undefined,
    serverOnly: false,
  };
  if (!["android", "ios", "restore", "stop"].includes(options.platform))
    throw new Error("Choose android or ios.");
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--server-only") {
      options.serverOnly = true;
      continue;
    }
    if (!["--host", "--port", "--target"].includes(arg) || !args[index + 1])
      throw new Error(`Unknown or incomplete option: ${arg}`);
    const value = args[++index];
    if (arg === "--port") options.port = Number(value);
    if (arg === "--host") options.host = value === "localhost" ? "127.0.0.1" : value;
    if (arg === "--target") options.target = value;
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)
    throw new Error("Use a port between 1 and 65535.");
  if (
    isIP(options.host) !== 4 ||
    !/^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(options.host)
  ) {
    throw new Error("Live Reload accepts only a loopback or private LAN IPv4 address.");
  }
  return options;
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function createLiveServer(initialBundle, { stopToken, onStop } = {}) {
  let bundle = resolve(initialBundle);
  let count = 0;
  const session = randomUUID();
  const clients = new Set();
  const revision = () => `${session}:${count}`;
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.url === "/__hopper_live_stop" && request.method === "POST") {
      if (!stopToken || request.headers["x-hopper-live-token"] !== stopToken) {
        response.writeHead(403);
        response.end();
        return;
      }
      response.writeHead(200);
      response.once("finish", () => onStop?.());
      response.end("Stopping Live Reload.");
      return;
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405);
      response.end();
      return;
    }
    try {
      const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      if (path === "/__hopper_live_events") {
        response.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
        response.write(`event: revision\ndata: ${revision()}\n\n`);
        clients.add(response);
        const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15000);
        response.on("close", () => {
          clearInterval(heartbeat);
          clients.delete(response);
        });
        return;
      }
      if (path !== "/" && path !== "/index.html" && !path.startsWith("/app/")) {
        response.writeHead(404);
        response.end();
        return;
      }
      const directory = await realpath(bundle);
      const target = resolve(directory, `.${path === "/" ? "/index.html" : path}`);
      if (!target.startsWith(directory + sep)) {
        response.writeHead(403);
        response.end();
        return;
      }
      const actual = await realpath(target);
      if (!actual.startsWith(directory + sep) || !(await stat(actual)).isFile()) {
        response.writeHead(403);
        response.end();
        return;
      }
      const bytes = await readFile(actual);
      response.writeHead(200, {
        "Content-Type": types[extname(actual)] || "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  return {
    server,
    publish(nextBundle) {
      bundle = resolve(nextBundle);
      count++;
      for (const client of clients) client.write(`event: revision\ndata: ${revision()}\n\n`);
    },
    async close() {
      for (const client of clients) client.end();
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    },
  };
}

export function createAlternatingBuilder(build) {
  let active = "live-a";
  return async () => {
    const next = active === "live-a" ? "live-b" : "live-a";
    const bundle = await build(next);
    // A failed build must retry the unused directory, never clear the served bundle.
    active = next;
    return bundle;
  };
}

export function createRebuilder(build, publish, onError, delay = 150) {
  let timer;
  let running = null;
  let dirty = false;
  let stopped = false;
  const run = () => {
    if (stopped || running) return;
    dirty = false;
    running = (async () => {
      try {
        const bundle = await build();
        if (!stopped) publish(bundle);
      } catch (error) {
        onError(error);
      } finally {
        running = null;
        if (dirty && !stopped) {
          clearTimeout(timer);
          run();
        }
      }
    })();
  };
  return {
    schedule() {
      if (stopped) return;
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}
