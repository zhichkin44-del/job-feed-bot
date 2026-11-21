// How to apply to a vacancy legally: only links that open the right place with the ready text.
// The candidate always sends it themselves: the bot does not log into their email, Telegram or hh account.
import { safeUrl, EN_SITES } from './lib.js';

/** Caption of the "open the vacancy" button, by platform. */
const SITE_LABEL = {
  hn: 'Открыть на Hacker News',
  remoteok: 'Открыть на Remote OK',
  wwr: 'Открыть на We Work Remotely',
  cryptojobs: 'Открыть на Crypto Jobs List',
  himalayas: 'Открыть на Himalayas',
  remotive: 'Открыть на Remotive',
};

const MAILTO_MAX = 1800; // some mail clients cut long mailto links: beyond this the letter is copied by hand
const TG_MAX = 2000;

/**
 * Application links: the vacancy on the platform; email and Telegram only if the employer stated them in the vacancy text.
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
