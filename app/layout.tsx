import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skills Hub",
  description: "Every Claude skill your boss sends you, kept in one place — ready to run.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink font-sans antialiased">
        <header className="border-b border-line bg-canvas/95 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tracking-tight">Skills Hub</span>
              <span className="text-xs text-ink/50 hidden sm:inline">
                every skill your boss sends you, in one place
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="hover:text-accent transition-colors">
                Skills
              </Link>
              <Link href="/history" className="hover:text-accent transition-colors">
                History
              </Link>
              <Link
                href="/skills/new"
                className="rounded-md bg-accent text-white px-3 py-1.5 font-medium hover:bg-accent/90 transition-colors"
              >
                + New skill
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
