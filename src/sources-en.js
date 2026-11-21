// English market of remote AI vacancies: only open official feeds (checked 06.11.2026, robots.txt and terms):
//   HN "Ask HN: Who is hiring?": the official Algolia search (hn.algolia.com/api), a comment is a vacancy;
//   Remote OK: the official API remoteok.com/api; terms: a link to the vacancy on Remote OK, and Remote OK as the source
//     (the digest does exactly that: we lead to their page). Their robots.txt is closed to AI crawlers, hence only the API, not the site;
//   We Work Remotely: the official RSS; cryptojobslist: the official RSS (api.cryptojobslist.com/jobs.rss, which their /rss points to).
// Not taken: Wellfound (no open feed, vacancy pages closed in robots.txt), web3.career (no feed without registration).
// Vacancy text is untrusted data. Pay in the report is dollars per month.
import { decode, stripTags, EN_MIN_USD } from './lib.js';
import { ddmmyyyy } from './sources.js';
import { regionClasses } from './geo.js';

export const EN_FEEDS = {
  hnSearch: 'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5',
  hnItem: (id) => `https://hn.algolia.com/api/v1/items/${encodeURIComponent(id)}`,
  remoteok: 'https://remoteok.com/api',
  wwr: 'https://weworkremotely.com/remote-jobs.rss',
  cryptojobs: 'https://api.cryptojobslist.com/jobs.rss',
  // Himalayas: the official API (himalayas.app/api, checked 06.11): data is updated once a day; without a key there is a shared
  // quota, hence 5 requests per day. Terms: the apply button is applicationLink unchanged, Himalayas is shown as
  // the source, vacancies are not passed to other platforms, expired ones are removed.
  // Remote OK by tags (the same official API, ?tag=): the general feed gives ~100 fresh vacancies of any profession, AI is rare there
  remoteokTag: (tag) => `https://remoteok.com/api?${new URLSearchParams({ tag })}`,
  // WWR: the "programming" category, the latest 25, almost all "Anywhere in the World"
  wwrProgramming: 'https://weworkremotely.com/categories/remote-programming-jobs.rss',
  // Remotive: the official API. Terms: a link to the vacancy on Remotive, and Remotive as the source (that is exactly what happens: we lead to their
  // page); vacancies are not passed to third platforms; data changes slowly, they ask for no more than 4 times a day (we do 2).
  remotive: (q) => `https://remotive.com/api/remote-jobs?${new URLSearchParams({ search: q, limit: '100' })}`,
  himalayas: (q) => `https://himalayas.app/jobs/api/search?${new URLSearchParams({ q, worldwide: 'true', sort: 'recent', page: '1' })}`,
};

/** Remote OK tags and queries to Remotive (2 queries per day, no more than 4: the platform's request). */
export const REMOTEOK_TAGS = ['ai', 'llm'];
export const REMOTIVE_QUERIES = ['AI', 'LLM'];

/** Queries to Himalayas: one per topic, only vacancies open to the whole world. */
export const HIMALAYAS_QUERIES = ['LLM', 'AI engineer', 'AI agents', 'generative AI', 'machine learning'];

/** Lower bound for the English market: $3000 per month, the same as in the scoring (lib.js). */
export const EN_MIN_USD_MONTH = EN_MIN_USD;

/**
 * Pay from free English text → { from, to } dollars per month, or null.
 * "$120k–$150k", "$150,000", "$60-80/hr", "$8,000/month". Annual is divided by 12, hourly multiplied by 160.
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
  if (a === 0) a = b; // "$0 – $200,000": zero means "not stated"
  const unit = String(m[5] || '').toLowerCase();
  const per = /hr|hour|\bh\b/.test(unit) ? 160 : /mo|month/.test(unit) ? 1 : a >= 20000 || /yr|year|annual/.test(unit) ? 1 / 12 : 1;
  a *= per;
  b *= per;
  if (a < 300 && b < 300) return null; // "$5 bonus" and other noise
  return { from: Math.round(Math.min(a, b)), to: Math.round(Math.max(a, b)) };
}

/** Pay text for the card: «$9,000–12,500/мес» or «не указан». */
export function usdText(range) {
  if (!range) return 'не указан';
  const f = (n) => `$${n.toLocaleString('en-US')}`;
  return range.from === range.to ? `${f(range.from)}/мес` : `${f(range.from)}–${f(range.to).slice(1)}/мес`;
}

const REMOTE = /\bremote\b|anywhere|worldwide|distributed/i;

/** The "Who is hiring" branch: the id of the fresh one (from the found Algolia threads). */
export function latestHiringThread(searchJson) {
  const hits = (searchJson?.hits || []).filter((h) => /who is hiring/i.test(h.title || ''));
  hits.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return hits[0]?.objectID || null;
}

// ── First line of an HN post: "Company | Position | Place | Employment type | Pay | Link" (the order is each poster's own) ──
// The vacancy title is only the position; the city, country and "remote" go into the region field.
const URL_PART = /^(?:https?:\/\/|www\.)\S+$|^[\w-]+(?:\.[\w-]+)+(?:\/\S*)?$/i;
const SALARY_PART = /[$£€]\s?\d|\d\s?k\b|\/\s?(?:hr|hour|yr|year|mo|month)\b|\b(?:usd|eur|gbp)\b/i;
const TAG_PART =
  /^(?:full[- ]?time|part[- ]?time|contract(?:or)?|freelance|intern(?:ship)?|permanent|w-?2|1099|equity(?:-first)?|visa|no visa|h-?1b)\b|\b(?:visa sponsorship|sponsorship|citizen(?:ship)?s?|clearable|clearance|hiring gmt|gmt[+-]\d|utc[+-]\d|equity)\b/i;
