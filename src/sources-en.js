// Английский рынок удалённых ИИ-вакансий — только открытые официальные ленты (проверено 06.11.2026, robots.txt и условия):
//   HN «Ask HN: Who is hiring?» — официальный поиск Algolia (hn.algolia.com/api), комментарий = вакансия;
//   Remote OK — официальный API remoteok.com/api; условия: ссылка на вакансию на Remote OK и Remote OK как источник
//     (в подборке так и есть: ведём на их страницу). В robots.txt закрыт для ИИ-краулеров — поэтому только API, не сайт;
//   We Work Remotely — официальная RSS; cryptojobslist — официальная RSS (api.cryptojobslist.com/jobs.rss, на неё ведёт их /rss).
// Не берём: Wellfound (открытой ленты нет, страницы вакансий закрыты в robots.txt), web3.career (без регистрации ленты нет).
// Текст вакансий — недоверенные данные. Оплата в отчёте — доллары в месяц.
import { decode, stripTags, EN_MIN_USD } from './lib.js';
import { ddmmyyyy } from './sources.js';
import { regionClasses } from './geo.js';

export const EN_FEEDS = {
  hnSearch: 'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5',
  hnItem: (id) => `https://hn.algolia.com/api/v1/items/${encodeURIComponent(id)}`,
  remoteok: 'https://remoteok.com/api',
  wwr: 'https://weworkremotely.com/remote-jobs.rss',
  cryptojobs: 'https://api.cryptojobslist.com/jobs.rss',
  // Himalayas — официальный API (himalayas.app/api, сверено 06.11): данные обновляются раз в сутки; без ключа — общая
  // квота, поэтому 5 запросов в день. Условия: кнопка отклика — applicationLink без изменений, Himalayas виден как
  // источник, вакансии не передаём другим площадкам, истёкшие убираем.
  // Remote OK по тегам (тот же официальный API, ?tag=): общая лента даёт ~100 свежих вакансий любых профессий, ИИ там редкость
  remoteokTag: (tag) => `https://remoteok.com/api?${new URLSearchParams({ tag })}`,
  // WWR: категория «программирование» — свежие 25, почти все «Anywhere in the World»
  wwrProgramming: 'https://weworkremotely.com/categories/remote-programming-jobs.rss',
  // Remotive — официальный API: условия — ссылка на вакансию на Remotive и Remotive как источник (так и есть: ведём на их
  // страницу), вакансии третьим площадкам не передаём; данные меняются медленно, просят не чаще 4 раз в сутки (у нас 2).
  remotive: (q) => `https://remotive.com/api/remote-jobs?${new URLSearchParams({ search: q, limit: '100' })}`,
  himalayas: (q) => `https://himalayas.app/jobs/api/search?${new URLSearchParams({ q, worldwide: 'true', sort: 'recent', page: '1' })}`,
};

/** Теги Remote OK и запросы к Remotive (по 2 запроса в сутки, не больше 4 — просьба площадки). */
export const REMOTEOK_TAGS = ['ai', 'llm'];
export const REMOTIVE_QUERIES = ['AI', 'LLM'];

/** Запросы к Himalayas: по одному на тему, только вакансии, открытые всему миру. */
export const HIMALAYAS_QUERIES = ['LLM', 'AI engineer', 'AI agents', 'generative AI', 'machine learning'];

/** Нижняя граница для английского рынка: $3000 в месяц — та же, что в оценке (lib.js). */
export const EN_MIN_USD_MONTH = EN_MIN_USD;

/**
 * Оплата из свободного английского текста → { from, to } долларов в месяц или null.
 * «$120k–$150k», «$150,000», «$60-80/hr», «$8,000/month». Годовое делится на 12, почасовое × 160.
 */
