// Письма бота: 4 короткие строки — приветствие, одна фраза под вакансию,
// «мои проекты» + ссылка на сайт, «от 600к, если интересно — пишите». Только утверждённые фразы (facts.js) и название вакансии.
// checkLetter() не пропускает письмо с цифрой не из утверждённых фраз, длиннее 4 строк, без ссылки на сайт или с самовосхвалением.
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

/** Тема вакансии по названию (и тексту, если он есть). */
export function themeOf(v) {
  const title = String(v.title ?? '');
  return THEMES.find((t) => t.re.test(title)) || THEMES.find((t) => t.re.test(String(v.text ?? '').slice(0, 1500))) || DEFAULT_THEME;
}

/** Какое резюме прикладывать: английское — если вакансия требует английский. */
export function resumeFor(v, theme = themeOf(v)) {
  if ((v.risks ?? []).includes('нужен английский')) return 'RESUME-EN.md';
  return theme.resume;
}

/** Название вакансии для письма: без управляющих символов, кавычек-«ёлочек» и разметки, не длиннее 120 знаков. */
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
 * Писать по-английски: английские ленты (HN, Remote OK, WWR, cryptojobslist) и пост англоязычного Telegram-канала —
 * без кириллицы в названии и начале текста (06.11: notificaJobs_AI_MachineLearning, remote_ai_jobs, opento_*).
 */
export function isEnglish(v) {
  if (EN_SITES.has(v.site)) return true;
  return v.site === 'telegram' && !/[а-яё]/i.test(`${v.title ?? ''} ${String(v.text ?? '').slice(0, 600)}`);
}

/**
 * Известные варианты писем (id → { kind, lang, template, salary }). Стартовый набор — из facts.js; варианты кандидата из базы
 * регистрирует db.js при открытии и при добавлении. Цифры из текстов и сумм вариантов — его слова, проверка их пропускает.
 */
const VARIANTS = new Map(SEED_VARIANTS.map((x) => [x.id, x]));
export function registerVariant(variant) {
  if (variant?.id && variant.template) VARIANTS.set(variant.id, variant);
}
export const variantById = (id) => VARIANTS.get(String(id ?? ''));
/** Вариант по умолчанию (без базы): первый из стартового набора для вида и языка. */
export const defaultVariant = (kind, lang) => SEED_VARIANTS.find((x) => x.kind === kind && x.lang === lang);

/** Суммы — отдельная переменная теста (id → { lang, value }); суммы кандидата из базы регистрирует db.js. */
const SALARIES = new Map(SEED_SALARIES.map((x) => [x.id, x]));
export function registerSalary(s) {
  if (s?.id && s.value) SALARIES.set(s.id, s);
}
export const salaryById = (id) => SALARIES.get(String(id ?? ''));

/** Подставить места шаблона; {title} — отдельно (его укорачивают под длину). */
function fill(template, map) {
  let out = String(template);
  for (const [k, val] of Object.entries(map)) out = out.replaceAll(`{${k}}`, String(val ?? ''));
  return out;
}

/**
 * Письмо на вакансию по шаблону варианта, не длиннее max знаков: название вакансии укорачивается. Тот же текст —
 * в кнопке «Скопировать текст» (max 256, предел copy_text в Telegram).
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
 * Письмо под вакансию: { text, theme, resume, projects, v, variant, salary } — контракт L3 (+ lang у английского).
 * salary — id суммы из теста (или null — сумма варианта по умолчанию).
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

/** Прямое письмо компании по шаблону варианта: {компания}, {фраза}, {site}, {salary}. */
export const fillDirect = (variant, c, salary = null) =>
  fill(variant.template, {
    компания: String(c.name ?? '').trim(),
    фраза: String(c.phrase ?? '').trim(),
    site: variant.lang === 'en' ? SITE_EN : `${SITE}/`,
    salary: salary?.value || variant.salary,
    // откуда адрес — страница, где контакт опубликован (GDPR ст. 14(3)(b): сказать при первом контакте)
    source: String(c.contact?.source_url ?? '').trim(),
  });

/** Английское письмо (вакансии HN, Remote OK, WWR, cryptojobslist) — тот же короткий шаблон. */
export function composeLetterEn(v) {
  return composeLetter({ ...v, site: EN_SITES.has(v.site) ? v.site : 'wwr' });
}

/** Письмо в базе собрано старым шаблоном — пересобрать перед подборкой. */
export const letterStale = (letter) => !letter || letter.v !== LETTER_VERSION;

const numbersIn = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.'));

/**
 * Проверка письма: цифры — только из утверждённых фраз, названия вакансии и ссылок; 2–4 непустые строки, не длиннее
 * SHORT.max; есть ссылка на сайт; нет самовосхваления и снятых формулировок (в названии вакансии не ищем).
 * Возвращает { ok, unknown[] } и problems[], если что-то кроме цифр не так.
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
