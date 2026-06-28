import type { Metadata } from "next";
import { ReactNode } from "react";

import { AppChrome } from "../components/app-chrome";
import { AppProviders } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  description: "A universal public opinion layer for entities across the internet.",
  title: "Opinia"
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProviders>
          <AppChrome>{children}</AppChrome>
        </AppProviders>
      </body>
    </html>
  );
}
