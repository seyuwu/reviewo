import type { Metadata } from "next";
import { ReactNode } from "react";

import { AppChrome } from "../components/app-chrome";
import { GoogleAnalytics } from "../components/google-analytics";
import { AppProviders } from "./providers";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "A universal public opinion layer for entities across the internet.",
  title: "Opinia"
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html data-scroll-behavior="smooth" lang="en" suppressHydrationWarning>
      <body>
        <GoogleAnalytics />
        <AppProviders>
          <AppChrome>{children}</AppChrome>
        </AppProviders>
      </body>
    </html>
  );
}
