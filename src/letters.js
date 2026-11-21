// Bot letters: 4 short lines: greeting, one phrase for the vacancy,
// "my projects" + a link to the site, "from 600k, if interested, write". Only approved phrases (facts.js) and the vacancy title.
// checkLetter() does not pass a letter with a figure that is not from the approved phrases, longer than 4 lines, without a link to the site, or with self-praise.
import {
  PROJECTS,
  HOW,
  THEMES,
  DEFAULT_THEME,
  SIGNATURE,
  PROJECTS_EN,
  HOW_EN,
  SITE,
  SITE_EN,
  PITCH_EN,
  SHORT,
  SHORT_EN,
  LETTER_VERSION,
  LETTER_LINES,
  BANNED,
  SEED_VARIANTS,
  SEED_SALARIES,
} from './facts.js';
import { EN_SITES } from './lib.js';

/** Vacancy topic by title (and by text, if there is one). */
export function themeOf(v) {
  const title = String(v.title ?? '');
  return THEMES.find((t) => t.re.test(title)) || THEMES.find((t) => t.re.test(String(v.text ?? '').slice(0, 1500))) || DEFAULT_THEME;
}

/** Which résumé to attach: the English one if the vacancy requires English. */
export function resumeFor(v, theme = themeOf(v)) {
  if ((v.risks ?? []).includes('нужен английский')) return 'RESUME-EN.md';
  return theme.resume;
}

