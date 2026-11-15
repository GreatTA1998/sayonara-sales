import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Sayonara Sales", description: "Move-out sale pickup" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