export function usdMonthly(text) {
  const t = String(text ?? '').replace(/,/g, '');
  const m = t.match(
    /\$\s?(\d+(?:\.\d+)?)\s*(k)?(?:\s*(?:-|–|to)\s*\$?\s?(\d+(?:\.\d+)?)\s*(k)?)?\s*(\/\s*(?:hr|hour|h)\b|per hour|\/\s*(?:mo|month)\b|per month|\/\s*(?:yr|year)\b|per year|annually)?/i,
  );
  if (!m) return null;
  const k1 = m[2] || (m[4] && !m[2] && Number(m[1]) < 1000 ? m[4] : '');
  let a = Number(m[1]) * (k1 ? 1000 : 1);
  let b = m[3] ? Number(m[3]) * (m[4] ? 1000 : 1) : a;
  if (a === 0) a = b; // «$0 – $200,000»: ноль значит «не указано»
  const unit = String(m[5] || '').toLowerCase();
  const per = /hr|hour|\bh\b/.test(unit) ? 160 : /mo|month/.test(unit) ? 1 : a >= 20000 || /yr|year|annual/.test(unit) ? 1 / 12 : 1;
  a *= per;
  b *= per;
  if (a < 300 && b < 300) return null; // «$5 bonus» и прочий шум
  return { from: Math.round(Math.min(a, b)), to: Math.round(Math.max(a, b)) };
}

/** Текст оплаты для карточки: «$9,000–12,500/мес» или «не указан». */
export function usdText(range) {
  if (!range) return 'не указан';
  const f = (n) => `$${n.toLocaleString('en-US')}`;
  return range.from === range.to ? `${f(range.from)}/мес` : `${f(range.from)}–${f(range.to).slice(1)}/мес`;
}

const REMOTE = /\bremote\b|anywhere|worldwide|distributed/i;

/** Ветка «Who is hiring»: id свежей (по найденным историям Algolia). */
export function latestHiringThread(searchJson) {
  const hits = (searchJson?.hits || []).filter((h) => /who is hiring/i.test(h.title || ''));
  hits.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return hits[0]?.objectID || null;
}

