// Applies the theme before first paint (ThemeProvider takes over after). Keep the "theme"
// key in sync with ThemeProvider. A file, not an inline script: the api's CSP is script-src 'self'.
try {
  const t = localStorage.getItem("theme")
  const dark =
    t === "dark" ||
    (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.add(dark ? "dark" : "light")
} catch {}