const PLACE_WORDS = /\b(?:remote|on-?site|in[- ]office|hybrid|worldwide|anywhere|distributed|relocat\w+)\b/i;
const PLACE_TOKENS = /\b(?:NYC|SF|LA|DC|EU|EEA|EMEA|US|USA|UK|CAN|LATAM|APAC|CET|CEST|EST|PST|PT|ET)\b/;
const CITY_STATE = /^[A-Z][A-Za-z.'’ -]+,\s*[A-Z]{2}\b/;
/** A part starts with a place: "REMOTE (US Citizenship Required)" is a place, not a "condition". */
const PLACE_START = /^(?:fully |100% )?(?:remote|hybrid|on-?site|in[- ]office)\b/i;
const CITIES =
  /\b(?:new york|san francisco|los angeles|seattle|austin|boston|chicago|miami|denver|atlanta|portland|san diego|palo alto|mountain view|brooklyn|washington|toronto|vancouver|montreal|london|berlin|paris|amsterdam|dublin|lisbon|madrid|barcelona|munich|zurich|stockholm|copenhagen|tel aviv|singapore|sydney|melbourne|bremen|hamburg|warsaw|prague|vienna|tokyo|bangalore|bengaluru)\b/i;
// "Strong" position words: by them a part is definitely a position. "Weak" ones (ai, data, product…) only if there are no strong ones.
const ROLE_STRONG =
  /\b(?:engineers?|developers?|designers?|managers?|leads?|heads?|directors?|architects?|scientists?|researchers?|analysts?|devops|sre|cto|ceo|vp|founders?|founding|consultants?|recruiters?|marketers?|specialists?|administrators?|interns?|csms?|account executives?|roles?|positions?|openings?|swe|sde)\b/i;
const ROLE_WEAK =
  /\b(?:ai|ml|llm|data|software|product|sales|ops|operations|support|training|consulting|marketing|backend|frontend|full[- ]?stack|qa)\b/i;

/** A part of the line names a place: remote, region, city, "City, ST". */
const isPlace = (p) => PLACE_WORDS.test(p) || PLACE_TOKENS.test(p) || CITY_STATE.test(p) || CITIES.test(p) || regionClasses(p).length > 0;

/** "REMOTE" → "Remote" and the like: we do not shout in caps in the region field. */
const calm = (s) => s.replace(/\b(REMOTE|HYBRID|ONSITE|ON-SITE|WORLDWIDE|ANYWHERE)\b/g, (w) => w[0] + w.slice(1).toLowerCase());

/**
 * A position part without a place: "Remote Software Engineer" → { title: "Software Engineer", places: ["Remote"] }, "Engineer (Remote, US)" and
 * "Engineer - NYC" are the same. Brackets without a place ("AI Engineer (LLM agents)") stay in the title.
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

/** Company name: without the site address, without a dangling bracket or colon; brackets with a note ("(YC W19)") stay in full. */
function cleanCompany(raw) {
  let c = String(raw ?? '')
    .replace(/\(\s*https?:\/\/[^)]*\)?|https?:\/\/\S+/g, '')
    .trim();
  c = c.replace(/[\s,:;]+$/, '').trim();
  const opens = (c.match(/\(/g) || []).length;
  const closes = (c.match(/\)/g) || []).length;
  if (opens > closes) c = c.replace(/\s*\([^)]*$/, '').trim(); // bracket not closed → drop the tail; a closed "(YC W19)" stays
  return c
    .replace(/[\s,:;(]+$/, '')
    .trim()
    .slice(0, 80);
}

/**
 * The first line of an HN post → { company, title, region } or null (no "|" means it is not a vacancy). The title is only the position
 * (if there is none in the line: "Open roles at <company>"); place and remote go into the region. Links, pay and employment type are not in the title.
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
    // a "weak" title is a short phrase, not a comma-separated list of technologies
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
 * An HN post (plain text, the first line "Company | …") → vacancy fields: title, company, region, remote, pay.
 * The same parsing: for new posts (parseHnThread) and for recalculating the database records (migrate-hn.js).
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
    // "remote" by itself is still "remote": the region filters read this field (geo.js)
    region: head.region || (remote ? 'remote' : ''),
    remote,
    usd: pay,
    salaryText: usdText(pay),
  };
}

/** HN thread comments → vacancies (top level only, the first line "Company | Position | …"). */
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

/** Remote OK API → vacancies (the first array element is their terms, not a vacancy). */
export function parseRemoteOk(json) {
  const out = [];
  for (const x of Array.isArray(json) ? json.slice(1) : []) {
    if (!x?.id || !x.position) continue;
    // Remote OK range: annual, in dollars; 0 means "not stated"
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
      // "location" in the API is "Anywhere in the World", "USA Only"…; empty means open to all
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

/** Remotive API → vacancies. The link is their vacancy page (the platform's term); pay from the text "$25k - $35k"; region is their field. */
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
 * Himalayas /jobs/api/search response → vacancies. The link is applicationLink unchanged (Himalayas' term), only
 * their vacancy page; pay in dollars per month (hourly × 160, annual / 12); expired ones are skipped.
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

/** RSS of We Work Remotely or cryptojobslist → vacancies. In WWR the title is "Company: Role". */
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
      // WWR is remote only by the platform's definition; for cryptojobslist it is by the text
      remote: site === 'wwr' || REMOTE.test(`${title} ${region} ${desc.slice(0, 800)}`),
      usd: pay,
      salaryText: usdText(pay),
      text: desc.slice(0, 4000),
    });
  }
  return out;
}
