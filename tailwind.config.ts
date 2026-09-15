import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f6f5f1",
        ink: "#1b1c22",
        surface: "#ffffff",
        line: "#e6e3da",
        muted: "#8a8a94",
        primary: {
          DEFAULT: "#3358e0",
          hover: "#2a48c2",
          soft: "#e8ecfd",
        },
        cowork: {
          DEFAULT: "#a8481f",
          soft: "#f5e6dd",
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
