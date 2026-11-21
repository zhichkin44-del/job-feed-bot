// Morning digest of the bot: new items from the last day above the threshold → a letter for each → the digest file and the bot messages with buttons.
// Sends nothing: the bot messages are written to a file (`digest-<date>.tg.json`); delivery is a separate step after the owner's "yes".
import { composeLetter, checkLetter } from './letters.js';
import { safeUrl, mdCell } from './lib.js';
import { applyLinks } from './apply.js';
import { opinionOf, pitchOf } from './opinion.js';
import { briefOf } from './brief.js';

/** Short vacancy summary for the card: tasks and requirements from the employer's text (or the first phrases). */
function briefLines(v) {
  const b = briefOf(v);
  return [
    b.tasks ? `<b>Задачи:</b> ${htmlEsc(b.tasks)}` : '',
    b.needs ? `<b>Требуют:</b> ${htmlEsc(b.needs)}` : '',
    b.about ? `<b>О вакансии:</b> ${htmlEsc(b.about)}` : '',
  ];
}
import { ACCOUNTS_HINT } from './facts.js';

/** Sending modes. The default is "one button": the owner sends the application. */
export const DEFAULTS = { mode: 'one-button', threshold: 55, maxPerDay: 10, autoMaxPerDay: 5 };

/** New vacancies (not shown before) with a score not below the threshold, best first, no more than max. */
export function selectNew(vacancies, seen = {}, { threshold = DEFAULTS.threshold, max = DEFAULTS.maxPerDay } = {}) {
  return vacancies
    .filter((v) => !v.excluded && v.score >= threshold && !seen[v.id] && safeUrl(v.url))
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

/** A letter for each vacancy; letters with unverified figures are discarded (they do not get into the digest). */
export function withLetters(items) {
  const ok = [];
  const rejected = [];
  for (const v of items) {
    const letter = composeLetter(v);
    const check = checkLetter(letter.text, v.title);
    if (check.ok) ok.push({ ...v, letter });
    else rejected.push({ id: v.id, unknown: check.unknown });
  }
  return { ok, rejected };
}

export const htmlEsc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const SOURCE = { ru: 'hh.ru', kz: 'hh.kz', habr: 'Хабр Карьера', telegram: 'Telegram', himalayas: 'Himalayas' };

/**
 * Messages for the bot (the sendMessage body without chat_id): exactly two per vacancy: a card with buttons and the full letter
 * (for the "cover letter" field on hh). The card is "one touch" from the phone:
 *   "Open the vacancy"; "Copy text" (copy_text: a short first-person text, up to 256 characters);
 *   "Write @nick" if the employer gave a Telegram handle: the chat opens right away with this text;
 *   the employer's email as a line in the card (Telegram makes it clickable; the Bot API does not accept a mailto link button);
 *   a brief about the vacancy: tasks and requirements from its text; "Sent", "Skip", "Not mine".
 * The first card has one hint: where to create an account on the platform. In "auto" mode there are no send buttons.
 */
export function telegramMessages(items, { mode = DEFAULTS.mode, quota = null } = {}) {
  const out = [];
  const needsAccount = items.some((v) => ['ru', 'kz', 'habr'].includes(v.site));
  items.forEach((v, i) => {
    const url = safeUrl(v.url);
    const pk = v.pack || null; // application pack: short text, channel, slides, "Send" state
    const pitch = pk ? pk.pitch : pitchOf(v);
    const contacts = applyLinks(v, pitch);
    const emails = contacts.filter((c) => c.kind === 'email').map((c) => c.label.replace(/^Письмо на /, ''));
    const chats = contacts.filter((c) => c.kind === 'telegram' && c.full);
    const byMail = pk?.channel?.kind === 'email';
    const card = [
      `<b>${i + 1}. ${htmlEsc(v.title)}</b>`,
      `${htmlEsc(v.company)} · ${htmlEsc(v.salaryText || 'зарплата не указана')} · ${SOURCE[v.site] || ''}`,
      // instead of an opinion and "what to push": what is required, as an excerpt from the vacancy itself
      ...briefLines(v),
      pk
        ? byMail
          ? pk.send?.enabled
            ? `Письмо уйдёт: ${htmlEsc(pk.channel.to)} с ящика ассистента`
            : `Письмо подготовлю: ${htmlEsc(pk.channel.to)}. Отправка выключена — пока нет ящика ассистента`
          : `Канал: ${v.site === 'telegram' ? 'Telegram' : SOURCE[v.site] || 'площадка'} — отправляешь сам: копируешь текст и открываешь вакансию`
        : emails.length
          ? `Почта работодателя: ${emails.map(htmlEsc).join(', ')} — текст скопируйте кнопкой ниже`
          : '',
      pk
        ? `Слайды: ${pk.deck?.state === 'ready' ? (pk.deck.slides ? `${pk.deck.slides}` : 'готовы') : 'пока нет'}${quota ? ` · сегодня отправлено ${quota.today} из ${quota.cap}` : ''}`
        : '',
      // the site is not published yet (site_url is empty): the letter goes out without a link, a yellow mark, not red
      pk?.siteMissing ? '🟡 Сайт ещё не выложен — письмо без ссылки' : '',
      `Резюме: ${htmlEsc(v.letter.resume)} · полное письмо — следующим сообщением`,
      i === 0 && needsAccount ? `\n${htmlEsc(ACCOUNTS_HINT)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    /** @type {Array<Array<{ text: string, url?: string, callback_data?: string, copy_text?: { text: string } }>>} */
    let keyboard = [[{ text: 'Открыть вакансию', url }], [{ text: 'Скопировать текст', copy_text: { text: pitch } }]];
    if (byMail) {
      // one main action: "Send" means the letter is approved
      keyboard = [[{ text: '✅ Отправить', callback_data: `app:send:${v.id}`.slice(0, 64) }]];
      keyboard.push([{ text: 'Пропустить', callback_data: `job:skip:${v.id}`.slice(0, 64) }]);
    }
    for (const c of byMail ? [] : chats.slice(0, 1)) keyboard.push([{ text: c.label, url: c.url }]);
    if (mode === 'one-button' && !byMail) {
      keyboard.push([
        { text: 'Отправил', callback_data: `job:done:${v.id}`.slice(0, 64) },
        { text: 'Пропустить', callback_data: `job:skip:${v.id}`.slice(0, 64) },
        { text: 'Не моё', callback_data: `job:no:${v.id}`.slice(0, 64) },
      ]);
    }
    out.push({ parse_mode: 'HTML', text: card, disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard } });
    // the second message of the vacancy: the full letter; under the pack there is a messenger version (Telegram, LinkedIn), copied with one tap
    const messenger = pk?.messenger ? `\n\nДля мессенджера (Telegram, LinkedIn):\n<pre>${htmlEsc(pk.messenger)}</pre>` : '';
    out.push({ parse_mode: 'HTML', text: `<pre>${htmlEsc(v.letter.text)}</pre>${messenger}`, disable_web_page_preview: true });
  });
  return out;
}

/** The pack's "Send" button: "app:send:<id>" → { action: 'send', id }; someone else's → null. */
export function parseAppCallback(data) {
  const m = /^app:(send):([\w-]{1,56})$/.exec(String(data ?? ''));
  return m ? { action: m[1], id: m[2] } : null;
}

/** Parsing of a bot button press: "job:done:<id>" → { action, id }; someone else's → null. */
export function parseJobCallback(data) {
  const m = /^job:(done|skip|no):([\w-]{1,56})$/.exec(String(data ?? ''));
  return m ? { action: m[1], id: m[2] } : null;
}

/** Digest file for the owner (markdown): a table and the letters. */
export function renderDigest({ date, items, mode, rejected = [], total = 0 }) {
  const lines = [`# Подборка бота — ${date}`, ''];
  lines.push(
    `Режим: **${mode === 'auto' ? 'авто (только план, без отправки)' : 'одна кнопка'}**. Новых вакансий выше порога: ${items.length} из ${total} по профилю. Отклик отправляет только владелец.`,
    '',
  );
  if (rejected.length) lines.push(`Письма не прошли проверку цифр и в подборку не попали: ${rejected.length}.`, '');
  lines.push('| # | Оценка | Вакансия | Компания | Зарплата | Источник | Резюме |', '|---|---|---|---|---|---|---|');
  items.forEach((v, i) => {
    const url = safeUrl(v.url);
    lines.push(
      `| ${i + 1} | ${v.score} | [${mdCell(v.title, 90)}](${url}) | ${mdCell(v.company, 40)} | ${mdCell(v.salaryText || '—', 40)} | ${SOURCE[v.site] || ''} | ${v.letter.resume} |`,
    );
  });
  items.forEach((v, i) => {
    lines.push('', `## ${i + 1}. ${mdCell(v.title, 120)}`, '', `${url(v)} · почему: ${mdCell((v.why ?? []).join('; '), 300)}`);
    lines.push(`Мнение бота: ${mdCell(opinionOf(v), 300)}`);
    if ((v.risks ?? []).length) lines.push(`Риски: ${mdCell(v.risks.join('; '), 300)}`);
    lines.push(
      '',
      'Короткий текст (копируется кнопкой в боте):',
      '',
      '```',
      pitchOf(v),
      '```',
      '',
      'Полное письмо:',
      '',
      '```',
      v.letter.text,
      '```',
    );
  });
  lines.push('');
  return lines.join('\n');
}

const url = (v) => safeUrl(v.url) || '(ссылка не прошла проверку)';
