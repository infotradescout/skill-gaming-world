import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";
import "./globals.css";
import "@/components/shells.css";

export const metadata: Metadata = {
  title: {
    default: "Skill Gaming World",
    template: "%s · Skill Gaming World",
  },
  description:
    "Monetaire is competitive solitaire built around transparent rules, deterministic deals, and disciplined player protections.",
  applicationName: "Skill Gaming World",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Skill Gaming World",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07110f",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
