// PROFILE EXAMPLE for the vacancy radar: which queries to set and how to score findings. Replace it with your own.
// Changed here, without editing the logic. All words are checked against the vacancy title and (if downloaded) its text.

/** Rates for conversion to rubles: the NBK cross-rate of 30.10.2026 (1 $ ≈ 454 ₸ ≈ 81 ₽), euro approximate. */
export const RATES = { RUB: 1, USD: 81, EUR: 88, KZT: 81 / 454 };

/** Lower bound: vacancies whose upper pay limit is below it are discarded. Without pay they stay. */
export const MIN_RUB = 100_000;
/** Desired amount (for scoring). */
export const TARGET_RUB = 250_000;

/** Where to search. The hh RSS returns no more than 20 latest vacancies per query, so there are many queries and they are narrow. */
export const SITES = [
  { id: 'ru', host: 'hh.ru', area: '113', label: 'Россия' },
  { id: 'kz', host: 'hh.kz', area: '40', label: 'Казахстан' },
  { id: 'any', host: 'hh.ru', area: '', label: 'все регионы' },
];

/** Queries by vacancy title (hh query language: OR, AND, quotes, brackets, *). */
export const QUERIES = [
  '(руководитель OR head OR lead OR лид OR директор OR CAIO) AND (ИИ OR AI OR LLM OR GenAI OR "искусственного интеллекта")',
  '"head of AI" OR "AI lead" OR "руководитель ИИ" OR "руководитель AI" OR "AI director"',
  '(агент OR агентов OR agent OR agents OR agentic) AND (ИИ OR AI OR LLM)',
  '"AI engineer" OR "AI-инженер" OR "ИИ-инженер" OR "AI инженер" OR "LLM engineer" OR "GenAI engineer"',
  '(разработчик OR developer) AND (ИИ OR AI OR LLM OR GenAI)',
  'LLM OR GenAI OR RAG',
  '(внедрение OR внедрению OR интегратор OR integrator) AND (ИИ OR AI OR нейросет*)',
  '(автоматизация OR автоматизации OR automation) AND (ИИ OR AI OR LLM)',
  '"AI product" OR "AI продакт" OR "AI-продакт" OR "продакт ИИ" OR (product AND (AI OR LLM))',
  '"AI architect" OR "архитектор ИИ" OR "AI-архитектор" OR (архитектор AND (AI OR LLM))',
  'Claude OR MCP OR "prompt engineer" OR промпт*',
  // development with AI coding
  '"вайб-кодинг" OR "вайбкодинг" OR "vibe coding" OR "vibe-coding" OR Cursor OR "Claude Code" OR "AI-assisted"',
  'ИИ OR AI OR нейросет*',
];

// In JS `\b` knows only Latin, so word boundaries for Cyrillic go through lookbehind/lookahead.
const L = '(?<![a-zа-яё0-9])';
const R = '(?![a-zа-яё0-9])';

/** Whether the title itself is about AI. */
// "Agent" by itself is not AI (real-estate agents), so only "agentic systems", agentic, multi-agent.
export const AI_RE = new RegExp(
  `${L}(ai|ии|llm|genai|gpt|ml)${R}|нейросет|искусственн|агентн|agentic|мультиагент|multi-?agent|claude|prompt|промпт`,
  'i',
);

/** An engineering word in the title: removes part of the exclusions ("AI engineer: Marketing OS" is not marketing). */
const BUILDER = /(engineer|инженер|developer|разработчик|архитект|architect)/i;

/** Role: the first match by title gives points (0–40). `needAi`: only if the title contains AI. */
export const ROLES = [
  {
    re: new RegExp(`(руковод|head|${L}lead|${L}лид${R}|директор|director|chief|${L}caio${R}|${L}cto${R})`, 'i'),
    needAi: true,
    points: 34,
    why: 'руководящая ИИ-роль',
  },
  { re: /(агент|agent)/i, needAi: true, points: 38, why: 'ИИ-агенты — целевая роль' },
  { re: /(архитект|architect)/i, needAi: true, points: 34, why: 'архитектура ИИ-систем' },
  { re: /(внедр|интегратор|integrat|automation|автоматиз)/i, needAi: true, points: 33, why: 'внедрение ИИ в бизнес' },
  { re: BUILDER, needAi: true, points: 40, why: 'разработка на LLM' },
  { re: /(product|продакт|продукт)/i, needAi: true, points: 30, why: 'AI product' },
  { re: /(llm|genai|rag|claude|mcp|prompt|промпт)/i, points: 26, why: 'работа с LLM' },
  { re: AI_RE, points: 15, why: 'ИИ в названии' },
];

