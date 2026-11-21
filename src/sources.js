// Extra radar sources: Habr Career (RSS) and open Telegram channels (web previews t.me/s/<channel>).
// Only open data, no sign-in. Everything that comes from here is untrusted text: it goes into the report escaped.
import { decode, stripTags } from './lib.js';

/**
 * Channels with AI vacancies that have an open web preview and a post in the last 7 days. The first 8 are from CLAUDE-MARKET.md
 * (checked 05.11.2026); the other 7 are from research of 06.11.2026 (t.me/s/<channel> without sign-in; the post date is the datetime attribute).
 */
export const TELEGRAM_CHANNELS = [
  'datasciencejobs',
  'datajob',
  'ai_rabota',
  'neurodromo',
  'itvacancykz',
  'geekjobs',
  'remocate',
  'careerspace',
  // 06.11: share of AI posts over 7 days: 83, 95, 100, 67, 57, 43 and 35 %
  'aivacancychannel',
  'notificaJobs_AI_MachineLearning', // EN
  'remote_ai_jobs', // EN
  'opento_data', // RU/EN
  'opento_dev', // RU/EN
  'forchiefs',
  'habr_career',
  // 06.11, second research: alive (a post in 7 days, preview open), together fewer than 2 AI posts a day
  'jobfortm',
  'datascienceml_jobs',
  'ml_jobs_kz',
  'datajobskz',
  'product_jobs',
  'hireproproduct',
  'runello_rus_datascience',
  'love_it_hate',
];

/** Checked 06.11.2026 and not taken, so that they are not added again. */
export const TELEGRAM_DEAD = {
  vakansii_ai: 'превью закрыто',
  rabota_programmisty_IT_II_gpt: 'превью закрыто',
  distantsiya: 'канала нет или превью закрыто',
  headz_io: 'канала нет или превью закрыто',
  llm_jobs: 'последний пост 29.10.2026',
  aitujobs: 'последний пост 24.10.2026',
  ml_data_science_job: 'последний пост 16.10.2026',
  ai_forge: 'последний пост 14.10.2026',
  best_itjob: 'последний пост 02.2026',
  evacuatejobs: 'тот же канал, что remocate',
};

/** A channel silent for longer than this gets a mark in the collection report (liveness is checked on every collection). */
export const TELEGRAM_STALE_DAYS = 14;

/** The date of the latest post on the channel's preview page (any post, not only vacancies), or null. */
export function lastPostAt(html) {
  const dates = [...String(html ?? '').matchAll(/<time[^>]*datetime="([^"]+)"/g)].map((m) => Date.parse(m[1])).filter(Number.isFinite);
  return dates.length ? new Date(Math.max(...dates)).toISOString() : null;
}

/** A channel is "silent" if the preview has no posts or the last one is older than TELEGRAM_STALE_DAYS. Returns { last, stale }. */
export function channelState(html, now = Date.now()) {
  const last = lastPostAt(html);
  return { last, stale: !last || (now - Date.parse(last)) / 864e5 > TELEGRAM_STALE_DAYS };
}

/**
 * Contacts for applying, if the employer stated them in the vacancy text: email and Telegram.
 * Aggregator channels and service t.me links (s/, joinchat, +invites) are not contacts.
 */
export function contactsOf(text) {
  const t = String(text ?? '');
  const emails = [
    ...new Set((t.match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi) || []).map((e) => e.toLowerCase())),
  ].filter((e) => !/\.(png|jpe?g|gif|webp|svg)$/i.test(e));
  const handles = new Set();
  for (const m of t.matchAll(/(?:^|[\s(:,])@([a-z][a-z0-9_]{4,31})\b/gi)) handles.add(m[1].toLowerCase());
  for (const m of t.matchAll(/t\.me\/([a-z][a-z0-9_]{4,31})(?![\w/])/gi)) handles.add(m[1].toLowerCase());
  const channels = new Set(TELEGRAM_CHANNELS.map((c) => c.toLowerCase()));
  const telegram = [...handles].filter((h) => !channels.has(h) && !/^(joinchat|share|addstickers|proxy|iv)$/.test(h));
  return { emails: emails.slice(0, 3), telegram: telegram.slice(0, 3) };
}

/** Queries to Habr Career (search by vacancy text, remote only). */
export const HABR_QUERIES = ['LLM', 'AI', 'ИИ', 'GenAI', 'нейросети', 'агент'];

export const habrUrl = (q) => `https://career.habr.com/vacancies/rss?${new URLSearchParams({ q, remote: 'true', type: 'all' })}`;
export const telegramUrl = (channel) => `https://t.me/s/${encodeURIComponent(channel)}`;

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim() : '';
};

