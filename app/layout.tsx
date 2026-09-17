import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skills Hub",
  description: "Every Claude skill your boss sends you, kept in one place — ready to run.",
};

// Runs before React hydrates so the page never paints the wrong theme for a
// frame (the classic dark-mode flash) — reads the stored preference
// (ThemeToggle.tsx writes it) and falls back to the OS preference only when
// nothing's been chosen yet. suppressHydrationWarning on <html> below is
// required because of this: the class this script sets won't match what
// the server rendered, and that's expected, not a bug.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("skillshub:theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-canvas text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
