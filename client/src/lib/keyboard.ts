import React from "react";

/**
 * Keyboard activation for div-based controls (the calendar renders many
 * clickable divs). Pairs with role="button" + tabIndex={0} so Enter/Space
 * trigger the same action as a click.
 */
export const onActivateKey =
  (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };
