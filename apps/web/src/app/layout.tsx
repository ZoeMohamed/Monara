import { I18nProvider } from "@monara/ui";
import type { Metadata, Viewport } from "next";

import { PwaRegister } from "@/components/pwa-register";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Monara — No More Scattered Spending",
    template: "%s · Monara",
  },
  description:
    "Track and understand your everyday spending with a private, simple finance experience.",
  applicationName: "Monara",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Monara",
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
  themeColor: "#f5fbff",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html className="light h-full antialiased" data-theme="light" lang="en">
      <body className="min-h-full">
        <I18nProvider locale="en-US">{children}</I18nProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
