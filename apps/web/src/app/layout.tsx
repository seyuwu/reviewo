import type { Metadata } from "next";
import { ReactNode } from "react";

import { AppProviders } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  description: "A universal public opinion layer for entities across the internet.",
  title: "Reviewo"
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
