// CANDIDATE PROFILE TEMPLATE. Replace the values with your own verified facts.
//
// Rule: a letter is assembled only from the phrases of this file and the vacancy title. A figure that is not in these phrases
// does not pass checkLetter() (src/letters.js), so neither the model nor a template can "invent" experience.
// A person adds a new figure after checking it against the source. There are no figures here on purpose.

/** The candidate's site or portfolio: the link goes into every letter. The address can be set with the JOB_BOT_SITE variable. */
export const SITE = (process.env.JOB_BOT_SITE || 'https://example.com').replace(/\/+$/, '');
export const SITE_EN = `${SITE}/en/`;
export const SIGNATURE = '[Имя Фамилия] · Telegram: [Telegram] · [почта]';
export const SIGNATURE_EN = '[Name Surname] · Telegram: [Telegram] · [email]';

/** A hint in the first card of the digest: where to create an account on the platforms, once. */
export const ACCOUNTS_HINT =
  'Чтобы откликаться на hh.ru и Хабр Карьере, нужен аккаунт: hh.ru → «Войти» → «Зарегистрироваться»; career.habr.com → «Войти». Один раз.';

/** The candidate's projects: one or two phrases and a link to the project page. Only verified facts. */
export const PROJECTS = {
  agents: {
    name: '[Проект про ИИ-агентов]',
    url: `${SITE}/projects/agents/`,
    text: '[Одна-две фразы о проекте с ИИ-агентами: что делает и чем закончилось. Цифры — только проверенные.]',
  },
  bots: {
    name: '[Проект про Telegram-ботов]',
    url: `${SITE}/projects/bots/`,
    text: '[Одна-две фразы о боте или интеграции: что делает и для кого.]',
  },
};

export const PROJECTS_EN = {
  agents: { name: '[AI agents project]', url: `${SITE_EN}projects/agents/`, text: '[One or two sentences about the project. Verified facts only.]' },
  bots: { name: '[Telegram bot project]', url: `${SITE_EN}projects/bots/`, text: '[One or two sentences about the bot or integration.]' },
};

/** How the candidate works: one verified phrase. */
export const HOW = '[Как вы работаете: например, кто что делает в проекте и за что отвечаете.]';
export const HOW_EN = '[How you work: who does what in a project and what you are responsible for.]';

/** Language of communication (for English vacancies): an honest wording without invented claims about the level. */
export const LANG_EN = '[How you communicate in English: in writing, on calls, with a translator.]';

/** A short first-person text for the "Copy text" button (no longer than 256 characters: the Telegram copy_text limit). */
export const PITCH_EN = {
  head: 'Hi! About your «{title}» role.',
  body: 'I build with AI. Portfolio: {site}',
  max: 256,
};

/** Vacancy topics → the first phrase of the letter and which projects to show. Order matters: the first match wins. */
export const THEMES = [
  {
    id: 'agents',
    re: /(оркестр|orchestr|мультиагент|multi-?agent|agentic|агентн[а-я]* систем|ии-агент|ai-агент|ai agent|агентов)/i,
    hook: 'Занимаюсь системами на основе ИИ-агентов.',
    short: 'Занимаюсь системами на основе ИИ-агентов.',
    short_en: 'I work on systems built from AI agents.',
    projects: ['agents', 'bots'],
    resume: 'RESUME-AI-ENGINEER.md',
  },
  {
    id: 'lead',
    re: /(руковод|head|lead|лид|директор|director|chief|cto|caio|practice)/i,
    hook: 'Выстраиваю ИИ-направление как процесс: роли, критерии готовности, проверки.',
    short: 'Выстраиваю ИИ-направление как процесс.',
    short_en: 'I run AI work as a process.',
    projects: ['agents'],
    resume: 'RESUME-AI-LEAD.md',
  },
  {
    id: 'adoption',
    re: /(внедр|интегратор|integrat|автоматиз|automation|трансформац)/i,
    hook: 'Внедряю ИИ в рабочие процессы так, чтобы решения оставались у людей.',
    short: 'Внедряю ИИ в рабочие процессы.',
    short_en: 'I roll out AI in working processes.',
    projects: ['agents', 'bots'],
    resume: 'RESUME-AI-LEAD.md',
  },
  {
    id: 'product',
    re: /(product|продакт|продукт)/i,
    hook: 'Довожу ИИ-продукты до работающей версии.',
    short: 'Довожу ИИ-продукты до работающей версии.',
    short_en: 'I take AI products to a working version.',
    projects: ['agents', 'bots'],
    resume: 'RESUME-AI-LEAD.md',
  },
];

export const DEFAULT_THEME = {
  id: 'default',
  hook: 'Разрабатываю с ИИ; мои проекты — на сайте.',
  short: 'Разрабатываю с ИИ.',
  short_en: 'I build with AI.',
  projects: ['agents', 'bots'],
  resume: 'RESUME-AI-ENGINEER.md',
};

/** Template version: a letter with an old version is rebuilt before the digest. */
export const LETTER_VERSION = 1;

/** A short letter: greeting → one phrase for the vacancy → a link to the projects → terms. */
export const SHORT = {
  head: 'Здравствуйте! По вакансии «{title}».',
  headBare: 'Здравствуйте! По вашей вакансии.',
  projects: `Мои проекты: ${SITE}/`,
  close: 'Если интересно — пишите.',
  max: 400,
};

export const SHORT_EN = {
  head: 'Hi! About your «{title}» role.',
  headBare: 'Hi! About your role.',
  projects: `My projects: ${SITE_EN}`,
  close: "Interested? Let's talk.",
  max: 400,
};

/**
 * Letter variants. Placeholders: {title} {hook} {site} {salary}. This is a starter set; it can be changed and
 * extended: the letter check reads the figures from the templates and the amounts.
 */
export const SEED_VARIANTS = [
  {
    id: 'apply-ru-short',
    kind: 'apply',
    lang: 'ru',
    salary: '[сумма]',
    template: 'Здравствуйте! По вакансии «{title}».\n{hook}\nМои проекты: {site}\nЕсли интересно — пишите.',
  },
  {
    id: 'apply-en-short',
    kind: 'apply',
    lang: 'en',
    salary: '[amount]',
    template: "Hi! About your «{title}» role.\n{hook}\nMy projects: {site}\nInterested? Let's talk.",
  },
];

/** Amounts in the letters: a separate variable; an empty list means the amount from the variant. */
export const SEED_SALARIES = [];

/** Lines in the letter (non-empty): 2–4. */
export const LETTER_LINES = { min: 2, max: 4 };

/** What does not belong in a letter: self-praise. Extend the list with your own forbidden wordings. */
export const BANNED = /(опытн|многолетн|эксперт|профессионал|experienced|years of experience|expert|seasoned|passionate)/i;
