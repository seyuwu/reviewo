import { randomInt } from "node:crypto";

export const DEFAULT_TASKS = {
  profile_ready: { title: "Заполни игровой профиль", amount: 5, period: "once", enabled: true },
  daily_party: {
    title: "Первый поиск или сбор пати за день",
    amount: 5,
    period: "day",
    enabled: true
  },
  referral_ready: { title: "Друг зарегистрировался", amount: 5, period: "friend", enabled: true },
  referral_active: {
    title: "Друг нашёл или начал искать пати",
    amount: 15,
    period: "friend",
    enabled: true
  },
  first_party_join: { title: "Найди свою первую пати", amount: 5, period: "once", enabled: true },
  weekly_party: {
    title: "Ищи пати в каждый день недели",
    amount: 10,
    period: "week",
    enabled: true
  },
  telegram_tag: { title: "Тег в имени Telegram", amount: 2, period: "day", enabled: true },
  steam_tag: { title: "Тег в имени Steam", amount: 2, period: "day", enabled: true }
} as const;
export type TaskKey = keyof typeof DEFAULT_TASKS;
export type RewardSettings = {
  programName: string;
  mascotName: string;
  currencyName: string;
  tag: string;
  phrases: { home: string[]; earn: string[]; raffle: string[]; history: string[] };
  tasks: Record<TaskKey, { title: string; amount: number; period: string; enabled: boolean }>;
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
