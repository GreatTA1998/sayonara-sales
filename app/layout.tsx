import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Sayonara Sales", description: "引っ越しセール・引き取り" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
