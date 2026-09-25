import { Suspense } from "react";

import { TelegramLoginView } from "../../../features/auth/components/telegram-login-view";

export const metadata = {
  referrer: "no-referrer"
};

export default function TelegramAccessPage() {
  return (
    <Suspense
      fallback={
        <main className="shell entity-route">
          <p>Открываем пати…</p>
        </main>
      }
    >
      <TelegramLoginView />
    </Suspense>
  );
}
