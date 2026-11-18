// Сбор вакансий из всех открытых источников: hh.ru / hh.kz (RSS + страницы лучших), Хабр Карьера (RSS), Telegram (веб-превью).
// Общий сборщик для radar.js. Ничего не отправляет и никуда не входит.
import { SITES, QUERIES, MIN_RUB, TARGET_RUB } from './profile.js';
import { parseRss, parseVacancyPage, scoreVacancy } from './lib.js';
import {
  HABR_QUERIES,
  TELEGRAM_CHANNELS,
  habrUrl,
  telegramUrl,
  parseHabrRss,
  parseTelegramPage,
  contactsOf,
  channelState,
} from './sources.js';
import {
  EN_FEEDS,
  HIMALAYAS_QUERIES,
  REMOTEOK_TAGS,
  REMOTIVE_QUERIES,
  latestHiringThread,
  parseHnThread,
  parseRemoteOk,
  parseEnRss,
  parseHimalayas,
  parseRemotive,
} from './sources-en.js';

export const UA = 'job-feed-bot/0.1 (personal job search; open feeds only)';
/**
 * hh выключен (проверено 06.11.2026): robots.txt hh — «Disallow: *?*» (лента /search/vacancy/rss?…), соглашение
 * hh.ru/article/28949 запрещает «программы парсинга». Законные пути: официальный API с токеном приложения (кандидат
 * регистрирует на dev.hh.ru) и подборки «автопоиска» hh, которые приходят кандидату на почту. До них hh = false.
 */
export const COLLECT_DEFAULTS = {
  details: 40,
  delay: 1500,
  sites: SITES.map((s) => s.id),
  hh: false,
  habr: true,
  telegram: true,
  en: true,
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getOnce(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, 'HH-User-Agent': UA }, signal: AbortSignal.timeout(45_000) });
  const body = await res.text();
  if (!res.ok) throw Object.assign(new Error(`${res.status} ${url}`), { status: res.status });
  return body;
}

/**
 * Запрос с одним повтором после паузы — только при сетевом сбое или таймауте (ответ 4xx не повторяем).
 * @param {string} url
 * @param {{ fetchImpl?: Function, pause?: number }} [opts]
 */
export async function get(url, { fetchImpl = globalThis.fetch, pause = 5000 } = {}) {
  try {
    return await getOnce(url, fetchImpl);
  } catch (e) {
    if (e.status && e.status < 500) throw e;
    await sleep(pause);
    try {
      return await getOnce(url, fetchImpl);
    } catch (e2) {
      throw new Error(`${String(e2.message ?? e2)} — ${url.slice(0, 120)}`, { cause: e2 });
    }
  }
}

export function rssUrl(site, text, { salary = null } = {}) {
  const p = new URLSearchParams({ text, search_field: 'name', schedule: 'remote', order_by: 'publication_time' });
  if (site.area) p.set('area', site.area);
  if (salary) {
    p.set('salary', String(salary));
    p.set('only_with_salary', 'true');
    p.set('currency_code', 'RUR');
  }
  return `https://${site.host}/search/vacancy/rss?${p}`;
}

/** Текст из ленты (Хабр, Telegram) как «страница вакансии» — для проверки рисков (английский, офис, стаж). */
export function textDetails(v) {
  return v.text ? { ok: true, description: v.text, workFormat: v.remote ? 'удалённо' : '', skills: [], experience: '' } : null;
}

/**
 * Полный сбор. Возвращает { date, all, counts500, errors, note, sites }; `all` — оценённые вакансии (и отброшенные, с причиной).
 * @param {Partial<typeof COLLECT_DEFAULTS> & { fetchImpl?: Function, now?: Date, log?: (s: string) => void, pause?: number }} [opts]
 */
