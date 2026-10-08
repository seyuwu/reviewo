import { Suspense } from "react";
import { TelegramAccountConnectView } from "../../../features/auth/components/telegram-account-connect-view";

export const metadata = { referrer: "no-referrer", title: "Войти в FDP-бот" };

export default function TelegramConnectPage() {
  return <Suspense fallback={<main className="shell entity-route" />}><TelegramAccountConnectView /></Suspense>;
}
