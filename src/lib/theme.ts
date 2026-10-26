import { loadState, updateState } from "@/lib/app-state";
import { invoke, isTauri } from "@tauri-apps/api/core";

export type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Theme saved in state.json, otherwise the OS colour scheme. */
export async function loadTheme(): Promise<Theme> {
  try {
    const state = await loadState();
    return state.theme ?? systemTheme();
  } catch (error) {
    console.error("Could not load app state", error);
    return systemTheme();
  }
}

export async function applyTheme(theme: Theme, resetWebView = false) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("scheme-dark", theme === "dark");
  document.documentElement.classList.toggle("scheme-light", theme === "light");
  if (isTauri()) {
    await invoke("set_web_view_theme", { theme, reset: resetWebView }).catch(
      (error) => console.error("Could not apply theme to Academy views", error),
    );
  }
}

export function saveTheme(theme: Theme) {
  return updateState({ theme });
}
