// Краткое описание вакансии для карточки бота: что делать и что требуют — из текста самой вакансии,
// без мнения бота и советов «на что надавить». Только выдержки из текста работодателя, ничего не придумывается.

const TASK_RE =
  /^(обязанности|задачи|основные задачи|чем (предстоит|будешь|будете|нужно) занима\S*|что (предстоит |нужно |надо )?делать|что ты будешь делать|responsibilities|what you('|’)ll (do|be doing)|your role|in this role|the role)(?=$|[\s:：,.;!—-])/i;
const NEED_RE =
  /^(требования|что (мы )?ждём( от тебя| от вас)?|мы ждём|ожидаем|ожидания|нам важно|что нужно|кого (мы )?ищем|ты нам подходишь|наш кандидат|requirements|qualifications|what you('|’)ll need|you have|must[- ]haves?|about you|who you are|what we('|’)re looking for)(?=$|[\s:：,.;!—-])/i;
const OTHER_RE =
  /^(условия|мы предлагаем|что мы предлагаем|предлагаем|о компании|о нас|будет плюсом|плюсом будет|плюсом|бонусы|about us|benefits|what we offer|we offer|perks|nice to have|bonus points)(?=$|[\s:：,.;!—-])/i;
// \b в JS — только латиница, поэтому граница слова после кириллицы задаётся явно

const MAX = 220;

/** Обрезка по границе слова с многоточием. */
export function clip(s, max = MAX) {
  const t = String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.—-]+$/, '')}…`;
}

const bullet = (s) => s.replace(/^[\s\-–—•·*●▪◦✓✔>]+/, '').trim();

/**
 * { tasks, needs, about } — строки ≤ 220 знаков; пустая строка, если раздела нет.
 * about — первые фразы текста, только когда не нашлось ни задач, ни требований.
 */
export function briefOf(v) {
  const text = String(v?.description || v?.text || '');
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const got = { tasks: [], needs: [] };
  let mode = null;
  for (const raw of lines) {
    const line = bullet(raw);
    const head = line.replace(/[:：]\s*$/, '');
    const [key, rest] = TASK_RE.test(head)
      ? ['tasks', head.replace(TASK_RE, '')]
      : NEED_RE.test(head)
        ? ['needs', head.replace(NEED_RE, '')]
        : [null, ''];
    if (key) {
      mode = key;
      // «Требования: Python, LLM» — содержимое после двоеточия; «Требования к кандидату» — просто заголовок
      const colon = rest.search(/[:：]/);
      const inline = colon >= 0 ? rest.slice(colon + 1).trim() : '';
      if (inline.length > 10) got[key].push(inline);
      continue;
    }
    if (OTHER_RE.test(head) && line.length <= 60) {
      mode = null;
      continue;
    }
    if (mode && line.length > 3) got[mode].push(line.replace(/[;.]\s*$/, ''));
  }
  const join = (arr) => clip(arr.slice(0, 6).join('; '));
  const tasks = join(got.tasks);
  const needs = join(got.needs);
  const about = tasks || needs ? '' : clip(lines.map(bullet).join(' '), 240);
  return { tasks, needs, about };
}
