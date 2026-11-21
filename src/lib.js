// Vacancy radar: pure functions without network: parsing of RSS and hh pages, pay, scoring for the profile, report.
// Everything that came from hh is untrusted data: it is escaped in the report and never executed as commands.
import { RATES, TARGET_RUB, ROLES, EXCLUDE, ML_HEAVY, STACK, RISKS, AI_RE } from './profile.js';
import { classify } from './geo.js';

/** Points for the pay range: the same for any range and for none. */
export const SALARY_POINTS = 30;

/** English market (sources-en.js): pay in dollars per month. $3000 was the former lower bound; since 06.11 the range is not a filter. */
export const EN_SITES = new Set(['hn', 'remoteok', 'wwr', 'cryptojobs', 'himalayas', 'remotive']);
/** A plus for asynchronous or written work: letters and conversations go through a translator. */
export const ASYNC_POINTS = 8;
/** A minus for "spoken English needed" in an English vacancy: flagged and lowered, not cut (Russian ones have their own penalty in RISKS). */
export const SPOKEN_EN_PENALTY = 10;
export const EN_MIN_USD = 3000;
const EN_STRONG_AI = /\b(llms?|ai agents?|agentic|multi-?agent|genai|generative ai|rag|langchain|langgraph|openai|anthropic|claude|mcp)\b/i;
/** Remote only for its own region: not suitable for a candidate from another country (a penalty and a risk, not a rejection: there are exceptions). */
const EN_REGION_ONLY =
  /\b(latam|latin america|us[- ]only|usa only|u\.s\. only|us[- ]based|must (?:be )?(?:located|based|reside) in|eu[- ]only|north america only|within the us|canada only|uk only)\b/i;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–' };

