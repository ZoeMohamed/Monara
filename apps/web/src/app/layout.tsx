import { I18nProvider } from "@monara/ui";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { PwaRegister } from "@/components/pwa-register";

import "./globals.css";

const nunitoSans = localFont({
  src: [
    {
      path: "../../public/fonts/nunito-sans-latin-variable.woff2",
      weight: "200 900",
      style: "normal",
    },
    {
      path: "../../public/fonts/nunito-sans-latin-variable-italic.woff2",
      weight: "200 900",
      style: "italic",
    },
  ],
  variable: "--font-nunito-sans",
  display: "swap",
});

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
      { url: "/icon.png", sizes: "64x64", type: "image/png" },
      { url: "/logos/logo-light.svg", sizes: "any", type: "image/svg+xml" },
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
    <html
      className={`${nunitoSans.variable} light h-full antialiased`}
      data-theme="light"
      lang="en"
    >
      <body className="min-h-full">
        <I18nProvider locale="en-US">{children}</I18nProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
