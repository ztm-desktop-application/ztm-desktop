import { useEffect, useRef, useState } from "react";
import {
  hasOnlyModifier,
  isModifierKey,
  type ShortcutModifier,
} from "@/lib/shortcuts";

/** Actions keyed by `KeyboardEvent.code`, so they work on any keyboard layout. */
export type ShortcutHandlers = Partial<Record<string, () => void>>;

/**
 * Runs a handler when the modifier is pressed with its key, and reports whether the
 * modifier is held on its own so hint badges can be shown.
 */
export function useShortcuts(
  modifier: ShortcutModifier,
  handlers: ShortcutHandlers,
) {
  const [showHints, setShowHints] = useState(false);
  // A ref keeps the listeners attached while the handlers change every render.
  const handlersRef = useRef(handlers);
  // eslint-disable-next-line react-hooks/refs -- TODO: migrate latest-handler synchronization separately from the lint rollout.
  handlersRef.current = handlers;

  useEffect(() => {
    const hide = () => setShowHints(false);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isModifierKey(event, modifier)) {
        // Stops Alt from moving focus to the window menu.
        event.preventDefault();
        setShowHints(hasOnlyModifier(event, modifier));
        return;
      }
      if (!hasOnlyModifier(event, modifier)) {
        hide();
        return;
      }
      const handler = handlersRef.current[event.code];
      if (!handler) return;
      event.preventDefault();
      // Holding the keys repeats keydown, which would open Discord over and over.
      if (event.repeat) return;
      hide();
      handler();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (isModifierKey(event, modifier)) hide();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    // Releasing the key in another window must not leave the hints stuck on.
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", hide);
      hide();
    };
  }, [modifier]);

  return showHints;
}
