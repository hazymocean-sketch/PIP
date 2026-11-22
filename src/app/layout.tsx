import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = { title: { default: "PIP", template: "%s · PIP" }, description: "Projects Intelligence Portal", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0B0B0A" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("pip_theme")?.value === "light" ? "light" : "dark";
  return (
    <html lang="en" data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600&family=Manrope:wght@400;500;600;700&family=Inter:wght@200;300;400;500&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
