import * as React from "react";
import { useTheme } from "./useTheme";

/**
 * Dark/light as a segmented pair rather than one ambiguous icon button.
 *
 * Its own module because both the signed-in Shell and the guest landing need
 * it, and the two must not drift. A theme control that behaves differently
 * before and after sign-in is the kind of seam nobody notices in review and
 * everybody notices in use.
 *
 * Appearance is deliberately available to a signed-out visitor: the sign-in
 * page is the first thing anyone sees, and telling someone to authenticate
 * before they may turn the lights down is a strange thing to do.
 */
export function ThemeSegments() {
  const [theme, toggle] = useTheme();

  return (
    <div className="pt-seg" role="group" aria-label="Appearance">
      {(["dark", "light"] as const).map((value) => (
        <button
          key={value}
          type="button"
          className={`pt-seg__option${theme === value ? " pt-seg__option--on" : ""}`}
          aria-pressed={theme === value}
          onClick={() => {
            if (theme !== value) toggle();
          }}
        >
          {value === "dark" ? "☾" : "☀"} {value}
        </button>
      ))}
    </div>
  );
}
