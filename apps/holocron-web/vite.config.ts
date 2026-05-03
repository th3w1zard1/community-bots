import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import type { IncomingMessage } from "node:http";
import { defineConfig, PluginOption } from "vite";

import sparkPlugin from "@github/spark/spark-vite-plugin";
import createIconImportProxy from "@github/spark/vitePhosphorIconProxyPlugin";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname
const base = process.env.BASE || "/"
const enableSparkPlugin = process.env.ENABLE_SPARK === "1"

const traskProxyTarget = process.env.TRASK_HTTP_PROXY_TARGET ?? "http://127.0.0.1:4010";

/** Minimal Spark KV API so `useKV` works outside GitHub Spark (local Vite only). */
function sparkKvLocalPlugin(): PluginOption {
  const store = new Map<string, string>()

  const readBody = (req: IncomingMessage): Promise<string> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on("data", (c: Buffer) => chunks.push(c))
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
      req.on("error", reject)
    })

  return {
    name: "spark-kv-local",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url?.split("?")[0] ?? ""
        if (!raw.startsWith("/__spark-kv")) {
          next()
          return
        }

        let subpath = raw.slice("/__spark-kv".length)
        if (subpath.startsWith("/")) {
          subpath = subpath.slice(1)
        }
        const key = subpath ? decodeURIComponent(subpath.split("/")[0]!) : ""

        void (async () => {
          try {
            if (req.method === "GET" && !key) {
              res.setHeader("Content-Type", "application/json")
              res.end(JSON.stringify([...store.keys()]))
              return
            }

            if (req.method === "GET" && key) {
              const v = store.get(key)
              if (v === undefined) {
                res.statusCode = 404
                res.end()
                return
              }
              res.setHeader("Content-Type", "text/plain")
              res.end(v)
              return
            }

            if (req.method === "POST" && key) {
              const body = await readBody(req)
              store.set(key, body)
              res.statusCode = 200
              res.end()
              return
            }

            if (req.method === "DELETE" && key) {
              store.delete(key)
              res.statusCode = 204
              res.end()
              return
            }

            res.statusCode = 405
            res.end()
          } catch {
            res.statusCode = 500
            res.end()
          }
        })()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base,
  define: enableSparkPlugin
    ? undefined
    : {
        BASE_KV_SERVICE_URL: JSON.stringify("/__spark-kv"),
        GITHUB_RUNTIME_PERMANENT_NAME: JSON.stringify("holocron-local"),
      },
  server: {
    proxy: {
      "/api/trask": {
        target: traskProxyTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    // DO NOT REMOVE
    createIconImportProxy() as PluginOption,
    ...(enableSparkPlugin ? [] : [sparkKvLocalPlugin()]),
    ...(enableSparkPlugin ? [sparkPlugin() as PluginOption] : []),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
});
