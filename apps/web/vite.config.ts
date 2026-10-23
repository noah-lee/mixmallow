import { Agent } from "node:http"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  // The api reads PORT from the repo-root .env; the proxy follows it.
  const { PORT = "3000" } = loadEnv(mode, path.resolve(__dirname, "../.."), "")
  return {
    plugins: [
      // Must precede the React plugin so generated routes are transformed.
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        // Without an agent the proxy sends `Connection: close`, opening a socket per request;
        // e2e runs churn through enough of them to exhaust Windows' ephemeral ports.
        "/api": {
          target: `http://127.0.0.1:${PORT}`,
          agent: new Agent({ keepAlive: true }),
        },
      },
    },
  }
})