/** Vacancy title for the letter: without control characters, quotation marks and markup, no longer than 120 characters. */
export function cleanTitle(s) {
  return String(s ?? '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/[«»<>`*_[\]|#]/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Write in English: English feeds (HN, Remote OK, WWR, cryptojobslist) and a post from an English-language Telegram channel:
 * without Cyrillic in the title and at the start of the text (06.11: notificaJobs_AI_MachineLearning, remote_ai_jobs, opento_*).
 */
export function isEnglish(v) {
  if (EN_SITES.has(v.site)) return true;
  return v.site === 'telegram' && !/[а-яё]/i.test(`${v.title ?? ''} ${String(v.text ?? '').slice(0, 600)}`);
}

/**
 * Known letter variants (id → { kind, lang, template, salary }). The starter set comes from facts.js; the candidate's variants from the database
 * are registered by db.js on opening and on adding. Figures from the texts and the variant amounts are its own words; the check lets them through.
 */
const VARIANTS = new Map(SEED_VARIANTS.map((x) => [x.id, x]));
export function registerVariant(variant) {
  if (variant?.id && variant.template) VARIANTS.set(variant.id, variant);
}
export const variantById = (id) => VARIANTS.get(String(id ?? ''));
/** Default variant (without a database): the first one from the starter set for the kind and language. */
export const defaultVariant = (kind, lang) => SEED_VARIANTS.find((x) => x.kind === kind && x.lang === lang);

/** Amounts are a separate test variable (id → { lang, value }); the candidate's amounts from the database are registered by db.js. */
const SALARIES = new Map(SEED_SALARIES.map((x) => [x.id, x]));
export function registerSalary(s) {
  if (s?.id && s.value) SALARIES.set(s.id, s);
}
export const salaryById = (id) => SALARIES.get(String(id ?? ''));

/** Substitute the template placeholders; {title} separately (it is shortened to fit the length). */
function fill(template, map) {
  let out = String(template);
  for (const [k, val] of Object.entries(map)) out = out.replaceAll(`{${k}}`, String(val ?? ''));
  return out;
}

/**
 * The letter for a vacancy by the variant's template, no longer than max characters: the vacancy title is shortened. The same text
 * is in the "Copy text" button (max 256: the copy_text limit in Telegram).
 */
export function shortText(v, max = SHORT.max, variant = null, salary = null) {
  const en = isEnglish(v);
  const vr = variant || defaultVariant('apply', en ? 'en' : 'ru');
  const theme = themeOf(v);
  const base = { hook: en ? theme.short_en : theme.short, site: en ? SITE_EN : `${SITE}/`, salary: salary?.value || vr.salary };
  const without = fill(vr.template, { ...base, title: '' });
  const room = max - without.length;
  let title = cleanTitle(v.title);
  if (title.length > room) title = room >= 12 ? `${title.slice(0, room - 1).trimEnd()}…` : '…';
  return fill(vr.template, { ...base, title }).slice(0, max);
}

/**
 * The letter for the vacancy: { text, theme, resume, projects, v, variant, salary }: contract L3 (+ lang for English).
 * salary: the amount id from the test (or null: the default variant's amount).
 * @returns {{ text: string, theme: string, projects: string[], v: number, variant: string, salary: string | null,
 *   resume: string, lang?: string }}
 */
export function composeLetter(v, { variant = null, salary = null } = {}) {
  const theme = themeOf(v);
  const en = isEnglish(v);
  const vr = variant || defaultVariant('apply', en ? 'en' : 'ru');
  const text = shortText(v, SHORT.max, vr, salary);
  const common = { text, theme: theme.id, projects: theme.projects, v: LETTER_VERSION, variant: vr.id, salary: salary?.id ?? null };
  if (en) return { ...common, resume: 'RESUME-EN.md', lang: 'en' };
  return { ...common, resume: resumeFor(v, theme) };
}

/** A direct letter to a company by the variant's template: {company}, {фраза}, {site}, {salary}. */
export const fillDirect = (variant, c, salary = null) =>
  fill(variant.template, {
    компания: String(c.name ?? '').trim(),
    фраза: String(c.phrase ?? '').trim(),
    site: variant.lang === 'en' ? SITE_EN : `${SITE}/`,
    salary: salary?.value || variant.salary,
    // where the address comes from: the page where the contact is published (GDPR art. 14(3)(b): say it at first contact)
    source: String(c.contact?.source_url ?? '').trim(),
  });

/** English letter (vacancies from HN, Remote OK, WWR, cryptojobslist): the same short template. */
export function composeLetterEn(v) {
  return composeLetter({ ...v, site: EN_SITES.has(v.site) ? v.site : 'wwr' });
}

/** A letter in the database was assembled with an old template: rebuild it before the digest. */
export const letterStale = (letter) => !letter || letter.v !== LETTER_VERSION;

const numbersIn = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.'));

/**
 * Letter check: figures only from the approved phrases, the vacancy title and links; 2–4 non-empty lines, no longer than
 * SHORT.max; a link to the site is present; no self-praise and no withdrawn wordings (we do not search the vacancy title).
 * Returns { ok, unknown[] } and problems[] if anything other than the figures is wrong.
 */
export function checkLetter(letterText, vacancyTitle = '', { site: needSite = true, max = SHORT.max, lines: limit = LETTER_LINES } = {}) {
  const text = String(letterText ?? '');
  const title = cleanTitle(vacancyTitle);
  const allowed = new Set([
    ...Object.values(PROJECTS).flatMap((p) => [...numbersIn(p.text), ...numbersIn(p.url)]),
    ...numbersIn(HOW),
    ...THEMES.flatMap((t) => [...numbersIn(t.hook), ...numbersIn(t.short), ...numbersIn(t.short_en)]),
    ...numbersIn(DEFAULT_THEME.hook),
    ...numbersIn(SIGNATURE),
    ...Object.values(PROJECTS_EN).flatMap((p) => [...numbersIn(p.text), ...numbersIn(p.url)]),
    ...numbersIn(HOW_EN),
    ...numbersIn(PITCH_EN.body),
    ...numbersIn(SITE_EN),
    ...[SHORT, SHORT_EN].flatMap((S) => [...numbersIn(S.projects), ...numbersIn(S.close)]),
    ...[...VARIANTS.values()].flatMap((x) => [...numbersIn(x.template), ...numbersIn(x.salary)]),
    ...[...SALARIES.values()].flatMap((x) => numbersIn(x.value)),
    ...numbersIn(title),
  ]);
  const unknown = [...new Set(numbersIn(text).filter((n) => !allowed.has(n)))];
  const problems = [];
  const lines = text.split('\n').filter((l) => l.trim()).length;
  if (lines < limit.min || lines > limit.max) problems.push(`строк ${lines}, нужно ${limit.min}–${limit.max}`);
  if (text.length > max) problems.push(`длиннее ${max} знаков`);
  if (needSite && !text.includes(SITE)) problems.push('нет ссылки на сайт');
  const own = title ? text.split(title).join(' ') : text;
  const bad = BANNED.exec(own);
  if (bad) problems.push(`лишнее: «${bad[0]}»`);
  const ok = unknown.length === 0 && problems.length === 0;
  return problems.length ? { ok, unknown, problems } : { ok, unknown };
}
