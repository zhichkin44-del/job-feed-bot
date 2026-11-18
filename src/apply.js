// Как откликнуться на вакансию законно: только ссылки, которые открывают нужное место с готовым текстом.
// Отправляет всегда сам кандидат — бот не входит в его почту, Telegram или аккаунт hh.
import { safeUrl, EN_SITES } from './lib.js';

/** Подпись кнопки «открыть вакансию» по площадке. */
const SITE_LABEL = {
  hn: 'Открыть на Hacker News',
  remoteok: 'Открыть на Remote OK',
  wwr: 'Открыть на We Work Remotely',
  cryptojobs: 'Открыть на Crypto Jobs List',
  himalayas: 'Открыть на Himalayas',
  remotive: 'Открыть на Remotive',
};

const MAILTO_MAX = 1800; // часть почтовых программ обрезает длинные mailto — дальше письмо копируется вручную
const TG_MAX = 2000;

/**
 * Ссылки для отклика: вакансия на площадке; почта и Telegram — только если работодатель сам указал их в тексте вакансии.
 * @returns {{ kind: string, label: string, url: string, full: boolean }[]} kind — site | email | telegram
 */
export function applyLinks(v, letterText = '') {
  const out = [];
  const site = safeUrl(v.url);
  if (site)
    out.push({
      kind: 'site',
      label:
        SITE_LABEL[v.site] ||
        (site.includes('career.habr.com') ? 'Открыть на Хабр Карьере' : site.includes('t.me/') ? 'Открыть пост' : 'Открыть на hh'),
      url: site,
      full: true,
    });
  const subject = `${EN_SITES.has(v.site) ? 'Application' : 'Отклик'}: ${String(v.title ?? '').slice(0, 120)}`;
  for (const email of v.contacts?.emails ?? []) {
    if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(email)) continue;
    const body = letterText.length <= MAILTO_MAX ? letterText : '';
    out.push({
      kind: 'email',
      label: `Письмо на ${email}`,
      url: `mailto:${email}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`,
      full: Boolean(body),
    });
  }
  for (const handle of v.contacts?.telegram ?? []) {
    if (!/^[a-z][a-z0-9_]{4,31}$/i.test(handle)) continue;
    const text = letterText.length <= TG_MAX ? letterText : '';
    out.push({
      kind: 'telegram',
      label: `Написать @${handle}`,
      url: `https://t.me/${handle}${text ? `?text=${encodeURIComponent(text)}` : ''}`,
      full: Boolean(text),
    });
  }
  return out;
}
