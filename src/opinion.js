// "Bot's opinion" and a short first-person text for the digest to the bot.
// All by rules, without a model: whether to apply, why, and what to push on in the conversation.
import { themeOf, shortText, variantById, salaryById } from './letters.js';

/** What to push on in the call, by the vacancy topic (the letter is short, the projects are shown live). */
const PUSH = {
  agents: 'сделай упор на систему агентов: как они берут задачи и как проверяется результат',
  lead: 'сделай упор на процесс: роли, критерии готовности, проверки, бюджеты',
  adoption: 'сделай упор на контроль у людей: где решение остаётся за человеком',
  product: 'покажи, как довёл продукт до работающей версии',
  default: 'покажи свои проекты вживую',
};

/** Whether to apply: a short verdict by score and risks. */
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
 * Signs that combining this job with others is impossible or hard.
 * the bot does not prevent combining; it only warns in the "opinion".
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

/** What from MULTI_JOB is in the vacancy text (unique, in list order). */
export function multiJobFlags(v) {
  const text = `${v.title ?? ''}\n${v.description ?? ''}\n${v.text ?? ''}`;
  return MULTI_JOB.filter((m) => m.re.test(text)).map((m) => m.why);
}

/** One or two phrases: the verdict, the main reason, what to push on; signs of a combining ban go as a warning. */
export function opinionOf(v) {
  const why = (v.why ?? []).find((w) => !/^стек:/.test(w)) || (v.why ?? [])[0] || '';
  const theme = themeOf(v);
  const reason = why ? ` — ${why}.` : '.';
  const flags = multiJobFlags(v);
  const multi = flags.length ? ` Совмещение: ⚠ ${flags.join(', ')}.` : '';
  return `${verdict(v)}${reason} На созвоне ${PUSH[theme.id] || PUSH.default}.${multi}`;
}

/** A short first-person text (up to 256 characters, the copy_text button limit): the same letter, with the title shortened. */
export function pitchOf(v) {
  // the same variant as the vacancy letter (variant tracking: whatever text went out is what gets recorded)
  return shortText(v, 256, variantById(v.letter?.variant) || null, salaryById(v.letter?.salary) || null);
}
