"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { apiRequest } from "../../../lib/api/api-client";
import { ApiError } from "../../../lib/api/api-error";
import { readApiErrorMessage } from "../../../lib/api/read-api-error";
import { useAuthSession } from "../../auth/hooks/use-auth-session";
import styles from "./admin-rewards-page-view.module.css";
import {
  AdminRewardsTasks,
  type RewardTaskInfo,
  type TaskConditionInfo
} from "./admin-rewards-tasks";

type Settings = {
  programName: string;
  mascotName: string;
  currencyName: string;
  tag: string;
  tasks: Record<string, RewardTaskInfo>;
  phrases: Record<string, string[]>;
};
type Winner = {
  ticketNumber: number;
  telegramId: string;
  prize: string;
  deliveredAt: string | null;
};
type Giveaway = {
  id: string;
  title: string;
  description: string;
  prizes: string[];
  ticketPrice: number;
  maxTickets: number;
  uniqueWinners: boolean;
  startsAt: string;
  endsAt: string;
  status: string;
  nextTicket: number;
  draw: null | { winners: Winner[]; ticketCount: number; hash: string };
};
type Verification = {
  id: string;
  provider: string;
  telegramId: string;
  profileId: string | null;
  observedName: string | null;
  reason: string | null;
};
type Data = {
  enabled: boolean;
  startedAt: string | null;
  settings: Settings;
  giveaways: Giveaway[];
  verifications: Verification[];
  taskConditions: TaskConditionInfo[];
};
const localDate = (date = new Date()) =>
  new Date(date.getTime() + 10800000).toISOString().slice(0, 16);
const statusLabels: Record<string, string> = {
  DRAFT: "Черновик",
  OPEN: "Приём билетов",
  CLOSED: "Ожидает итогов",
  DRAWN: "Итоги сохранены",
  CANCELLED: "Отменён; возвраты в обработке"
};
const phraseLabels: Record<string, string> = {
  home: "Баланс и приветствие",
  earn: "Заработок",
  raffle: "Розыгрыши",
  history: "История"
};