/** What is definitely not for him: such vacancies are discarded. `unless`: when the exception does not apply. */
export const EXCLUDE = [
  {
    re: /(продаж|sales|account manager|аккаунт-менеджер|bdm|business development|привлечени[а-я]* клиент|лидоген|lead gen|недвижимост|риел?тор|партн[её]р-агент|b2b-партн|амбассадор|ambassador|страхов)/i,
    why: 'продажи',
  },
  { re: new RegExp(`(поддержк|support|оператор|operator|${L}call${R}|колл-центр)`, 'i'), unless: BUILDER, why: 'поддержка / оператор' },
  {
    re: /(тренер|trainer|разметк|annotat|асессор|assessor|labeler|tutor|репетитор|оценщик|evaluator|rater)/i,
    why: 'разметка / ручное обучение моделей',
  },
  // a prompt-role without development in the title is not taken
  // "prompt engineer" is not development, so only developer / architect lifts the exception, not "engineer"
  { re: /(prompt|промпт)/i, unless: /(developer|разработчик|программист|архитект|architect)/i, why: 'промпты без разработки' },
  { re: /(преподават|учител|teacher|наставник|ментор|mentor|куратор|методист|автор курс)/i, why: 'преподавание' },
  {
    re: /(копирайт|copywrit|smm|контент|content|дизайнер|designer|иллюстратор|художник|арт-директор|art director|сценарист|scriptwriter|редактор|editor|журналист|видеомонтаж|монтаж|motion|креатор|creator|маркетолог|marketing|seo|таргет|генерац)/i,
    unless: BUILDER,
    why: 'контент / дизайн / маркетинг',
  },
  {
    // junior/младший now taken (from 100k); internships and "без опыта" are not
    re: /(стаж[её]р|intern|начинающ|без опыта|ассистент руковод|personal assistant|помощник|new grads?|graduate|entry[- ]level)/i,
    why: 'начальный уровень',
  },
  { re: new RegExp(`(${L}1[сc]${R}|бухгалт|юрист|lawyer|${L}hr${R}|рекрутер|recruit|тестировщик|${L}qa${R})`, 'i'), why: 'не ИИ-роль' },
];

/** A strong tilt toward ML research: lowered, not discarded (hybrid roles exist). */
export const ML_HEAVY = {
  re: /(data scien|дата.?саентист|ml.?engineer|ml.?инженер|ml.?разработчик|machine learning|машинн[а-я]* обучен|computer vision|компьютерн[а-я]* зрен|\bcv\b|nlp|research|исследовател|mlops|deep learning|pytorch|аналитик данных|data analyst|data engineer|speech|asr|tts)/i,
  points: -25,
  why: 'уклон в ML-исследования / данные',
};

/** His stack: each match +4, no more than 20. */
export const STACK = [
  { re: /claude/i, tag: 'Claude' },
  { re: /\bmcp\b|model context protocol/i, tag: 'MCP' },
  { re: /(агент|agent)/i, tag: 'агенты' },
  { re: /\bn8n\b/i, tag: 'n8n' },
  { re: /node\.?js|\bnode\b/i, tag: 'Node.js' },
  { re: /typescript|\bts\b/i, tag: 'TypeScript' },
  { re: /\bllm\b/i, tag: 'LLM' },
  { re: /\brag\b/i, tag: 'RAG' },
  { re: /(prompt|промпт)/i, tag: 'промпты' },
  { re: /(openrouter|deepseek|gemini|openai|gpt)/i, tag: 'модели' },
  { re: /(cursor|codex|copilot|vibe.?cod|вайб.?код)/i, tag: 'ИИ-кодинг' },
  { re: /(telegram|телеграм)/i, tag: 'Telegram' },
];

/** Risks from the vacancy text (if downloaded). */
export const RISKS = [
  {
    re: /(английск[а-я]*\s*(язык[а-я]*)?\s*(—|-|:)?\s*(не ниже|от|уровн[яе])?\s*(b2|c1|c2|upper|advanced|свободн|разговорн|fluent))|(english[^.]{0,40}(b2|c1|c2|upper|advanced|fluent))|(fluent english)|(свободн[а-я]* английск)|(разговорн[а-я]* английск)/i,
    points: -25,
    why: 'нужен английский',
  },
  { re: /(офис|гибрид|hybrid|on-?site)/i, points: -5, why: 'упомянут офис / гибрид — уточнить удалёнку' },
  { re: /(высшее (техническое )?образование обязательно|диплом обязателен|phd|кандидат наук)/i, points: -5, why: 'требуют диплом' },
  { re: /(python)/i, points: -3, why: 'Python в требованиях' },
  { re: /(от|более|не менее)\s*(5|6|7|8|10)\+?\s*(лет|years)/i, points: -5, why: 'просят 5+ лет стажа' },
];