/** Date → "dd.mm.yyyy" (as on hh), so that the freshness score works the same way. */
export function ddmmyyyy(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/** Pay from free text: "От 250 000 ₽", "от 300 до 450 тыс. ₽", "$5000". Empty gives "не указан". */
export function salaryFromText(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ');
  const m = t.match(
    /((?:от|до)\s*[\d ]{3,}\d(?:\s*(?:до)\s*[\d ]{3,}\d)?\s*(?:₽|руб|\$|usd|€|eur|₸|тенге))|(\$\s?[\d ]{3,}\d(?:\s*[-–]\s*\$?\s?[\d ]{3,}\d)?)/i,
  );
  if (!m) return 'не указан';
  let s = m[0].trim();
  // "$5000–7000" → "от 5000 до 7000 $", so that parseSalary parses it
  const usd = s.match(/^\$\s?([\d ]+\d)(?:\s*[-–]\s*\$?\s?([\d ]+\d))?$/);
  if (usd) s = usd[2] ? `от ${usd[1]} до ${usd[2]} $` : `от ${usd[1]} $`;
  return s.replace(/руб\.?/i, '₽');
}

/** Habr Career RSS → vacancies in the radar format. */
export function parseHabrRss(xml) {
  const out = [];
  for (const m of String(xml ?? '').matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const link = decode(tag(item, 'link'));
    const id = (link.match(/career\.habr\.com\/vacancies\/(\d+)/) || [])[1];
    if (!id) continue;
    const desc = decode(tag(item, 'description'));
    const title = (desc.match(/на вакансию «(.+?)»(?:\.|\s)/) || [])[1] || decode(tag(item, 'title')).replace(/^Требуется «|».*$/g, '');
    out.push({
      id: `habr-${id}`,
      url: `https://career.habr.com/vacancies/${id}`,
      site: 'habr',
      title,
      company: decode(tag(item, 'author')),
      created: ddmmyyyy(tag(item, 'pubDate')),
      region: /можно удал[её]нно/i.test(desc) ? 'удалённо' : '',
      salaryText: salaryFromText(desc),
      remote: /можно удал[её]нно/i.test(desc),
      text: desc,
    });
  }
  return out;
}

const ROLE_WORD =
  /(engineer|инженер|developer|разработчик|lead|руковод|head|директор|архитект|architect|product|продакт|менеджер|manager|аналитик|специалист)/i;
// Label lines of the post: "Место работы: …", "Формат: …", "Зарплата: …" are not the vacancy title
const LABEL =
  /^(место работы|workplace|компания|company|локация|location|город|формат|format|зарплата|salary|вилка|оклад|опыт|experience|график|занятость|контакт|связь|стек|stack)\b/i;
// "Должность: X", "Вакансия: X", "Position: X": the title after the colon
const TITLE_LABEL = /^(должность|вакансия|позиция|position|role|роль)\s*[:—-]\s*(.+)$/i;

/** Vacancy title from the post text: an explicit "Должность: …", otherwise the first line with a role, without emoji and labels. */
export function titleOf(text) {
  const lines = String(text ?? '')
    .split('\n')
    .map((l) =>
      l
        .replace(/^[^a-zа-яё0-9]+/i, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((l) => l && !/^(#\S+\s*)+$/.test(l) && /[a-zа-яё]{3}/i.test(l));
  for (const l of lines) {
    const m = TITLE_LABEL.exec(l);
    if (m) return m[2].trim().slice(0, 160);
  }
  return (lines.find((l) => ROLE_WORD.test(l) && !LABEL.test(l)) || lines.find((l) => !LABEL.test(l)) || '').slice(0, 160);
}

const VACANCY_HINT =
  /(ваканси|ищем|требуется|hiring|опыт работы|зарплат|вилка|оклад|формат работы|обязанности|требования|#job|#работа|we are looking|we're looking|job opening|position|apply|requirements|responsibilities|salary)/i;

/** Web preview of a Telegram channel → vacancy posts (the title is the first meaningful line). */
export function parseTelegramPage(html, channel) {
  const s = String(html ?? '');
  const out = [];
  const parts = s.split('tgme_widget_message_wrap').slice(1);
  for (const part of parts) {
    const post = (part.match(/data-post="([\w]+)\/(\d+)"/) || []).slice(1);
    if (post.length < 2) continue;
    const ti = part.indexOf('tgme_widget_message_text');
    if (ti < 0) continue;
    const body = part.slice(part.indexOf('>', ti) + 1);
    const end = body.search(/<div class="tgme_widget_message_(footer|reply_markup|link_preview)/);
    const text = stripTags((end > 0 ? body.slice(0, end) : body).replace(/<br\s*\/?>/gi, '\n'));
    if (!VACANCY_HINT.test(text)) continue;
    const title = titleOf(text);
    const dt = (part.match(/datetime="([^"]+)"/) || [])[1];
    out.push({
      id: `tg-${post[0]}-${post[1]}`,
      url: `https://t.me/${post[0]}/${post[1]}`,
      site: 'telegram',
      title,
      company: `t.me/${channel}`,
      created: dt ? ddmmyyyy(dt) : '',
      region: /удал[её]н|remote/i.test(text) ? 'удалённо' : '',
      salaryText: salaryFromText(text),
      remote: /удал[её]н|remote|#удал/i.test(text),
      text: text.slice(0, 4000),
    });
  }
  return out;
}
