import type { Metadata } from "next";

import { RecoverAccountView } from "../../../features/auth/components/recover-account-view";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  },
  title: "Recover access | Opinia"
};

export default function RecoverAccountPage() {
  return <RecoverAccountView />;
}
