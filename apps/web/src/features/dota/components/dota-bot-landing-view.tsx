import Link from "next/link";

import { buildDotaBotProfileUrl, DOTA_BOT_USERNAME } from "../../../lib/config/dota-bot";
import styles from "./dota-bot-landing-view.module.css";
import { TrackedDotaBotLink } from "./tracked-dota-bot-link";

const searchUrl = "/games/search";

export function DotaBotLandingView() {
  return (
    <main className={`shell ${styles.page}`}>
      <section aria-labelledby="fdp-title" className={styles.hero}>
        <p className={styles.eyebrow}>FDP · Dota 2 · Telegram</p>
        <h1 className={styles.title} id="fdp-title">
          Найди пати в Dota 2 по ролям и MMR
        </h1>
        <p className={styles.lead}>
          FDP помогает искать команду или собирать игроков прямо в Telegram. Укажи свой MMR и
          позиции — бот подберёт совместимую пати, покажет состав и сообщит об изменениях.
        </p>
        <div className={styles.actions}>
          <TrackedDotaBotLink className="button-primary" source="seo">
            Открыть FDP в Telegram
          </TrackedDotaBotLink>
          <Link className="button-secondary" href={searchUrl}>
            Открыть поиск на сайте
          </Link>
        </div>
        <p className={styles.note}>
          Telegram-бот: <a href={buildDotaBotProfileUrl()}>@{DOTA_BOT_USERNAME}</a>
        </p>
      </section>

      <section aria-label="Возможности FDP" className={styles.features}>
        <article className={styles.card}>
          <h2>Подбор по ролям</h2>
          <p>Укажи позиции в профиле, чтобы искать игроков на подходящие свободные слоты.</p>
        </article>
        <article className={styles.card}>
          <h2>Учитывается MMR</h2>
          <p>Автоподбор ищет совместимые команды с учётом рейтинга игроков.</p>
        </article>
        <article className={styles.card}>
          <h2>Пати всегда под рукой</h2>
          <p>Состав и уведомления доступны в боте; чат и Discord открываются со страницы пати.</p>
        </article>
      </section>

      <section aria-labelledby="fdp-how-title" className={styles.section}>
        <h2 id="fdp-how-title">Как начать поиск пати</h2>
        <ol className={styles.steps}>
          <li>Открой FDP в Telegram и создай профиль или войди в Opinia.</li>
          <li>Укажи MMR и свои позиции. Dota ID можно добавить позже.</li>
          <li>Нажми «Ищу пати» или «Собрать пати» и дождись подходящих игроков.</li>
        </ol>
        <TrackedDotaBotLink className="button-primary" source="seo">
          Начать в Telegram
        </TrackedDotaBotLink>
      </section>

      <section aria-labelledby="fdp-faq-title" className={styles.section}>
        <h2 id="fdp-faq-title">Частые вопросы</h2>
        <details className={styles.faq}>
          <summary>Как FDP подбирает игроков?</summary>
          <p>Бот сопоставляет MMR и выбранные позиции с открытыми местами в пати.</p>
        </details>
        <details className={styles.faq}>
          <summary>Нужно ли указывать Dota ID?</summary>
          <p>Нет, это необязательно. Его можно добавить в профиль позднее.</p>
        </details>
        <details className={styles.faq}>
          <summary>Подбор сработает сразу?</summary>
          <p>
            Это зависит от того, сколько игроков сейчас ищут пати и какие позиции им нужны. Бот
            продолжит поиск, пока он активен.
          </p>
        </details>
        <details className={styles.faq}>
          <summary>Где общаться с командой?</summary>
          <p>Открой страницу пати из бота: там доступны чат и Discord, если он подключён.</p>
        </details>
      </section>
    </main>
  );
}
