// Runs synchronously before first paint to prevent light/dark flash.
// Default theme is dark (#1e1e1e), matching what.html.
;(function () {
  try {
    const saved = localStorage.getItem("starling-garden-theme")
    const theme = saved === "light" ? "light" : "dark"
    document.documentElement.setAttribute("data-theme", theme)
    document.documentElement.setAttribute("saved-theme", theme)
  } catch {
    document.documentElement.setAttribute("data-theme", "dark")
    document.documentElement.setAttribute("saved-theme", "dark")
  }
})()
