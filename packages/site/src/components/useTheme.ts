import * as React from "react";

/**
 * Light/dark, persisted.
 *
 * The value is written to `<html data-pt-theme>` rather than kept only in
 * React state, so the tokens in tokens.css apply to EVERYTHING including
 * portals and anything rendered outside the React tree — an embedded editor or
 * charting library injects its own chrome, and a custom property on the root
 * is the only handle that reaches it.
 *
 * The flash of the wrong theme is prevented in gatsby-ssr.tsx, which runs a
 * tiny script before the body paints. This hook only has to AGREE with what
 * that script already decided, which is why it reads the attribute rather than
 * starting from a default and correcting.
 */

export type Theme = "dark" | "light";

export const THEME_KEY = "pt-theme";

function current(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-pt-theme") === "light"
    ? "light"
    : "dark";
}

export function useTheme(): [Theme, () => void] {
  // Starts as "dark" on the server and on the client's first render, matching
  // what gatsby-ssr emits, so hydration never sees a mismatch. The effect
  // below then adopts whatever the pre-paint script actually chose.
  const [theme, setTheme] = React.useState<Theme>("dark");

  React.useEffect(() => {
    setTheme(current());
  }, []);

  const toggle = React.useCallback(() => {
    setTheme((previous) => {
      const next: Theme = previous === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-pt-theme", next);
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        // Private browsing, or storage disabled. The toggle still works for
        // this page; it just will not be remembered.
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
