import type { Announcement } from "../api";
import type { Lang } from "../i18n";

/**
 * Текст объявления на языке человека: узбекский — если у объявления есть оба
 * поля (заголовок и текст), иначе русский. Правило то же, что на вебе
 * (src/components/announcement-text.ts): половина перевода хуже русского целиком.
 */
export function localizedAnnouncement(a: Pick<Announcement, "title" | "body" | "titleUz" | "bodyUz">, lang: Lang): { title: string; body: string } {
  return lang === "uz" && a.titleUz && a.bodyUz ? { title: a.titleUz, body: a.bodyUz } : { title: a.title, body: a.body };
}