// ── Первая строка поста HN: «Компания | Должность | Место | Тип занятости | Оплата | Ссылка» (порядок у каждого свой) ──
// Название вакансии — только должность; город, страна и «удалёнка» — в поле региона.
const URL_PART = /^(?:https?:\/\/|www\.)\S+$|^[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/i;
const SALARY_PART = /[$£€]\s?\d|\d\s?k\b|\/\s?(?:hr|hour|yr|year|mo|month)\b|\b(?:usd|eur|gbp)\b/i;
const TAG_PART =
  /^(?:full[- ]?time|part[- ]?time|contract(?:or)?|freelance|intern(?:ship)?|permanent|w-?2|1099|equity(?:-first)?|visa|no visa|h-?1b)\b|\b(?:visa sponsorship|sponsorship|citizen(?:ship)?s?|clearable|clearance|hiring gmt|gmt[+-]\d|utc[+-]\d|equity)\b/i;
const PLACE_WORDS = /\b(?:remote|on-?site|in[- ]office|hybrid|worldwide|anywhere|distributed|relocat\w+)\b/i;
const PLACE_TOKENS = /\b(?:NYC|SF|LA|DC|EU|EEA|EMEA|US|USA|UK|CAN|LATAM|APAC|CET|CEST|EST|PST|PT|ET)\b/;
const CITY_STATE = /^[A-Z][A-Za-z.'’ -]+,\s*[A-Z]{2}\b/;
/** Часть начинается с места: «REMOTE (US Citizenship Required)» — это место, а не «условие». */
const PLACE_START = /^(?:fully |100% )?(?:remote|hybrid|on-?site|in[- ]office)\b/i;
const CITIES =
  /\b(?:new york|san francisco|los angeles|seattle|austin|boston|chicago|miami|denver|atlanta|portland|san diego|palo alto|mountain view|brooklyn|washington|toronto|vancouver|montreal|london|berlin|paris|amsterdam|dublin|lisbon|madrid|barcelona|munich|zurich|stockholm|copenhagen|tel aviv|singapore|sydney|melbourne|bremen|hamburg|warsaw|prague|vienna|tokyo|bangalore|bengaluru)\b/i;
// «Сильные» слова должности: по ним часть — точно должность. «Слабые» (ai, data, product…) — только если сильных нет.
const ROLE_STRONG =
  /\b(?:engineers?|developers?|designers?|managers?|leads?|heads?|directors?|architects?|scientists?|researchers?|analysts?|devops|sre|cto|ceo|vp|founders?|founding|consultants?|recruiters?|marketers?|specialists?|administrators?|interns?|csms?|account executives?|roles?|positions?|openings?|swe|sde)\b/i;
const ROLE_WEAK =
  /\b(?:ai|ml|llm|data|software|product|sales|ops|operations|support|training|consulting|marketing|backend|frontend|full[- ]?stack|qa)\b/i;

/** Часть строки называет место: удалёнка, регион, город, «Город, ST». */
const isPlace = (p) => PLACE_WORDS.test(p) || PLACE_TOKENS.test(p) || CITY_STATE.test(p) || CITIES.test(p) || regionClasses(p).length > 0;

/** «REMOTE» → «Remote» и т. п.: в поле региона не кричим капсом. */
const calm = (s) => s.replace(/\b(REMOTE|HYBRID|ONSITE|ON-SITE|WORLDWIDE|ANYWHERE)\b/g, (w) => w[0] + w.slice(1).toLowerCase());

/**
 * Часть-должность без места: «Remote Software Engineer» → { title: «Software Engineer», places: [«Remote»] }, «Engineer (Remote, US)» и
 * «Engineer - NYC» — то же. Скобки без места («AI Engineer (LLM agents)») остаются в названии.
 */
function splitRole(part) {
  const places = [];
  let t = part.replace(/^roles?:\s*/i, '').trim();
  const lead = /^(remote|hybrid|on-?site)\s+/i.exec(t);
  if (lead) {
    places.push(lead[1]);
    t = t.slice(lead[0].length);
  }
  t = t.replace(/\s*\(([^()]*)\)/g, (m, inner) => {
    if (!isPlace(inner)) return m;
    places.push(inner.trim());
    return '';
  });
  const tail = /\s+[-–—@]\s+([^-–—@]+)$/.exec(t);
  if (tail && isPlace(tail[1]) && !ROLE_STRONG.test(tail[1])) {
    places.push(tail[1].trim());
    t = t.slice(0, tail.index);
  }
  return { title: t.replace(/[\s,;:|/+-]+$/, '').trim(), places };
}

/** Название компании: без адреса сайта, без висящей скобки или двоеточия, скобки с пояснением («(YC W19)») остаются целиком. */
function cleanCompany(raw) {
  let c = String(raw ?? '')
    .replace(/\(\s*https?:\/\/[^)]*\)?|https?:\/\/\S+/g, '')
    .trim();
  c = c.replace(/[\s,:;]+$/, '').trim();
  const opens = (c.match(/\(/g) || []).length;
  const closes = (c.match(/\)/g) || []).length;
  if (opens > closes) c = c.replace(/\s*\([^)]*$/, '').trim(); // скобка не закрыта → без хвоста; закрытая «(YC W19)» остаётся
  return c
    .replace(/[\s,:;(]+$/, '')
    .trim()
    .slice(0, 80);
}

/**
 * Первая строка поста HN → { company, title, region } или null (нет «|» — это не вакансия). Название — только должность
 * (если её в строке нет — «Open roles at <компания>»), место и удалёнка — в регион. Ссылки, оплата и тип занятости не в названии.
 * @param {string} first
 */
export function parseHnHead(first) {
  const parts = String(first ?? '')
    .split('|')
    .map((s) => s.trim());
  if (parts.length < 2) return null;
  const company = cleanCompany(parts[0]);
  const places = [];
  const roles = [];
  for (const p of parts.slice(1)) {
    if (!p || URL_PART.test(p)) continue;
    if (PLACE_START.test(p) && !ROLE_STRONG.test(p)) {
      places.push(p);
      continue;
    }
    if (SALARY_PART.test(p) || TAG_PART.test(p)) continue;
    const strong = ROLE_STRONG.test(p);
    // «слабое» название — короткое словосочетание, а не перечень технологий через запятую
    const weak = !strong && ROLE_WEAK.test(p) && !isPlace(p) && !p.includes(',') && p.split(/\s+/).length <= 6;
    if (strong || weak) {
      const { title, places: here } = splitRole(p);
      places.push(...here);
      if (title && title.length <= 110 && !/[.!?]$/.test(title)) roles.push({ title, strong });
      continue;
    }
    if (isPlace(p)) places.push(p);
  }
  const pick = roles.find((r) => r.strong) || roles[0];
  const title = (pick?.title || `Open roles at ${company}`).slice(0, 160);
  const region = [...new Set(places.map((x) => calm(x.trim()).replace(/\s+/g, ' ')))].filter(Boolean).join(' · ').slice(0, 100);
  return { company, title, region };
}

/**
 * Пост HN (простой текст, первая строка — «Компания | …») → поля вакансии: название, компания, регион, удалёнка, оплата.
 * Тот же разбор — для новых постов (parseHnThread) и для пересчёта записей базы (migrate-hn.js).
 * @param {string} text
 */
export function hnFields(text) {
  const first = String(text ?? '').split('\n')[0];
  const head = parseHnHead(first);
  if (!head) return null;
  const remote = REMOTE.test(first);
  const pay = usdMonthly(first) || usdMonthly(String(text).slice(0, 600));
  return {
    title: head.title,
    company: head.company,
    // сам по себе «remote» — по-прежнему «remote»: поле читают фильтры региона (geo.js)
    region: head.region || (remote ? 'remote' : ''),
    remote,
    usd: pay,
    salaryText: usdText(pay),
  };
}

/** Комментарии ветки HN → вакансии (только верхний уровень, первая строка «Компания | Должность | …»). */
export function parseHnThread(itemJson) {
  const out = [];
  for (const c of itemJson?.children || []) {
    if (!c?.text || c.author == null) continue;
    const text = stripTags(String(c.text).replace(/<p>/gi, '\n'));
    const f = hnFields(text);
    if (!f) continue;
    out.push({
      id: `hn-${c.id}`,
      url: `https://news.ycombinator.com/item?id=${c.id}`,
      site: 'hn',
      ...f,
      created: ddmmyyyy(c.created_at),
      text: text.slice(0, 4000),
    });
  }
  return out;
}

/** Remote OK API → вакансии (первый элемент массива — их условия, не вакансия). */
export function parseRemoteOk(json) {
  const out = [];
  for (const x of Array.isArray(json) ? json.slice(1) : []) {
    if (!x?.id || !x.position) continue;
    // вилка Remote OK — годовая в долларах; 0 значит «не указано»
    const lo = Number(x.salary_min) > 0 ? Number(x.salary_min) : 0;
    const hi = Number(x.salary_max) > 0 ? Number(x.salary_max) : 0;
    const pay = lo || hi ? { from: Math.round((lo || hi) / 12), to: Math.round((hi || lo) / 12) } : null;
    out.push({
      id: `rok-${x.id}`,
      url: `https://remoteok.com/remote-jobs/${encodeURIComponent(String(x.id))}`,
      site: 'remoteok',
      title: decode(String(x.position)).slice(0, 160),
      company: decode(String(x.company || '')).slice(0, 80),
      created: ddmmyyyy(x.date),
      // «location» в API — «Anywhere in the World», «USA Only»…; пусто — открыта всем
      region:
        String(x.location || '')
          .trim()
          .slice(0, 80) || 'remote',
      remote: true,
      usd: pay,
      salaryText: usdText(pay),
      text: `${(x.tags || []).join(' ')}\n${stripTags(String(x.description || ''))}`.slice(0, 4000),
    });
  }
  return out;
}

const REMOTIVE_LINK = /^https:\/\/remotive\.com\/remote-jobs\/[\w-]{1,60}\/[\w-]{1,200}$/;

/** Remotive API → вакансии. Ссылка — их страница вакансии (условие площадки); оплата из текста «$25k - $35k»; регион — их поле. */
export function parseRemotive(json) {
  const out = [];
  for (const x of Array.isArray(json?.jobs) ? json.jobs : []) {
    const link = String(x?.url || '').split('?')[0];
    if (!x?.title || !REMOTIVE_LINK.test(link)) continue;
    const pay = usdMonthly(String(x.salary || ''));
    out.push({
      id: `rem-${x.id}`,
      url: link,
      site: 'remotive',
      title: decode(String(x.title)).slice(0, 160),
      company: decode(String(x.company_name || '')).slice(0, 80),
      created: ddmmyyyy(x.publication_date),
      region:
        String(x.candidate_required_location || '')
          .trim()
          .slice(0, 120) || 'remote',
      remote: true,
      usd: pay,
      salaryText: usdText(pay),
      text: `${(x.tags || []).join(' ')}\n${stripTags(String(x.description || ''))}`.slice(0, 4000),
    });
  }
  return out;
}

const HIM_LINK = /^https:\/\/himalayas\.app\/companies\/[\w-]{1,80}\/jobs\/[\w-]{1,160}(\?utm_source=api)?$/;
const PER_MONTH = { hourly: 160, daily: 21, weekly: 4.33, monthly: 1, annual: 1 / 12, yearly: 1 / 12 };

/**
 * Ответ Himalayas /jobs/api/search → вакансии. Ссылка — applicationLink без изменений (условие Himalayas), только
 * их страница вакансии; оплата — в долларах в месяц (почасовая × 160, годовая / 12); истёкшие — пропускаем.
 */
export function parseHimalayas(json, now = Date.now()) {
  const out = [];
  for (const x of Array.isArray(json?.jobs) ? json.jobs : []) {
    const link = String(x?.applicationLink || '');
    if (!x?.title || !HIM_LINK.test(link)) continue;
    if (Number(x.expiryDate) > 0 && Number(x.expiryDate) * 1000 < now) continue;
    const k = PER_MONTH[String(x.salaryPeriod || 'annual').toLowerCase()] ?? 1 / 12;
    const usd = String(x.currency || '').toUpperCase() === 'USD' && (x.minSalary || x.maxSalary);
    const pay = usd ? { from: Math.round((x.minSalary || x.maxSalary) * k), to: Math.round((x.maxSalary || x.minSalary) * k) } : null;
    const where = Array.isArray(x.locationRestrictions) ? x.locationRestrictions.map((l) => l?.name ?? l).filter(Boolean) : [];
    const slug = link.replace(/\?.*$/, '').split('/jobs/')[1];
    out.push({
      id: `him-${String(x.companySlug || '').slice(0, 40)}-${slug}`.slice(0, 120),
      url: link,
      site: 'himalayas',
      title: decode(String(x.title)).slice(0, 160),
      company: decode(String(x.companyName || '')).slice(0, 80),
      created: Number(x.pubDate) > 0 ? ddmmyyyy(new Date(Number(x.pubDate) * 1000).toISOString()) : '',
      region: where.length ? `remote: ${where.join(', ')}` : 'remote, worldwide',
      remote: !where.length || where.some((w) => /thailand|asia|worldwide|anywhere/i.test(String(w))),
      usd: pay,
      salaryText: usdText(pay),
      text: stripTags(String(x.description || '')).slice(0, 4000),
    });
  }
  return out;
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim() : '';
};

/** RSS We Work Remotely или cryptojobslist → вакансии. В WWR заголовок «Компания: Роль». */
export function parseEnRss(xml, site) {
  const out = [];
  for (const m of String(xml ?? '').matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const link = decode(tag(item, 'link') || tag(item, 'guid'));
    if (!/^https:\/\/(weworkremotely\.com|cryptojobslist\.com)\//.test(link)) continue;
    let title = decode(tag(item, 'title'));
    let company = '';
    const colon = title.indexOf(': ');
    if (site === 'wwr' && colon > 0) {
      company = title.slice(0, colon);
      title = title.slice(colon + 2);
    }
    const desc = stripTags(decode(tag(item, 'description')));
    const region = decode(tag(item, 'region'));
    const pay = usdMonthly(desc.slice(0, 1500));
    out.push({
      id: `${site}-${link.split('/').filter(Boolean).pop().slice(0, 60)}`,
      url: link.split('?')[0],
      site,
      title: title.slice(0, 160),
      company: company.slice(0, 80),
      created: ddmmyyyy(tag(item, 'pubDate')),
      region: region || 'remote',
      // WWR — только удалёнка по определению площадки; у cryptojobslist — по тексту
      remote: site === 'wwr' || REMOTE.test(`${title} ${region} ${desc.slice(0, 800)}`),
      usd: pay,
      salaryText: usdText(pay),
      text: desc.slice(0, 4000),
    });
  }
  return out;
}
