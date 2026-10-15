"use client";

import styles from "./admin-rewards-page-view.module.css";

export type RewardVerification = {
  id: string;
  provider: string;
  telegramId: string;
  profileId: string | null;
  status: string;
  observedName: string | null;
  observedAt: string | null;
  attemptedAt: string | null;
  checkedAt: string | null;
  firstSeenAt: string | null;
  nextCheckAt: string;
  errorCode: string | null;
  reason: string | null;
  telegramUsername: string | null;
  contactSource: string;
};

const statuses: Record<string, string> = {
  PENDING: "Ожидает проверки",
  ERROR: "Не удалось проверить",
  VERIFIED: "Тег найден",
  MISSING: "Тега нет в имени"
};
const errors: Record<string, string> = {
  TIMEOUT: "Telegram не ответил вовремя.",
  NETWORK: "Не удалось подключиться к Telegram.",
  RATE_LIMIT: "Telegram временно ограничил частоту запросов.",
  PROFILE_UNAVAILABLE: "Telegram не предоставил профиль этому боту.",
  UNAVAILABLE: "Сервис Telegram временно недоступен.",
  CONFIGURATION: "Нужно проверить настройку доступа бота к Telegram.",
  INVALID_RESPONSE: "Telegram вернул ответ, по которому нельзя проверить имя.",
  INTERNAL: "Не удалось сохранить результат проверки."
};
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});
function date(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? `${dateFormat.format(new Date(value))} МСК`
    : "ещё не было";
}

export function AdminRewardVerifications({
  queue,
  recent,
  tag,
  busy,
  reasons,
  requested,
  onReason,
  onRetry,
  onReview
}: {
  queue: RewardVerification[];
  recent: RewardVerification[];
  tag: string;
  busy: boolean;
  reasons: Record<string, string>;
  requested: Record<string, { previousAttempt: string | null; expiresAt: number }>;
  onReason: (id: string, reason: string) => void;
  onRetry: (verification: RewardVerification) => void;
  onReview: (verification: RewardVerification, approved: boolean) => void;
}) {
  function entry(v: RewardVerification) {
    const requestedCheck = requested[v.id];
    const waiting =
      requestedCheck &&
      requestedCheck.expiresAt > Date.now() &&
      requestedCheck.previousAttempt === v.attemptedAt;
    const username =
      v.telegramUsername && /^[a-zA-Z0-9_]{1,32}$/.test(v.telegramUsername)
        ? v.telegramUsername
        : null;
    const href = username
      ? `https://t.me/${username}`
      : /^[1-9]\d{0,19}$/.test(v.telegramId)
        ? `tg://user?id=${v.telegramId}`
        : null;
    return (
      <article key={v.id} className={styles.verification}>
        <div className={styles.verificationHeader}>
          <h4>{v.observedName?.trim() || "Имя ещё не получено"}</h4>
          <strong>
            {waiting ? "Повторная проверка запрошена" : (statuses[v.status] ?? v.status)}
          </strong>
        </div>
        <div className={styles.actions}>
          {href && (
            <a href={href} target={username ? "_blank" : undefined} rel="noreferrer">
              {username ? `Открыть Telegram · @${username}` : "Открыть Telegram по ID"}
            </a>
          )}
          <span className="muted-copy">ID {v.telegramId}</span>
        </div>
        {!username && (
          <p className="muted-copy">
            Username не получен. Ссылка по ID может не открыться из-за ограничений Telegram.
          </p>
        )}
        {username && v.contactSource === "account" && (
          <p className="muted-copy">
            Контакт сохранён при входе или обращении к боту; username мог измениться.
          </p>
        )}
        <p className="muted-copy">
          {v.observedAt
            ? `Имя и контакт получены: ${date(v.observedAt)}`
            : v.observedName
              ? "Показано сохранённое ранее имя; дата получения неизвестна."
              : "Имя из Telegram пока не получено."}
        </p>
        {v.status === "ERROR" && (
          <p>
            {errors[v.errorCode ?? ""] ?? "Причина прежней ошибки не сохранена."} Ошибка не
            означает, что тега нет.
          </p>
        )}
        <dl className={styles.verificationDates}>
          <div>
            <dt>Последняя попытка</dt>
            <dd>{date(v.attemptedAt)}</dd>
          </div>
          <div>
            <dt>Решение</dt>
            <dd>{date(v.checkedAt)}</dd>
          </div>
          <div>
            <dt>Следующая проверка</dt>
            <dd>{waiting ? "В очереди фоновой проверки" : date(v.nextCheckAt)}</dd>
          </div>
        </dl>
        {v.status === "VERIFIED" && v.firstSeenAt && (
          <p>
            Начало периода сохранения тега: {date(v.firstSeenAt)}. Награда начисляется по условиям
            задания.
          </p>
        )}
        {v.reason && v.status !== "ERROR" && <p>Причина ручного решения: {v.reason}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            className="button-secondary"
            disabled={busy || !!waiting}
            onClick={() => onRetry(v)}
          >
            {waiting ? "Ожидаем результат…" : "Проверить сейчас"}
          </button>
        </div>
        <details className={styles.manualReview}>
          <summary>Проверить вручную</summary>
          <p>
            Открой профиль и проверь наличие <strong>{tag}</strong> в имени или фамилии. Сохранённое
            имя выше может быть устаревшим.
          </p>
          <label>
            Причина ручного решения
            <textarea
              rows={2}
              maxLength={500}
              value={reasons[v.id] ?? ""}
              onChange={(e) => onReason(v.id, e.target.value)}
            />
          </label>
          <div className={styles.actions}>
            {[true, false].map((approved) => (
              <button
                key={String(approved)}
                type="button"
                className="button-secondary"
                disabled={busy || !(reasons[v.id] ?? "").trim()}
                onClick={() => onReview(v, approved)}
              >
                {approved ? "Проверил: тег есть" : "Тег не найден"}
              </button>
            ))}
          </div>
        </details>
      </article>
    );
  }
  return (
    <section className={`panel-card ${styles.section}`}>
      <div className={styles.verificationHeader}>
        <h2>Проверки имени Telegram</h2>
        <span>В очереди: {queue.length}</span>
      </div>
      <p>
        Ищем <strong>{tag}</strong> в имени или фамилии Telegram. Username служит ссылкой на
        профиль.
      </p>
      <h3>Ожидают проверки или повтора</h3>
      {queue.length ? queue.map(entry) : <p>Ожидающих проверок нет.</p>}
      <details>
        <summary>Последние результаты · {recent.length}</summary>
        {recent.length ? recent.map(entry) : <p>Завершённых проверок пока нет.</p>}
      </details>
    </section>
  );
}