export function AdminRewardsPageView() {
  const { authSession, isAuthSessionLoaded } = useAuthSession(),
    token = authSession?.accessToken;
  const client = useQueryClient();
  const access = useQuery({
    queryKey: ["rewards-access", token],
    queryFn: () =>
      apiRequest<{ canManage: boolean }>("/rewards/access", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store"
      }),
    enabled: !!token
  });
  const admin = access.data?.canManage === true;
  const query = useQuery({
    queryKey: ["admin-rewards", token],
    enabled: !!token && admin,
    queryFn: () =>
      apiRequest<Data>("/admin/rewards", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store"
      })
  });
  const [draft, setDraft] = useState<Settings | null>(null),
    [enabled, setEnabled] = useState<boolean | undefined>();
  const [feedback, setFeedback] = useState(""),
    [cancelId, setCancelId] = useState<string | null>(null);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [prizes, setPrizes] = useState(""),
    [price, setPrice] = useState(10),
    [limit, setLimit] = useState(10),
    [unique, setUnique] = useState(true),
    [start, setStart] = useState(() => localDate()),
    [end, setEnd] = useState(() => localDate(new Date(Date.now() + 7 * 86400000)));
  const [ticketView, setTicketView] = useState<{ id: string; after: number } | null>(null);
  const tickets = useQuery({
    queryKey: ["admin-reward-tickets", token, ticketView],
    enabled: !!token && admin && !!ticketView,
    queryFn: () =>
      apiRequest<{ number: number; telegramId: string }[]>(
        `/admin/rewards/giveaways/${ticketView?.id}/tickets?after=${ticketView?.after ?? 0}`,
        { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }
      )
  });
  const mutate = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      apiRequest<unknown>(`/admin/rewards/${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: body ?? {}
      }),
    onSuccess: () => {
      setFeedback("Сохранено");
      void client.invalidateQueries({ queryKey: ["admin-rewards"] });
      void client.invalidateQueries({ queryKey: ["admin-reward-tickets"] });
    },
    onError: (error) =>
      setFeedback(
        error instanceof ApiError
          ? (readApiErrorMessage(error.body) ?? "Не удалось сохранить")
          : error instanceof Error
            ? error.message
            : "Не удалось сохранить"
      )
  });
  if (!isAuthSessionLoaded || access.isLoading) return <p>Загрузка…</p>;
  if (!token)
    return (
      <Link className="button-primary" href="/login">
        Войти в админку
      </Link>
    );
  if (!admin)
    return (
      <p>Нужны права администратора наград. Войди через Telegram, добавленный в админы бота.</p>
    );
  if (query.isLoading) return <p>Загрузка наград…</p>;
  if (!query.data)
    return (
      <p role="alert">
        Не удалось загрузить настройки.{" "}
        <button type="button" className="button-secondary" onClick={() => void query.refetch()}>
          Повторить
        </button>
      </p>
    );
  const data = query.data,
    current = draft ?? data.settings;
  function update(values: Partial<Settings>) {
    setDraft({ ...current, ...values });
  }
  return (
    <section className={styles.page}>
      <header>
        <p className="eyebrow">FDP · Награды</p>
        <h1>{data.settings.programName}</h1>
        <p className="hero-copy">
          Задания, персонаж, билеты и выдача призов. Действия игроков учитываются автоматически.
        </p>
        <Link className="button-secondary" href="/">
          ← К сайту
        </Link>
      </header>
      {feedback && (
        <p role="status" className="panel-card">
          {feedback}
        </p>
      )}
      <form
        className={`panel-card ${styles.section}`}
        onSubmit={(event) => {
          event.preventDefault();
          mutate.mutate({
            path: "settings",
            body: {
              programName: current.programName,
              mascotName: current.mascotName,
              currencyName: current.currencyName,
              tag: current.tag,
              phrases: current.phrases,
              enabled: enabled ?? data.enabled
            }
          });
        }}
      >
        <h2>Программа и Марина</h2>
        <fieldset disabled={mutate.isPending} className={styles.fields}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={enabled ?? data.enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{" "}
            Включить награды
          </label>
          <label>
            Название раздела
            <input
              required
              maxLength={50}
              value={current.programName}
              onChange={(e) => update({ programName: e.target.value })}
            />
          </label>
          <label>
            Имя персонажа
            <input
              required
              maxLength={30}
              value={current.mascotName}
              onChange={(e) => update({ mascotName: e.target.value })}
            />
          </label>
          <label>
            Название валюты
            <input
              required
              maxLength={24}
              value={current.currencyName}
              onChange={(e) => update({ currencyName: e.target.value })}
            />
          </label>
          <label>
            Тег в имени Telegram
            <input
              required
              pattern="@[A-Za-z0-9_]{5,32}"
              value={current.tag}
              onChange={(e) => update({ tag: e.target.value })}
            />
          </label>
          <p className="muted-copy">
            Первое включение задаёт начало кампании. Старые поиски и приглашения не начисляются
            задним числом.
          </p>
        </fieldset>
        <h3>Фразы персонажа</h3>
        <p className="muted-copy">
          Каждая строка — отдельная фраза, до 180 символов. Бот меняет фразы при переходах.
        </p>
        <div className={styles.fields}>
          {Object.entries(current.phrases).map(([key, phrases]) => (
            <label key={key}>
              {phraseLabels[key] ?? key}
              <textarea
                required
                rows={4}
                value={phrases.join("\n")}
                onChange={(e) =>
                  update({ phrases: { ...current.phrases, [key]: e.target.value.split("\n") } })
                }
              />
            </label>
          ))}
        </div>
        <button className="button-primary" disabled={mutate.isPending}>
          Сохранить настройки
        </button>
      </form>
      <AdminRewardsTasks
        token={token}
        tasks={data.settings.tasks}
        conditions={data.taskConditions}
      />
      <form
        className={`panel-card ${styles.section}`}
        onSubmit={(event) => {
          event.preventDefault();
          mutate.mutate({
            path: editorId ? `giveaways/${editorId}/edit` : "giveaways",
            body: {
              title,
              description,
              prizes: prizes
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
              ticketPrice: price,
              maxTickets: limit,
              uniqueWinners: unique,
              startsAt: new Date(`${start}:00+03:00`).toISOString(),
              endsAt: new Date(`${end}:00+03:00`).toISOString()
            }
          });
        }}
      >
        <h2>{editorId ? "Редактировать черновик" : "Новый розыгрыш"}</h2>
        <fieldset disabled={mutate.isPending} className={styles.fields}>
          <label>
            Название розыгрыша
            <input
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Условия и получение приза
            <textarea
              required
              maxLength={2000}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Призы: одна строка — один победитель
            <textarea
              required
              rows={3}
              value={prizes}
              onChange={(e) => setPrizes(e.target.value)}
            />
          </label>
          <label>
            Цена билета
            <input
              required
              type="number"
              min={1}
              max={100000}
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
            />
          </label>
          <label>
            Лимит билетов на человека
            <input
              required
              type="number"
              min={1}
              max={1000}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </label>
          <label>
            Начало, МСК
            <input
              required
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Окончание, МСК
            <input
              required
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} />{" "}
            Один человек может выиграть только один приз
          </label>
        </fieldset>
        <button className="button-primary" disabled={mutate.isPending}>
          {editorId ? "Сохранить черновик" : "Создать черновик"}
        </button>
        {editorId && (
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setEditorId(null);
              setTitle("");
              setDescription("");
              setPrizes("");
            }}
          >
            Отменить редактирование
          </button>
        )}
      </form>
      <section className={styles.section}>
        <h2>Розыгрыши</h2>
        {data.giveaways.length === 0 && <p>Пока нет розыгрышей.</p>}
        {data.giveaways.map((g) => (
          <article key={g.id} className={`panel-card ${styles.section}`}>
            <h3>{g.title}</h3>
            <p>
              {statusLabels[g.status]} · {g.nextTicket - 1} билетов · {g.ticketPrice}{" "}
              {current.currencyName} за билет
            </p>
            <p>{g.description}</p>
            <ul>
              {g.prizes.map((prize, index) => (
                <li key={index}>{prize}</li>
              ))}
            </ul>
            <p>
              До {new Date(g.endsAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК
            </p>
            <div className={styles.actions}>
              {g.status === "DRAFT" && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setEditorId(g.id);
                    setTitle(g.title);
                    setDescription(g.description);
                    setPrizes(g.prizes.join("\n"));
                    setPrice(g.ticketPrice);
                    setLimit(g.maxTickets);
                    setUnique(g.uniqueWinners);
                    setStart(localDate(new Date(g.startsAt)));
                    setEnd(localDate(new Date(g.endsAt)));
                  }}
                >
                  Редактировать
                </button>
              )}
              {g.status === "DRAFT" && (
                <button
                  type="button"
                  className="button-primary"
                  disabled={mutate.isPending}
                  onClick={() => mutate.mutate({ path: `giveaways/${g.id}/publish` })}
                >
                  Опубликовать
                </button>
              )}
              {["OPEN", "CLOSED"].includes(g.status) && new Date(g.endsAt) <= new Date() && (
                <button
                  type="button"
                  className="button-primary"
                  disabled={mutate.isPending}
                  onClick={() => mutate.mutate({ path: `giveaways/${g.id}/draw` })}
                >
                  Определить победителей
                </button>
              )}
              <button
                type="button"
                className="button-secondary"
                onClick={() => setTicketView({ id: g.id, after: 0 })}
              >
                Список билетов
              </button>
              {!["DRAWN", "CANCELLED"].includes(g.status) && (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={mutate.isPending}
                  onClick={() => {
                    if (cancelId === g.id) {
                      mutate.mutate({ path: `giveaways/${g.id}/cancel` });
                      setCancelId(null);
                    } else setCancelId(g.id);
                  }}
                >
                  {cancelId === g.id ? "Подтвердить отмену и возврат танго" : "Отменить розыгрыш"}
                </button>
              )}
            </div>
            {g.draw && (
              <div>
                <p>Результат сохранён один раз. Участвовало билетов: {g.draw.ticketCount}.</p>
                {g.draw.winners.length === 0 && <p>Участников не было.</p>}
                {g.draw.winners.map((w) => (
                  <div key={w.ticketNumber} className={styles.winner}>
                    <p>
                      Билет №{w.ticketNumber} · Telegram ID {w.telegramId} · {w.prize}
                    </p>
                    {w.deliveredAt ? (
                      <p>Приз выдан</p>
                    ) : (
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={mutate.isPending}
                        onClick={() =>
                          mutate.mutate({ path: `giveaways/${g.id}/delivery/${w.ticketNumber}` })
                        }
                      >
                        Отметить выдачу
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>
      {ticketView && (
        <section className={`panel-card ${styles.section}`}>
          <h2>Билеты</h2>
          {tickets.isLoading ? (
            <p>Загрузка…</p>
          ) : tickets.isError ? (
            <p role="alert">Не удалось загрузить билеты.</p>
          ) : (
            <ul>
              {tickets.data?.map((ticket) => (
                <li key={ticket.number}>
                  №{ticket.number} · Telegram ID {ticket.telegramId}
                </li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            {ticketView.after > 0 && (
              <button
                type="button"
                className="button-secondary"
                onClick={() =>
                  setTicketView({ ...ticketView, after: Math.max(0, ticketView.after - 100) })
                }
              >
                ← Назад
              </button>
            )}
            {tickets.data?.length === 100 && (
              <button
                type="button"
                className="button-secondary"
                onClick={() =>
                  setTicketView({ ...ticketView, after: tickets.data!.at(-1)!.number })
                }
              >
                Дальше →
              </button>
            )}
            <button type="button" className="button-secondary" onClick={() => setTicketView(null)}>
              Закрыть список
            </button>
          </div>
        </section>
      )}
      <section className={`panel-card ${styles.section}`}>
        <h2>Проверки профилей</h2>
        <p className="muted-copy">
          Обычные проверки выполняются автоматически. Ошибки провайдера не отнимают награды.
        </p>
        {data.verifications.length === 0 ? (
          <p>Нет ожидающих проверок.</p>
        ) : (
          data.verifications.map((v) => (
            <div key={v.id} className={styles.winner}>
              <p>
                {v.provider === "steam" ? "Steam" : "Telegram"} · Telegram ID {v.telegramId}
              </p>
              {v.profileId && (
                <a
                  href={`https://steamcommunity.com/profiles/${encodeURIComponent(v.profileId)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть Steam
                </a>
              )}
              <p>{v.observedName ?? "Имя ещё не получено"}</p>
              <p>{v.reason ?? "В очереди фоновой проверки"}</p>
              <label>
                Причина ручного решения
                <input
                  maxLength={500}
                  value={reviewReasons[v.id] ?? ""}
                  onChange={(e) => setReviewReasons({ ...reviewReasons, [v.id]: e.target.value })}
                />
              </label>
              <div className={styles.actions}>
                {[true, false].map((approved) => (
                  <button
                    key={String(approved)}
                    type="button"
                    className="button-secondary"
                    disabled={mutate.isPending || !(reviewReasons[v.id] ?? "").trim()}
                    onClick={() =>
                      mutate.mutate({
                        path: `verifications/${v.id}`,
                        body: { approved, reason: reviewReasons[v.id], profileId: v.profileId }
                      })
                    }
                  >
                    {approved ? "Проверил: тег есть" : "Тег не найден"}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </section>
  );
}
