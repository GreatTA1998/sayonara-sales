import type { Metadata, Viewport } from "next";
import AppShell from "@/components/app-shell";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Sayonara Sales",
  description: "引っ越しセール・引き取り",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Sayonara Sales",
    locale: "ja_JP",
    title: "Sayonara Sales",
    description: "引っ越しセール・引き取り",
  },
  twitter: {
    card: "summary",
    title: "Sayonara Sales",
    description: "引っ越しセール・引き取り",
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