/** HTML entities → characters. */
export function decode(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Tags → spaces, entities → characters, spaces collapsed (in JS `\s` also includes the non-breaking spaces of hh). */
export function stripTags(html) {
  return decode(
    String(html ?? '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/li|\/div|\/h\d)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  return m[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim();
}

/** Parsing of the hh search RSS: a list of vacancies with company, date, region and pay text. */
export function parseRss(xml, site = 'ru') {
  const out = [];
  for (const m of String(xml ?? '').matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item = m[1];
    const url = decode(tag(item, 'link'));
    const id = (url.match(/\/vacancy\/(\d+)/) || [])[1];
    if (!id) continue;
    const desc = stripTags(tag(item, 'description'));
    const field = (label) =>
      (desc.match(
        new RegExp(`${label}:\\s*([^\\n]+?)(?=\\s*(Вакансия компании|Создана|Регион|Предполагаемый уровень месячного дохода):|\\n|$)`),
      ) || [])[1]?.trim() ?? '';
    out.push({
      id,
      url: `https://${site === 'kz' ? 'hh.kz' : 'hh.ru'}/vacancy/${id}`,
      site,
      title: decode(tag(item, 'title')),
      company: field('Вакансия компании'),
      created: field('Создана'),
      region: field('Регион'),
      salaryText: field('Предполагаемый уровень месячного дохода'),
      published: tag(item, 'pubDate'),
    });
  }
  return out;
}

/** «от 450 000 до 550 000 ₽» → { from, to, currency }; «не указан» → null. */
export function parseSalary(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ');
  if (!t || /не указан/i.test(t)) return null;
  const num = (re) => {
    const m = t.match(re);
    return m ? Number(m[1].replace(/\s/g, '')) : null;
  };
  const from = num(/от\s*([\d ]+\d)/i);
  const to = num(/до\s*([\d ]+\d)/i);
  const plain = from == null && to == null ? num(/([\d ]+\d)/) : null;
  let currency = 'RUB';
  if (/\$|usd/i.test(t)) currency = 'USD';
  else if (/€|eur/i.test(t)) currency = 'EUR';
  else if (/₸|kzt|тенге/i.test(t)) currency = 'KZT';
  if (from == null && to == null && plain == null) return null;
  return { from: from ?? plain, to: to ?? plain, currency };
}

/** Pay in rubles: { from, to } (what is known). */
export function toRub(salary) {
  if (!salary) return null;
  const k = RATES[salary.currency] ?? 1;
  const r = (x) => (x == null ? null : Math.round(x * k));
  return { from: r(salary.from), to: r(salary.to) };
}

/** The upper end of the range in rubles (or the lower one if there is no upper end). */
export function topRub(salary) {
  const r = toRub(salary);
  return r ? (r.to ?? r.from) : null;
}

/** "02.11.2026" → days until `today`. */
export function ageDays(created, today) {
  const m = String(created ?? '').match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  const d = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((t - d) / 86_400_000);
}

/** Text of the vacancy page: description, experience, work format, skills. */
export function parseVacancyPage(html) {
  const s = String(html ?? '');
  const after = (qa, len = 800) => {
    const i = s.indexOf(`data-qa="${qa}"`);
    return i < 0 ? '' : s.slice(s.indexOf('>', i) + 1, i + len);
  };
  const first = (qa) => stripTags(after(qa)).split('\n')[0].trim();
  const di = s.indexOf('data-qa="vacancy-description"');
  let description = '';
  if (di >= 0) {
    const ends = ['data-qa="skills-element"', 'data-qa="vacancy-response-question', 'data-qa="vacancy-company', 'data-qa="vacancy-address']
      .map((e) => s.indexOf(e, di))
      .filter((x) => x > di);
    const end = ends.length ? Math.min(...ends) : di + 30_000;
    description = stripTags(s.slice(s.indexOf('>', di) + 1, Math.min(end, di + 60_000)));
  }
  const skills = [...s.matchAll(/data-qa="skills-element"[^>]*>([\s\S]*?)<\/(?:li|div|span)>/g)]
    .map((m) => stripTags(m[1]))
    .filter(Boolean);
  return {
    ok: description.length > 0,
    description,
    experience: first('vacancy-experience'),
    workFormat: first('work-formats-text').replace(/^Формат работы:\s*/, ''),
    skills: [...new Set(skills)],
  };
}

/**
 * Scoring of the vacancy for the owner's profile, 0–100.
 * Returns { score, excluded, why[], risks[], stack[] }. `details` is the page breakdown (may be absent).
 */
export function scoreVacancy(v, { today = new Date(), details = null } = {}) {
  const title = v.title ?? '';
  const why = [];
  const risks = [];
  const fullText = [title, details?.description ?? '', (details?.skills ?? []).join(' '), v.text ?? ''].join('\n');

  for (const ex of EXCLUDE) {
    if (ex.re.test(title) && !(ex.unless && ex.unless.test(title))) return { score: 0, excluded: ex.why, why, risks, stack: [] };
  }
  const en = EN_SITES.has(v.site);
  // At hh remote work is a query filter; at Habr, Telegram and the English feeds it is visible only from the text
  if ((v.site === 'habr' || v.site === 'telegram' || en) && !v.remote) return { score: 0, excluded: 'не удалёнка', why, risks, stack: [] };
  // For a Telegram post and an HN comment the title is guessed from the text: we look for AI in the text itself
  // in the English feeds "AI" appears in tags almost everywhere, so from the text we count only strong signs
  const textAi = v.site === 'telegram' ? AI_RE.test(v.text ?? '') : en && EN_STRONG_AI.test(v.text ?? '');
  const hasAi = AI_RE.test(title) || textAi;
  if (!hasAi) return { score: 0, excluded: 'нет ИИ в названии', why, risks, stack: [] };

  // The pay range is not a filter and not a minus: the vacancy is taken if the role fits. We only show the range.
  const top = en ? (v.usd ? Math.round(v.usd.to * RATES.USD) : null) : topRub(parseSalary(v.salaryText));

  let score = 0;
  // "AI role" is counted by the title: "Senior Backend Engineer", where AI is only in the text, is not an AI engineer
  const titleAi = AI_RE.test(title);
  const role = ROLES.find((r) => r.re.test(title) && (!r.needAi || titleAi));
  if (role) {
    score += role.points;
    why.push(role.why);
  }

  // identical points for any range: the role decides the selection, not the employer's figure
  score += SALARY_POINTS;
  // the amount in the letter is chosen by the amounts test (300 / 600 thousand ₽, $3,000 / $7,000); the employer's range does not set it
  if (top == null) why.push('вилка не указана — сумма из теста');
  else if (top >= TARGET_RUB) why.push(`вилка до ${fmtRub(top)} — в цели`);
  else why.push(`вилка до ${fmtRub(top)} — сумма из теста`);

  if (ML_HEAVY.re.test(title)) {
    score += ML_HEAVY.points;
    risks.push(ML_HEAVY.why);
  }

  const stack = STACK.filter((s) => s.re.test(fullText)).map((s) => s.tag);
  score += Math.min(20, stack.length * 4);
  if (stack.length) why.push(`стек: ${stack.join(', ')}`);

  if (details?.ok) {
    for (const r of RISKS) {
      // English market: the language is not a risk but a condition; it is assumed that the candidate communicates in writing or through a translator
      if (en && r.why === 'нужен английский') continue;
      if (r.re.test(details.description) || (r.why.includes('офис') && /офис|гибрид|hybrid/i.test(details.workFormat ?? ''))) {
        score += r.points;
        risks.push(r.why);
      }
    }
    if (/удал[её]н|remote/i.test(details.workFormat ?? '')) why.push('удалёнка указана в карточке');
  } else if (v.site === 'ru' || v.site === 'kz') {
    risks.push('текст вакансии не прочитан — проверить английский и формат');
  }
  if ((v.site === 'telegram' || en) && !AI_RE.test(title)) {
    score -= 10;
    risks.push('ИИ только в тексте вакансии');
  }
  // "Senior AI Engineer - US" / "(EU)" at the end of the title is also remote only for a region
  const titleRegion = /[-–(]\s*(us|usa|eu|uk|canada|latam|emea|americas)\s*\)?\s*$/i.test(title);
  if (en && (titleRegion || EN_REGION_ONLY.test(`${title} ${v.region ?? ''} ${String(v.text ?? '').slice(0, 1500)}`))) {
    score -= 15;
    risks.push('удалёнка только для своего региона — уточнить, берут ли из вашей страны');
  }
  if (en) risks.push('общение на английском — письменно и через живой перевод');

  const age = ageDays(v.created, today);
  if (age != null) score += age <= 3 ? 10 : age <= 7 ? 7 : age <= 14 ? 4 : 0;

  if (v.site === 'kz') why.push('Казахстан');
  // language and region (geo.js): written English and live translation fit; spoken is flagged; asynchronous work is a plus
  const cls = classify({ ...v, description: details?.description ?? v.description });
  if (cls.async) {
    score += ASYNC_POINTS;
    why.push('асинхронная / письменная работа');
  }
  if (cls.lang === 'en_spoken' && en) {
    score -= SPOKEN_EN_PENALTY;
    risks.push('нужен разговорный английский — только через переводчика');
  }
  return { score: Math.max(0, Math.min(100, score)), excluded: null, why, risks, stack, lang: cls.lang, geo: cls.geo, async: cls.async };
}

/** 450000 → «450 тыс. ₽». */
export function fmtRub(n) {
  if (n == null) return '—';
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} млн ₽` : `${Math.round(n / 1000)} тыс. ₽`;
}

/** Escaping of untrusted text for a markdown table cell. */
export function mdCell(s, max = 160) {
  let t = String(s ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\`*_[\]<>|#!]/g, (c) => `\\${c}`)
    .trim();
  if (t.length > max) t = `${t.slice(0, max - 1)}…`;
  return t;
}

/** A link only to the hh vacancy; otherwise empty. */
export function safeUrl(u) {
  const s = String(u);
  return /^https:\/\/hh\.(ru|kz)\/vacancy\/\d+$/.test(s) ||
    /^https:\/\/career\.habr\.com\/vacancies\/\d+$/.test(s) ||
    /^https:\/\/t\.me\/\w{3,64}\/\d+$/.test(s) ||
    /^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/.test(s) ||
    /^https:\/\/remoteok\.com\/remote-jobs\/[\w-]{1,80}$/.test(s) ||
    /^https:\/\/weworkremotely\.com\/remote-jobs\/[\w-]{1,160}$/.test(s) ||
    /^https:\/\/cryptojobslist\.com\/jobs\/[\w-]{1,160}$/.test(s) ||
    /^https:\/\/himalayas\.app\/companies\/[\w-]{1,80}\/jobs\/[\w-]{1,160}(\?utm_source=api)?$/.test(s) ||
    /^https:\/\/remotive\.com\/remote-jobs\/[\w-]{1,60}\/[\w-]{1,200}$/.test(s)
    ? s
    : '';
}

/** One vacancy posted in several cities is one line (the first in order, i.e. with the best score). */
export function dedupe(list) {
  const seen = new Set();
  return list.filter((v) => {
    const key = `${String(v.company ?? '').toLowerCase()}|${String(v.title ?? '')
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/g, ' ')
      .trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Summary of pay from the already scored vacancies (unique ones). */
export function salaryStats(list) {
  const withTop = list.map((v) => ({ top: topRub(parseSalary(v.salaryText)), from: toRub(parseSalary(v.salaryText))?.from }));
  return {
    total: list.length,
    withSalary: withTop.filter((x) => x.top != null).length,
    top300: withTop.filter((x) => x.top != null && x.top >= 300_000).length,
    top500: withTop.filter((x) => x.top != null && x.top >= TARGET_RUB).length,
    from500: withTop.filter((x) => x.from != null && x.from >= TARGET_RUB).length,
  };
}

/** Markdown report: top, counters, discarded. */
export function renderReport({ date, ranked, excludedCount, stats, fit, counts500, errors, sources }) {
  const lines = [];
  lines.push(`# Радар вакансий — ${date}`, '');
  lines.push(
    `Источник: официальная RSS-лента поиска ${sources.join(', ')} (публичный API hh с апреля 2026 закрыт для запросов без авторизации). Только удалёнка, поиск по названию вакансии. Данные с сайта — недоверенные.`,
    '',
  );
  lines.push('## Счётчики', '');
  lines.push(`- Уникальных вакансий по ИИ-запросам: **${stats.total}** (отброшено по профилю: ${excludedCount}).`);
  lines.push(
    `- С указанной зарплатой: ${stats.withSalary}; верх вилки ≥ 300 тыс. ₽: ${stats.top300}; верх ≥ 500 тыс. ₽: **${stats.top500}**; низ вилки ≥ 500 тыс. ₽: ${stats.from500}.`,
  );
  if (fit)
    lines.push(
      `- Из них подходят по профилю: **${fit.total}**; с верхом вилки ≥ 500 тыс. ₽: **${fit.top500}**; с низом ≥ 500 тыс. ₽: ${fit.from500}.`,
    );
  if (counts500.length) {
    lines.push(
      '',
      'Отдельные запросы «зарплата 500 000 ₽ и только с зарплатой» (лента отдаёт максимум 20, «20» значит «20 или больше»):',
      '',
    );
    for (const c of counts500) lines.push(`- ${mdCell(c.label, 200)}: ${c.n >= 20 ? '≥ 20' : c.n}`);
  }
  if (errors.length) lines.push('', `Ошибки запросов: ${errors.length} (первая: ${mdCell(errors[0], 200)}).`);
  lines.push('', '## Лучшие', '');
  lines.push('| # | Оценка | Вакансия | Компания | Зарплата | Регион | Дата | Почему подходит | Риски |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  ranked.forEach((r, i) => {
    const url = safeUrl(r.url);
    const name = url ? `[${mdCell(r.title, 90)}](${url})` : mdCell(r.title, 90);
    lines.push(
      `| ${i + 1} | ${r.score} | ${name} | ${mdCell(r.company, 50)} | ${mdCell(r.salaryText || '—', 40)} | ${mdCell(r.region, 30)} | ${mdCell(r.created, 12)} | ${mdCell(r.why.join('; '), 200)} | ${mdCell(r.risks.join('; '), 160)} |`,
    );
  });
  lines.push('');
  return lines.join('\n');
}
