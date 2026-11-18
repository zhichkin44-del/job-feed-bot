// «Мнение бота» и короткий текст от первого лица для подборки в бот.
// Всё — правилами, без модели: стоит ли откликаться, почему и на что сделать упор на разговоре.
import { themeOf, shortText, variantById, salaryById } from './letters.js';

/** На что надавить на созвоне — по теме вакансии (письмо короткое, проекты показываются вживую). */
const PUSH = {
  agents: 'сделай упор на систему агентов: как они берут задачи и как проверяется результат',
  lead: 'сделай упор на процесс: роли, критерии готовности, проверки, бюджеты',
  adoption: 'сделай упор на контроль у людей: где решение остаётся за человеком',
  product: 'покажи, как довёл продукт до работающей версии',
  default: 'покажи свои проекты вживую',
};

/** Стоит ли откликаться: короткий вердикт по оценке и рискам. */
function verdict(v) {
  const risks = v.risks ?? [];
  if (risks.includes('нужен английский')) return 'Скорее нет: нужен английский';
  if (risks.some((r) => /ML-исследования/.test(r))) return 'Скорее нет: уклон в ML-исследования';
  if ((v.score ?? 0) >= 80) return 'Стоит откликнуться';
  if (risks.some((r) => /5\+ лет|диплом/.test(r))) return 'Стоит, но готовь ответ про стаж';
  if ((v.score ?? 0) >= 65) return 'Стоит попробовать';
  return 'Можно попробовать';
}

/**
 * Признаки, что совмещать эту работу с другими нельзя или трудно.
 * бот совмещению не мешает — только предупреждает в «мнении».
 */
export const MULTI_JOB = [
  {
    re: /(exclusive(?:ly)? (?:employ|commit)|no other (?:employment|jobs?)|not (?:allowed|permitted) to (?:work|hold) (?:for )?(?:another|other)|outside employment|moonlighting|запрет[а-я]* (?:на )?совмещ|совмещение (?:не допускается|запрещено)|без совмещения|только основн[а-я]* мест)/i,
    why: 'запрет совмещения',
  },
  { re: /(non-?compete|non-?solicit|неконкуренц|не конкурир|\bNDA\b|соглашени[ея] о неразглашении)/i, why: 'NDA или неконкуренция' },
  {
    re: /(core hours|must (?:be available|overlap)|overlap (?:with|of) (?:at least )?\d|\b9\s?(?:am)?\s?(?:-|–|to)\s?[56]\s?pm\b|\b(?:EST|EDT|PST|PDT|CET|CEST|GMT|BST)\b[^.]{0,40}\bhours|business hours|с \d{1,2}[:.]00 до \d{1,2}[:.]00|по (?:московскому|мск)|строго по графику|обязательн[а-я]* (?:присутстви|на связи))/i,
    why: 'обязательные часы в чужом поясе',
  },
];

/** Что из MULTI_JOB есть в тексте вакансии (уникально, в порядке списка). */
export function multiJobFlags(v) {
  const text = `${v.title ?? ''}\n${v.description ?? ''}\n${v.text ?? ''}`;
  return MULTI_JOB.filter((m) => m.re.test(text)).map((m) => m.why);
}

/** Одна-две фразы: вердикт, главная причина, на что надавить; признаки запрета совмещения — предупреждением. */
export function opinionOf(v) {
  const why = (v.why ?? []).find((w) => !/^стек:/.test(w)) || (v.why ?? [])[0] || '';
  const theme = themeOf(v);
  const reason = why ? ` — ${why}.` : '.';
  const flags = multiJobFlags(v);
  const multi = flags.length ? ` Совмещение: ⚠ ${flags.join(', ')}.` : '';
  return `${verdict(v)}${reason} На созвоне ${PUSH[theme.id] || PUSH.default}.${multi}`;
}

/** Короткий текст от первого лица (≤ 256 знаков — предел кнопки copy_text): то же письмо, название укорачивается. */
export function pitchOf(v) {
  // тот же вариант, что у письма вакансии (учёт вариантов: какой текст ушёл, такой и записан)
  return shortText(v, 256, variantById(v.letter?.variant) || null, salaryById(v.letter?.salary) || null);
}
