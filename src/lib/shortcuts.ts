/** Mirrors `ShortcutModifier` in src-tauri/src/app_state.rs. */
export type ShortcutModifier = "alt" | "ctrl" | "meta";

export const DEFAULT_SHORTCUT_MODIFIER: ShortcutModifier = "alt";

export const SHORTCUT_MODIFIER_LABELS: Record<ShortcutModifier, string> = {
  alt: "Alt",
  ctrl: "Ctrl",
  meta: "Meta",
};

const MODIFIER_KEYS: Record<ShortcutModifier, string> = {
  alt: "Alt",
  ctrl: "Control",
  meta: "Meta",
};

/** Whether the event is the modifier key itself being pressed or released. */
export function isModifierKey(
  event: KeyboardEvent,
  modifier: ShortcutModifier,
) {
  return event.key === MODIFIER_KEYS[modifier];
}

/** Whether the modifier is held with no other modifiers, so e.g. Ctrl+Alt+1 is ignored. */
export function hasOnlyModifier(
  event: KeyboardEvent,
  modifier: ShortcutModifier,
) {
  return (
    event.altKey === (modifier === "alt") &&
    event.ctrlKey === (modifier === "ctrl") &&
    event.metaKey === (modifier === "meta") &&
    !event.shiftKey
  );
}
