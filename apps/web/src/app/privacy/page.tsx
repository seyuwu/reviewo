import type { Metadata } from "next";

import { PrivacyPageView } from "../../features/legal/components/privacy-page-view";

export const metadata: Metadata = {
  description: "How Opinia collects, uses, and protects personal data on the website and browser extension.",
  title: "Privacy Policy — Opinia"
};

export default function PrivacyPage() {
  return (
    <main className="shell shell-legal">
      <PrivacyPageView />
    </main>
  );
}
