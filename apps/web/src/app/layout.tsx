import type { Metadata, Viewport } from "next";

import { PwaRegister } from "@/components/pwa-register";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FINCOUNTANT · UI Clone Demo",
    template: "%s · FINCOUNTANT",
  },
  description: "Prototype PWA finansial dengan data demo lokal untuk pengujian antarmuka.",
  applicationName: "FINCOUNTANT",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FINCOUNTANT",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d1510",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html className="h-full antialiased" lang="id">
      <body className="min-h-full">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
