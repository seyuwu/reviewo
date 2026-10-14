import { randomInt } from "node:crypto";

export const TASK_CONDITIONS = {
  account_ready: { title: "Заполнен игровой профиль", periods: ["once"] },
  party_activity: {
    title: "Поиск, создание или вступление в пати",
    periods: ["once", "day", "week"]
  },
  search_started: {
    title: "Поиск пати (не менее двух минут или успешный подбор)",
    periods: ["once", "day", "week"]
  },
  party_created: { title: "Создание пати", periods: ["once", "day", "week"] },
  party_joined: { title: "Вступление в пати", periods: ["once", "day", "week"] },
  referral_ready: {
    title: "Приглашённый друг зарегистрировался",
    periods: ["friend", "once", "day", "week"]
  },
  referral_active: {
    title: "Приглашённый друг начал пользоваться пати",
    periods: ["friend", "once", "day", "week"]
  },
  weekly_party: { title: "Активность в пати в семь разных дней одной недели", periods: ["week"] },
  telegram_tag: {
    title: "Тег в имени Telegram с повторными проверками",
    periods: ["once", "day", "week"]
  },
  manual: {
    title: "Подтверждение администратором по заявке игрока",
    periods: ["once", "day", "week"]
  }
} as const;
export type TaskCondition = keyof typeof TASK_CONDITIONS;
export type TaskPeriod = "once" | "day" | "week" | "friend";
export type RewardTask = {
  title: string;
  description: string;
  amount: number;
  period: TaskPeriod;
  condition: TaskCondition;
  enabled: boolean;
  minimumHours: number;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
};
export const DEFAULT_TASKS: Record<string, RewardTask> = {
  profile_ready: {
    title: "Заполни игровой профиль",
    description: "Укажи MMR и позиции при регистрации.",
    condition: "account_ready",
    minimumHours: 24,
    amount: 5,
    period: "once",
    enabled: true
  },
  daily_party: {
    title: "Первый поиск или сбор пати за день",
    description:
      "Создай пати, вступи в неё или запусти поиск. Короткие отменённые поиски не учитываются.",
    condition: "party_activity",
    minimumHours: 24,
    amount: 5,
    period: "day",
    enabled: true
  },
  referral_ready: {
    title: "Друг зарегистрировался",
    description: "Пригласи друга по своей ссылке; он должен заполнить игровой профиль.",
    condition: "referral_ready",
    minimumHours: 24,
    amount: 5,
    period: "friend",
    enabled: true
  },
  referral_active: {
    title: "Друг нашёл или начал искать пати",
    description: "Приглашённый друг начал пользоваться поиском или пати.",
    condition: "referral_active",
    minimumHours: 24,
    amount: 15,
    period: "friend",
    enabled: true
  },
  first_party_join: {
    title: "Найди свою первую пати",
    description: "Вступи в пати другого игрока или получи результат подбора.",
    condition: "party_joined",
    minimumHours: 24,
    amount: 5,
    period: "once",
    enabled: true
  },
  weekly_party: {
    title: "Ищи пати в каждый день недели",
    description: "Семь разных дней активности с понедельника по воскресенье, по Москве.",
    condition: "weekly_party",
    minimumHours: 24,
    amount: 10,
    period: "week",
    enabled: true
  },
  telegram_tag: {
    title: "Тег в имени Telegram",
    description:
      "Добавь рекламный тег в имя Telegram и сохраняй его. Начисление после повторных проверок.",
    condition: "telegram_tag",
    minimumHours: 24,
    amount: 2,
    period: "day",
    enabled: true
  }
};
export type TaskKey = string;
export type RewardSettings = {
  programName: string;
  mascotName: string;
  currencyName: string;
  tag: string;
  phrases: { home: string[]; earn: string[]; raffle: string[]; history: string[] };
  tasks: Record<string, RewardTask>;
};
export const DEFAULT_SETTINGS: RewardSettings = {
  programName: "Танго от Марины",
  mascotName: "Марина",
  currencyName: "танго",
  tag: "@FDPdotabot",
  phrases: {
    home: [
      "Привет! Пока ты собираешь пати, я собираю для тебя тангусики.",
      "Твоя следующая сокровищница может быть совсем рядом!",
      "Зови друзей — вместе и играть, и копить веселее."
    ],
    earn: [
      "За полезные дела — зелёные награды. Всё учитывается само!",
      "Я берегу твои тангусики. Ты пока найди хорошую пати!",
      "Проверим задания? Уже выполненное засчитывается автоматически."
    ],
    raffle: [
      "Сокровищницы ждут! Выбирай розыгрыш и удачи тебе.",
      "Держу за тебя кулачки! Каждый билет получает свой шанс.",
      "Вот это призы! Посмотрим, кому сегодня улыбнётся удача."
    ],
    history: [
      "Здесь всё записано: от первого листочка до каждого билета.",
      "Тангусики любят порядок. Проверим, что ты заработал?"
    ]
  },
  tasks: structuredClone(DEFAULT_TASKS)
};
export function moscowDay(at: Date): string {
  return new Date(at.getTime() + 10800000).toISOString().slice(0, 10);
}
export function moscowWeek(at: Date): string {
  const local = new Date(`${moscowDay(at)}T00:00:00Z`);
  local.setUTCDate(local.getUTCDate() - ((local.getUTCDay() + 6) % 7));
  return local.toISOString().slice(0, 10);
}
export function taskPeriod(task: RewardTask, at: Date, friend?: string): string {
  if (task.period === "once") return "once";
  if (task.period === "day") return moscowDay(at);
  if (task.period === "week") return moscowWeek(at);
  if (!friend) throw new Error("Referral tasks require the invited friend");
  return friend;
}
export function activeTask(task: RewardTask, at?: Date): boolean {
  return (
    task.enabled && !task.archivedAt && (!at || !task.createdAt || at >= new Date(task.createdAt))
  );
}
export function normalizeSettings(value: unknown): RewardSettings {
  const saved = (value ?? {}) as Partial<RewardSettings>;
  const tasks: Record<string, RewardTask> = {};
  for (const [key, task] of Object.entries({ ...DEFAULT_TASKS, ...saved.tasks })) {
    if (!Object.hasOwn(DEFAULT_TASKS, key) && !/^custom_[a-f0-9]{32}$/.test(key)) continue;
    if (key === "steam_tag") continue;
    const fallback = DEFAULT_TASKS[key];
    tasks[key] = {
      ...fallback,
      ...task,
      description: task.description ?? fallback?.description ?? "",
      condition: task.condition ?? fallback?.condition ?? "manual",
      minimumHours: task.minimumHours ?? 24
    };
  }
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    tasks,
    phrases: { ...DEFAULT_SETTINGS.phrases, ...saved.phrases }
  };
}
export function containsTag(name: string, tag: string): boolean {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_@])${escaped}(?![A-Za-z0-9_])`, "i").test(name);
}
export function chooseWinners<T extends { telegramId: string }>(
  tickets: T[],
  count: number,
  unique: boolean,
  select: (max: number) => number = randomInt
): T[] {
  let pool = [...tickets];
  const winners: T[] = [];
  while (pool.length && winners.length < count) {
    const index = select(pool.length),
      winner = pool[index]!;
    winners.push(winner);
    pool = unique
      ? pool.filter((t) => t.telegramId !== winner.telegramId)
      : pool.filter((_, i) => i !== index);
  }
  return winners;
}