export async function collect(opts = {}) {
  const o = { ...COLLECT_DEFAULTS, ...opts };
  const today = o.now || new Date();
  const date = today.toISOString().slice(0, 10);
  const net = { fetchImpl: o.fetchImpl || globalThis.fetch, pause: o.pause ?? 5000 };
  const log = o.log || (() => {});
  // hh — только с явным hh: true (см. COLLECT_DEFAULTS): ни лент, ни страниц вакансий
  const sites = o.hh ? SITES.filter((s) => o.sites.includes(s.id)) : [];
  const byId = new Map();
  const errors = [];
  /** Telegram-каналы, где нет поста дольше TELEGRAM_STALE_DAYS (или превью без постов): кандидаты на замену. */
  const stale = [];
  const counts500 = [];

  const add = (items) => {
    for (const v of items) {
      const prev = byId.get(v.id);
      if (!prev || (v.site === 'kz' && prev.site !== 'kz')) byId.set(v.id, { ...prev, ...v });
    }
  };

  const jobs = [];
  for (const site of sites) {
    for (const q of QUERIES) {
      // «все регионы» нужны только ради зарубежных компаний с хорошей вилкой — без фильтра там шум
      // вилка — не фильтр: в своих регионах берём всё, и без зарплаты, и с вилкой ниже цели
      if (site.id !== 'any') jobs.push({ site, url: rssUrl(site, q) });
      else jobs.push({ site, url: rssUrl(site, q, { salary: MIN_RUB }) });
    }
    // счётчик 500+: без «нейросет*» — со звёздочкой лента hh отдаёт много лишнего
    jobs.push({
      site,
      url: rssUrl(site, 'ИИ OR AI OR LLM OR GenAI', { salary: TARGET_RUB }),
      count: `${site.label}, ИИ / AI / LLM / GenAI в названии`,
    });
  }
  if (o.habr) for (const q of HABR_QUERIES) jobs.push({ kind: 'habr', url: habrUrl(q) });
  if (o.telegram) for (const c of TELEGRAM_CHANNELS) jobs.push({ kind: 'telegram', channel: c, url: telegramUrl(c) });
  // английский рынок (sources-en.js): официальные ленты, ветка HN ищется по свежему «Who is hiring»
  if (o.en) {
    jobs.push({ kind: 'hn', url: EN_FEEDS.hnSearch });
    jobs.push({ kind: 'remoteok', url: EN_FEEDS.remoteok });
    jobs.push({ kind: 'wwr', url: EN_FEEDS.wwr });
    jobs.push({ kind: 'wwr', url: EN_FEEDS.wwrProgramming });
    for (const t of REMOTEOK_TAGS) jobs.push({ kind: 'remoteok', url: EN_FEEDS.remoteokTag(t) });
    for (const q of REMOTIVE_QUERIES) jobs.push({ kind: 'remotive', url: EN_FEEDS.remotive(q) });
    jobs.push({ kind: 'cryptojobs', url: EN_FEEDS.cryptojobs });
    for (const q of HIMALAYAS_QUERIES) jobs.push({ kind: 'himalayas', url: EN_FEEDS.himalayas(q) });
  }

  let n = 0;
  for (const j of jobs) {
    try {
      let body = await get(j.url, net);
      if (j.kind === 'hn') {
        const thread = latestHiringThread(JSON.parse(body));
        if (!thread) throw new Error('HN: свежая ветка «Who is hiring» не найдена');
        await sleep(o.delay);
        body = await get(EN_FEEDS.hnItem(thread), net);
      }
      if (j.kind === 'telegram') {
        const st = channelState(body, today.getTime());
        if (st.stale) stale.push({ channel: j.channel, last: st.last ? st.last.slice(0, 10) : null });
      }
      const items =
        j.kind === 'habr'
          ? parseHabrRss(body)
          : j.kind === 'telegram'
            ? parseTelegramPage(body, j.channel)
            : j.kind === 'hn'
              ? parseHnThread(JSON.parse(body))
              : j.kind === 'remoteok'
                ? parseRemoteOk(JSON.parse(body))
                : j.kind === 'remotive'
                  ? parseRemotive(JSON.parse(body))
                  : j.kind === 'wwr' || j.kind === 'cryptojobs'
                    ? parseEnRss(body, j.kind)
                    : j.kind === 'himalayas'
                      ? parseHimalayas(JSON.parse(body), today.getTime())
                      : parseRss(body, j.site.id === 'kz' ? 'kz' : 'ru');
      add(items);
      if (j.count) counts500.push({ label: j.count, n: items.length, ids: items.map((v) => v.id) });
    } catch (e) {
      errors.push(String(e.message ?? e));
    }
    n++;
    if (n % 10 === 0) log(`ленты: ${n}/${jobs.length}, вакансий: ${byId.size}`);
    await sleep(o.delay);
  }

  let all = [...byId.values()].map((v) => ({ ...v, contacts: contactsOf(v.text), ...scoreVacancy(v, { today, details: textDetails(v) }) }));
  // страницы читаем только у hh: у Хабра и Telegram текст уже есть в ленте
  const candidates = all
    .filter((v) => o.hh && !v.excluded && (v.site === 'ru' || v.site === 'kz'))
    .sort((a, b) => b.score - a.score)
    .slice(0, o.details);
  let read = 0;
  let failsInRow = 0;
  for (const c of candidates) {
    if (failsInRow >= 5) {
      errors.push('5 сбоев подряд — чтение страниц остановлено');
      break;
    }
    try {
      const details = parseVacancyPage(await get(c.url, net));
      if (!details.ok) {
        errors.push(`страница без описания: ${c.url} — чтение страниц остановлено`);
        break;
      }
      Object.assign(c, scoreVacancy(c, { today, details }), {
        experience: details.experience,
        workFormat: details.workFormat,
        skills: details.skills,
        description: details.description.slice(0, 6000),
        contacts: contactsOf(details.description),
        detailed: true,
      });
      read++;
      failsInRow = 0;
    } catch (e) {
      errors.push(String(e.message ?? e));
      failsInRow++;
    }
    await sleep(o.delay);
  }
  all = all.map((v) => candidates.find((c) => c.id === v.id) ?? v);
  return { date, all, counts500, errors, stale, sites, note: `лент ${jobs.length}, страниц прочитано ${read}` };
}
