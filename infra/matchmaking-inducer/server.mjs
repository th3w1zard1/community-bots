/**
 * Regional matchmaking *inducer*: transparent HTTP + WebSocket reverse proxy to one upstream
 * (typically the Cloudflare Worker). Clients put these URLs in VITE_API_BASES for geographic
 * failover; authority stays in the Worker + Durable Objects.
 */
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const httpProxy = require("http-proxy");

const PORT = Number(process.env.PORT ?? "8080");
const rawUpstream = process.env.MATCHMAKING_UPSTREAM_URL?.trim();
const region = process.env.INDUCER_REGION?.trim() || "unknown";
const provider = process.env.INDUCER_PROVIDER?.trim() || "generic";

if (!rawUpstream) {
  console.error("MATCHMAKING_UPSTREAM_URL is required (e.g. https://pazaak-matchmaking.xxx.workers.dev)");
  process.exit(1);
}

let upstreamOrigin;
try {
  upstreamOrigin = new URL(rawUpstream).origin;
} catch {
  console.error("MATCHMAKING_UPSTREAM_URL must be a valid absolute URL");
  process.exit(1);
}

const proxy = httpProxy.createProxyServer({
  target: upstreamOrigin,
  changeOrigin: true,
  secure: true,
  xfwd: true,
});

proxy.on("error", (err, req, res) => {
  if (res && !res.headersSent && typeof res.writeHead === "function") {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "inducer_upstream_error", message: err.message }));
  }
});

const server = http.createServer((req, res) => {
  if (req.url === "/inducer/health" || req.url === "/inducer/health/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      role: "matchmaking-inducer",
      region,
      provider,
      upstream: upstreamOrigin,
    }));
    return;
  }

  res.setHeader("X-Matchmaking-Inducer-Region", region);
  res.setHeader("X-Matchmaking-Inducer-Provider", provider);
  proxy.web(req, res, { target: upstreamOrigin });
});

server.on("upgrade", (req, socket, head) => {
  proxy.ws(req, socket, head, { target: upstreamOrigin });
});

server.listen(PORT, () => {
  console.log(`[inducer] listening :${PORT} region=${region} provider=${provider} -> ${upstreamOrigin}`);
});
