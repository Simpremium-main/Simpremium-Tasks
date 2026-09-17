import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  // Toggled via a `dark` class on <html> (ThemeToggle.tsx), not the OS
  // media query — someone's system preference and their preference for
  // *this app* aren't always the same thing, and a manual toggle is the
  // only way to let them differ.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // rgb(var(--x) / <alpha-value>) instead of plain hex so Tailwind's
        // opacity modifiers (bg-canvas/40, text-ink/70, ...) keep working —
        // both already used throughout — while the underlying value still
        // flips with the `dark` class (app/globals.css defines the actual
        // light/dark triples). Sidebar's own colors are deliberately NOT
        // themed this way: that panel is styled to always look dark,
        // independent of the app's light/dark theme.
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          hover: "rgb(var(--color-primary-hover) / <alpha-value>)",
          soft: "rgb(var(--color-primary-soft) / <alpha-value>)",
        },
        cowork: {
          DEFAULT: "rgb(var(--color-cowork) / <alpha-value>)",
          soft: "rgb(var(--color-cowork-soft) / <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "#15161f",
          border: "#252634",
          hover: "rgba(255,255,255,0.06)",
          active: "rgba(51,88,224,0.18)",
          text: "#c6c7d4",
          muted: "#71717f",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "backdrop-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-down": {
          "0%": { opacity: "0", maxHeight: "0" },
          "100%": { opacity: "1", maxHeight: "2000px" },
        },
        highlight: {
          "0%": { backgroundColor: "rgba(51,88,224,0.14)" },
          "100%": { backgroundColor: "rgba(51,88,224,0)" },
        },
      },
      animation: {
        // "backwards", not "both": a "both"/"forwards" fill keeps an explicit
        // (if zero) `transform` applied after the animation ends, which
        // silently turns the element into a new containing block for any
        // `position: fixed` descendant — including a modal several
        // components down the tree — breaking `fixed inset-0` centering for
        // it. "backwards" only needs the pre-start state; the post-end state
        // is visually identical to the element's untouched default styles.
        "fade-in": "fade-in 0.35s ease-out backwards",
        "scale-in": "scale-in 0.18s cubic-bezier(0.16,1,0.3,1) both",
        "backdrop-in": "backdrop-in 0.18s ease-out both",
        "slide-down": "slide-down 0.25s ease-out both",
        highlight: "highlight 1.8s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
