"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "../../../lib/api/api-client";
import { ApiError } from "../../../lib/api/api-error";
import { readApiErrorMessage } from "../../../lib/api/read-api-error";
import styles from "./admin-rewards-page-view.module.css";

export type RewardTaskInfo = {
  title: string;
  description: string;
  amount: number;
  enabled: boolean;
  condition: string;
  period: string;
  minimumHours: number;
  archivedAt?: string | null;
};
export type TaskConditionInfo = { value: string; title: string; periods: readonly string[] };
type Filters = { task: string; telegramId: string; from: string; to: string };
type Analytics = {
  totals: { completions: number; users: number; amount: number };
  tasks: {
    key: string;
    title: string;
    archived: boolean;
    completions: number;
    users: number;
    amount: number;
  }[];
  completions: {
    id: string;
    task: string;
    title: string;
    telegramId: string;
    displayName: string | null;
    telegramUsername: string | null;
    amount: number;
    occurredAt: string;
    createdAt: string;
  }[];
  hasMore: boolean;
};
type Submission = {
  id: string;
  taskKey: string;
  telegramId: string;
  displayName: string | null;
  telegramUsername: string | null;
  evidence: string;
  status: string;
  reason: string | null;
  rule: RewardTaskInfo;
  submittedAt: string;
  reviewedAt: string | null;
  awardedAmount: number;
};
const periods: Record<string, string> = {
  once: "Один раз",
  day: "Раз в день",
  week: "Раз в неделю",
  friend: "За каждого нового друга"
};
const date = (at = new Date()) => new Date(at.getTime() + 10800000).toISOString().slice(0, 10);
const when = (at: string) => new Date(at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
const payload = (task: RewardTaskInfo) => ({
  title: task.title,
  description: task.description,
  amount: task.amount,
  enabled: task.enabled,
  condition: task.condition,
  period: task.period,
  minimumHours: task.minimumHours
});

function TaskEditor({
  initial,
  conditions,
  pending,
  onSave,
  onCancel
}: {
  initial?: RewardTaskInfo | undefined;
  conditions: TaskConditionInfo[];
  pending: boolean;
  onSave: (value: RewardTaskInfo) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<RewardTaskInfo>(
    initial ?? {
      title: "",
      description: "",
      amount: 5,
      enabled: true,
      condition: "manual",
      period: "once",
      minimumHours: 24
    }
  );
  const change = (patch: Partial<RewardTaskInfo>) => setValue((old) => ({ ...old, ...patch }));
  const condition = conditions.find((c) => c.value === value.condition);
  return (
    <form
      className={styles.section}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(value);
      }}
    >
      <h3>{initial ? "Редактировать задание" : "Добавить задание"}</h3>
      <fieldset disabled={pending} className={styles.fields}>
        <label>
          Название задания
          <input
            required
            maxLength={100}
            value={value.title}
            onChange={(e) => change({ title: e.target.value })}
          />
        </label>
        <label>
          Награда за выполнение
          <input
            type="number"
            required
            min={1}
            max={10000}
            value={value.amount}
            onChange={(e) => change({ amount: Number(e.target.value) })}
          />
        </label>
        <label>
          Условие выполнения
          <select
            value={value.condition}
            onChange={(e) => {
              const next = conditions.find((c) => c.value === e.target.value)!;
              change({
                condition: next.value,
                period: next.periods.includes(value.period) ? value.period : next.periods[0]!
              });
            }}
          >
            {conditions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Повторяемость
          <select value={value.period} onChange={(e) => change({ period: e.target.value })}>
            {(condition?.periods ?? ["once"]).map((period) => (
              <option key={period} value={period}>
                {periods[period]}
              </option>
            ))}
          </select>
        </label>
        {value.condition === "telegram_tag" && (
          <label>
            Минимум часов с тегом
            <input
              type="number"
              required
              min={1}
              max={168}
              value={value.minimumHours}
              onChange={(e) => change({ minimumHours: Number(e.target.value) })}
            />
          </label>
        )}
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => change({ enabled: e.target.checked })}
          />
          Показывать игрокам и учитывать выполнение
        </label>
        <label>
          Условия для игрока
          <textarea
            required
            maxLength={500}
            rows={3}
            value={value.description}
            onChange={(e) => change({ description: e.target.value })}
          />
        </label>
      </fieldset>
      <p className="muted-copy">
        Автоматические задания учитываются без открытия раздела наград. Для ручного задания игрок
        присылает описание или ссылку, а администратор подтверждает выполнение.
      </p>
      <div className={styles.actions}>
        <button className="button-primary" disabled={pending} type="submit">
          {initial ? "Сохранить задание" : "Создать задание"}
        </button>
        <button className="button-secondary" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}

export function AdminRewardsTasks({
  token,
  tasks,
  conditions
}: {
  token: string;
  tasks: Record<string, RewardTaskInfo>;
  conditions: TaskConditionInfo[];
}) {
  const client = useQueryClient();
  const [tab, setTab] = useState("tasks"),
    [archive, setArchive] = useState(false);
  const [editor, setEditor] = useState<string | null>(null),
    [remove, setRemove] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const initialFilters: Filters = {
    task: "",
    telegramId: "",
    from: date(new Date(Date.now() - 30 * 86400000)),
    to: date()
  };
  const [draft, setDraft] = useState(initialFilters),
    [filters, setFilters] = useState(initialFilters),
    [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("PENDING"),
    [submissionTask, setSubmissionTask] = useState(""),
    [submissionOffset, setSubmissionOffset] = useState(0);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const headers = { authorization: `Bearer ${token}` };
  const analytics = useQuery({
    queryKey: ["reward-task-analytics", token, filters, offset],
    enabled: tab === "analytics",
    refetchInterval: tab === "analytics" ? 30000 : false,
    queryFn: () =>
      apiRequest<Analytics>(
        "/admin/rewards/analytics?" +
          new URLSearchParams({
            ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
            offset: String(offset)
          }),
        { headers, cache: "no-store" }
      )
  });
  const submissions = useQuery({
    queryKey: ["reward-task-submissions", token, status, submissionTask, submissionOffset],
    enabled: tab === "submissions",
    refetchInterval: tab === "submissions" ? 30000 : false,
    queryFn: () =>
      apiRequest<{ total: number; hasMore: boolean; items: Submission[] }>(
        "/admin/rewards/submissions?" +
          new URLSearchParams({
            status,
            ...(submissionTask ? { task: submissionTask } : {}),
            offset: String(submissionOffset)
          }),
        { headers, cache: "no-store" }
      )
  });
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      apiRequest("/admin/rewards/" + path, { method: "POST", headers, body: body ?? {} }),
    onSuccess: async () => {
      setFeedback("Сохранено");
      setEditor(null);
      setRemove(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin-rewards"] }),
        client.invalidateQueries({ queryKey: ["reward-task-analytics"] }),
        client.invalidateQueries({ queryKey: ["reward-task-submissions"] })
      ]);
    },
    onError: (error) =>
      setFeedback(
        error instanceof ApiError
          ? (readApiErrorMessage(error.body) ?? "Не удалось сохранить")
          : "Не удалось сохранить"
      )
  });
  const viewTask = (key: string) => {
    const next = { ...filters, task: key };
    setDraft(next);
    setFilters(next);
    setOffset(0);
    setTab("analytics");
  };
  const entries = Object.entries(tasks);
  return (
    <section className={`panel-card ${styles.section}`} aria-labelledby="reward-tasks-title">
      <h2 id="reward-tasks-title">Задания и аналитика</h2>
      <div className={styles.actions}>
        {(
          [
            ["tasks", "Задания"],
            ["analytics", "Аналитика"],
            ["submissions", "Заявки на проверку"]
          ] as const
        ).map(([key, label]) => (
          <button
            type="button"
            className={tab === key ? "button-primary" : "button-secondary"}
            aria-pressed={tab === key}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {feedback && <p role="status">{feedback}</p>}
      {tab === "tasks" && (
        <>
          <div className={styles.actions}>
            <button type="button" className="button-primary" onClick={() => setEditor("new")}>
              Добавить задание
            </button>
            <button type="button" className="button-secondary" onClick={() => setArchive(!archive)}>
              {archive ? "Показать действующие" : "Архив заданий"}
            </button>
          </div>
          {editor && (
            <TaskEditor
              key={editor}
              initial={editor === "new" ? undefined : tasks[editor]}
              conditions={conditions}
              pending={mutation.isPending}
              onCancel={() => setEditor(null)}
              onSave={(value) =>
                mutation.mutate({
                  path: editor === "new" ? "tasks" : "tasks/" + editor,
                  body: payload(value)
                })
              }
            />
          )}
          <div className={styles.tasks}>
            {entries
              .filter(([, task]) => !!task.archivedAt === archive)
              .map(([key, task]) => (
                <article className={styles.taskCard} key={key}>
                  <h3>{task.title}</h3>
                  <p>{task.description}</p>
                  <p>
                    <b>+{task.amount}</b> · {periods[task.period]} ·{" "}
                    {task.archivedAt ? "В архиве" : task.enabled ? "Включено" : "Выключено"}
                  </p>
                  <p className="muted-copy">
                    {conditions.find((c) => c.value === task.condition)?.title}
                    {task.condition === "telegram_tag" ? ` · от ${task.minimumHours} ч.` : ""}
                  </p>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => setEditor(key)}
                    >
                      Редактировать
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => viewTask(key)}
                    >
                      Статистика
                    </button>
                    {task.archivedAt ? (
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ path: `tasks/${key}/restore` })}
                      >
                        Вернуть задание
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={mutation.isPending}
                          onClick={() =>
                            mutation.mutate({
                              path: "tasks/" + key,
                              body: payload({ ...task, enabled: !task.enabled })
                            })
                          }
                        >
                          {task.enabled ? "Выключить" : "Включить"}
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => setRemove(key)}
                        >
                          Удалить задание
                        </button>
                      </>
                    )}
                  </div>
                  {remove === key && (
                    <div className={styles.section}>
                      <p>Задание исчезнет у игроков. Начисления и история останутся в архиве.</p>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className="button-primary"
                          disabled={mutation.isPending}
                          onClick={() => mutation.mutate({ path: `tasks/${key}/archive` })}
                        >
                          Да, убрать задание
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          onClick={() => setRemove(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
          </div>
        </>
      )}
      {tab === "analytics" && (
        <>
          <form
            className={styles.fields}
            onSubmit={(e) => {
              e.preventDefault();
              setFilters(draft);
              setOffset(0);
            }}
          >
            <label>
              Задание для статистики
              <select
                value={draft.task}
                onChange={(e) => setDraft({ ...draft, task: e.target.value })}
              >
                <option value="">Все задания</option>
                {entries.map(([key, task]) => (
                  <option key={key} value={key}>
                    {task.title}
                    {task.archivedAt ? " (архив)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Telegram ID игрока
              <input
                inputMode="numeric"
                pattern="[1-9][0-9]{0,19}"
                value={draft.telegramId}
                onChange={(e) => setDraft({ ...draft, telegramId: e.target.value })}
              />
            </label>
            <label>
              Начисления с
              <input
                type="date"
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </label>
            <label>
              Начисления по
              <input
                type="date"
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </label>
            <button type="submit" className="button-primary">
              Применить фильтры
            </button>
          </form>
          <p className="muted-copy">
            Даты по Москве. В статистике только подтверждённые начисления за задания; покупки и
            возвраты не включены.
          </p>
          {analytics.isLoading && <p>Загрузка статистики…</p>}
          {analytics.isError && (
            <p role="alert">
              Не удалось загрузить статистику.{" "}
              <button type="button" onClick={() => void analytics.refetch()}>
                Повторить
              </button>
            </p>
          )}
          {analytics.data && (
            <>
              <div className={styles.stats}>
                <p>
                  Выполнений: <b>{analytics.data.totals.completions}</b>
                </p>
                <p>
                  Игроков: <b>{analytics.data.totals.users}</b>
                </p>
                <p>
                  Начислено: <b>{analytics.data.totals.amount}</b>
                </p>
              </div>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Задание</th>
                      <th>Выполнено</th>
                      <th>Игроков</th>
                      <th>Начислено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.data.tasks.map((task) => (
                      <tr key={task.key}>
                        <td>
                          {task.title}
                          {task.archived ? " · архив" : ""}
                        </td>
                        <td>{task.completions}</td>
                        <td>{task.users}</td>
                        <td>{task.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>Кто выполнил</h3>
              {analytics.data.completions.length === 0 && (
                <p>За выбранный период выполнений нет.</p>
              )}
              {analytics.data.completions.map((row) => (
                <article className={styles.taskCard} key={row.id}>
                  <h4>{row.title}</h4>
                  <p>
                    {row.displayName ?? "Игрок"}{" "}
                    {row.telegramUsername && (
                      <a href={`https://t.me/${encodeURIComponent(row.telegramUsername)}`}>
                        @{row.telegramUsername}
                      </a>
                    )}{" "}
                    · Telegram ID {row.telegramId}
                  </p>
                  <p>
                    Выполнил: {when(row.occurredAt)} · начислено: {when(row.createdAt)} МСК ·{" "}
                    <b>+{row.amount}</b>
                  </p>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      const next = { ...filters, telegramId: row.telegramId };
                      setDraft(next);
                      setFilters(next);
                      setOffset(0);
                    }}
                  >
                    Все задания игрока
                  </button>
                </article>
              ))}
              <div className={styles.actions}>
                {offset > 0 && (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setOffset(Math.max(0, offset - 100))}
                  >
                    ← Назад
                  </button>
                )}
                {analytics.data.hasMore && (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setOffset(offset + 100)}
                  >
                    Дальше →
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
      {tab === "submissions" && (
        <>
          <div className={styles.fields}>
            <label>
              Статус заявок
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setSubmissionOffset(0);
                }}
              >
                <option value="PENDING">Ждут проверки</option>
                <option value="APPROVED">Подтверждены</option>
                <option value="REJECTED">Отклонены</option>
                <option value="ALL">Все</option>
              </select>
            </label>
            <label>
              Задание заявки
              <select
                value={submissionTask}
                onChange={(e) => {
                  setSubmissionTask(e.target.value);
                  setSubmissionOffset(0);
                }}
              >
                <option value="">Все задания</option>
                {entries.map(([key, task]) => (
                  <option key={key} value={key}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {submissions.isLoading && <p>Загрузка заявок…</p>}
          {submissions.isError && (
            <p role="alert">
              Не удалось загрузить заявки.{" "}
              <button type="button" onClick={() => void submissions.refetch()}>
                Повторить
              </button>
            </p>
          )}
          {submissions.data && (
            <>
              <p>Заявок: {submissions.data.total}</p>
              {submissions.data.items.map((row) => (
                <article className={styles.taskCard} key={row.id}>
                  <h3>{row.rule.title}</h3>
                  <p>
                    {row.displayName ?? "Игрок"} · Telegram ID {row.telegramId} ·{" "}
                    {when(row.submittedAt)} МСК
                  </p>
                  <p>{row.evidence}</p>
                  {/^https?:\/\/\S+$/.test(row.evidence) && (
                    <a href={row.evidence} target="_blank" rel="noopener noreferrer">
                      Открыть подтверждение
                    </a>
                  )}
                  <p>
                    Награда на момент заявки: <b>+{row.rule.amount}</b>
                  </p>
                  {row.status === "PENDING" ? (
                    <>
                      <label>
                        Решение по заявке
                        <textarea
                          maxLength={500}
                          value={reasons[row.id] ?? ""}
                          onChange={(e) => setReasons({ ...reasons, [row.id]: e.target.value })}
                        />
                      </label>
                      <div className={styles.actions}>
                        {[
                          [true, "Подтвердить"],
                          [false, "Отклонить"]
                        ].map(([approved, label]) => (
                          <button
                            type="button"
                            className="button-secondary"
                            key={String(approved)}
                            disabled={mutation.isPending || !reasons[row.id]?.trim()}
                            onClick={() =>
                              mutation.mutate({
                                path: `submissions/${row.id}`,
                                body: { approved, reason: reasons[row.id] }
                              })
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p>
                      {row.status === "APPROVED"
                        ? `Подтверждено: +${row.awardedAmount}`
                        : "Отклонено"}{" "}
                      · {row.reason}
                    </p>
                  )}
                </article>
              ))}
              <div className={styles.actions}>
                {submissionOffset > 0 && (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setSubmissionOffset(Math.max(0, submissionOffset - 50))}
                  >
                    ← Назад
                  </button>
                )}
                {submissions.data.hasMore && (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setSubmissionOffset(submissionOffset + 50)}
                  >
                    Дальше →
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
