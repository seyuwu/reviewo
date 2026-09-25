import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { ReactNode } from "react";

import { AppChrome } from "../components/app-chrome";
import { GoogleAnalytics } from "../components/google-analytics";
import { publicEnv } from "../lib/config/public-env";
import { AppProviders } from "./providers";
import "./globals.css";

const inter = Inter({
  display: "swap",
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter"
});

const plusJakartaSans = Plus_Jakarta_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans"
});

export const metadata: Metadata = {
  description: "A universal public opinion layer for entities across the internet.",
  metadataBase: new URL(publicEnv.siteUrl),
  title: "Opinia"
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      className={`${inter.variable} ${plusJakartaSans.variable}`}
      data-scroll-behavior="smooth"
      lang="ru"
      suppressHydrationWarning
    >
      <body>
        <GoogleAnalytics />
        <AppProviders>
          <AppChrome>{children}</AppChrome>
        </AppProviders>
      </body>
    </html>
  );
}
