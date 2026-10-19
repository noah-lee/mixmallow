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
        "/api": `http://localhost:${PORT}`,
      },
    },
  }
})
