// ШАБЛОН ПРОФИЛЯ КАНДИДАТА. Замените значения на свои проверенные факты.
//
// Правило: письмо собирается только из фраз этого файла и названия вакансии. Цифра, которой нет в этих фразах,
// не проходит проверку checkLetter() (src/letters.js) — так модель или шаблон не могут «придумать» опыт.
// Новую цифру добавляет человек, сверив её с источником. Здесь цифр нет намеренно.

/** Сайт или портфолио кандидата: ссылка попадает в каждое письмо. Адрес можно задать переменной JOB_BOT_SITE. */
export const SITE = (process.env.JOB_BOT_SITE || 'https://example.com').replace(/\/+$/, '');
export const SITE_EN = `${SITE}/en/`;
export const SIGNATURE = '[Имя Фамилия] · Telegram: [Telegram] · [почта]';
export const SIGNATURE_EN = '[Name Surname] · Telegram: [Telegram] · [email]';

/** Подсказка в первой карточке подборки: где один раз завести аккаунт на площадках. */
export const ACCOUNTS_HINT =
  'Чтобы откликаться на hh.ru и Хабр Карьере, нужен аккаунт: hh.ru → «Войти» → «Зарегистрироваться»; career.habr.com → «Войти». Один раз.';

/** Проекты кандидата: одна-две фразы и ссылка на страницу проекта. Только проверенные факты. */
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

/** Как кандидат работает — одна проверенная фраза. */
export const HOW = '[Как вы работаете: например, кто что делает в проекте и за что отвечаете.]';
export const HOW_EN = '[How you work: who does what in a project and what you are responsible for.]';

/** Язык общения (для английских вакансий): честная формулировка без выдумок про уровень. */
export const LANG_EN = '[How you communicate in English: in writing, on calls, with a translator.]';

/** Короткий текст от первого лица для кнопки «Скопировать текст» (не длиннее 256 знаков — предел copy_text Telegram). */
export const PITCH_EN = {
  head: 'Hi! About your «{title}» role.',
  body: 'I build with AI. Portfolio: {site}',
  max: 256,
};

/** Темы вакансий → первая фраза письма и какие проекты показать. Порядок важен: первая совпавшая. */
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

/** Версия шаблона: письмо со старой версией пересобирается перед подборкой. */
export const LETTER_VERSION = 1;

/** Короткое письмо: приветствие → одна фраза под вакансию → ссылка на проекты → условия. */
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
 * Варианты писем. Места подстановки: {title} {hook} {site} {salary}. Это стартовый набор, его можно менять и
 * дополнять: проверка писем читает цифры из шаблонов и сумм.
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

/** Суммы в письмах — отдельная переменная; пустой список = сумма из варианта. */
export const SEED_SALARIES = [];

/** Строк в письме (непустых): 2–4. */
export const LETTER_LINES = { min: 2, max: 4 };

/** Чего не бывает в письме: самовосхваление. Дополните список своими запретными формулировками. */
export const BANNED = /(опытн|многолетн|эксперт|профессионал|experienced|years of experience|expert|seasoned|passionate)/i;
