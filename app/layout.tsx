import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skills Hub",
  description: "Every Claude skill your boss sends you, kept in one place — ready to run.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-canvas text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
