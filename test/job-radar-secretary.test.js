// job search bot: Habr Career and Telegram as sources, letters only from approved phrases, the digest and the bot buttons.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHabrRss,
  parseTelegramPage,
  salaryFromText,
  ddmmyyyy,
  titleOf,
  TELEGRAM_CHANNELS,
  TELEGRAM_DEAD,
  lastPostAt,
  channelState,
  contactsOf,
} from '../src/sources.js';
import { composeLetter, checkLetter, themeOf, resumeFor, cleanTitle, letterStale } from '../src/letters.js';
import { LETTER_VERSION } from '../src/facts.js';
import { selectNew, withLetters, telegramMessages, parseJobCallback, renderDigest } from '../src/digest.js';
import { scoreVacancy, safeUrl } from '../src/lib.js';

const today = new Date('2026-11-05T10:00:00Z');

const habrXml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<item><title>Требуется «AI Solutions Architect (LLM, ИИ-агенты)» (Москва)</title>
<description>Компания «ООО &quot;М-ТЕХ&quot;» ищет хорошего специалиста на вакансию «AI Solutions Architect (LLM, ИИ-агенты)». От 250 000 ₽. Неполный рабочий день. Можно удалённо. Требуемые навыки: #senior, #LLM.</description>
<author>ООО "М-ТЕХ"</author><pubDate>Mon, 02 Nov 2026 15:27:14 +0300</pubDate><link>https://career.habr.com/vacancies/1000164856</link></item>
<item><title>Требуется «Офисный LLM-инженер»</title><description>Компания «X» ищет хорошего специалиста на вакансию «Офисный LLM-инженер». Полный рабочий день.</description>
<author>X</author><pubDate>Mon, 02 Nov 2026 10:00:00 +0300</pubDate><link>https://career.habr.com/vacancies/1000000001</link></item>
</channel></rss>`;

const tgHtml =
  '<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="ai_rabota/1295">' +
  '<div class="tgme_widget_message_text js-message_text" dir="auto"><a href="?q=%23remote">#удаленка</a><br/><br/><b>Альфа</b><br/>' +
  '<b>Руководитель направления ИИ-агентов</b><br/>от 400 000 до 550 000 ₽ за месяц<br/>Формат работы: удалённо<br/>Требования: опыт с LLM</div>' +
  '<div class="tgme_widget_message_footer"><time datetime="2026-11-04T10:20:08+00:00"></time></div></div></div>' +
  '<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="ai_rabota/1296">' +
  '<div class="tgme_widget_message_text js-message_text" dir="auto">Розыгрыш подписки на нейросети!</div></div></div>';

test('secretary: Habr Career, title, company, pay, remote work, date', () => {
  const list = parseHabrRss(habrXml);
  assert.equal(list.length, 2);
  assert.deepEqual(
    {
      id: list[0].id,
      url: list[0].url,
      title: list[0].title,
      company: list[0].company,
      salary: list[0].salaryText,
      remote: list[0].remote,
      created: list[0].created,
    },
    {
      id: 'habr-1000164856',
      url: 'https://career.habr.com/vacancies/1000164856',
      title: 'AI Solutions Architect (LLM, ИИ-агенты)',
      company: 'ООО "М-ТЕХ"',
      salary: 'От 250 000 ₽',
      remote: true,
      created: '02.11.2026',
    },
  );
  assert.equal(list[1].remote, false);
  assert.equal(scoreVacancy(list[1], { today }).excluded, 'не удалёнка');
});

test('secretary: Telegram, a vacancy post is parsed, the ad is skipped', () => {
  const list = parseTelegramPage(tgHtml, 'ai_rabota');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'tg-ai_rabota-1295');
  assert.equal(list[0].url, 'https://t.me/ai_rabota/1295');
  assert.equal(list[0].title, 'Руководитель направления ИИ-агентов');
  assert.equal(list[0].salaryText, 'от 400 000 до 550 000 ₽');
  assert.equal(list[0].created, '04.11.2026');
  assert.equal(list[0].remote, true);
  const s = scoreVacancy(list[0], { today });
  assert.equal(s.excluded, null);
  assert.ok(s.score >= 55, String(s.score));
});

test('P2: 23 channels: 7 + 8 new as of 06.11, none dead and no duplicates; liveness by the date of the last post', () => {
  const lower = TELEGRAM_CHANNELS.map((c) => c.toLowerCase());
  assert.equal(TELEGRAM_CHANNELS.length, 23);
  assert.equal(new Set(lower).size, 23);
  for (const c of [
    'aivacancychannel',
    'notificaJobs_AI_MachineLearning',
    'remote_ai_jobs',
    'opento_data',
    'opento_dev',
    'forchiefs',
    'habr_career',
  ])
    assert.ok(TELEGRAM_CHANNELS.includes(c), c);
  for (const dead of Object.keys(TELEGRAM_DEAD)) assert.ok(!lower.includes(dead.toLowerCase()), dead);
  assert.equal(lastPostAt(tgHtml), '2026-11-04T10:20:08.000Z');
  assert.deepEqual(channelState(tgHtml, Date.parse('2026-11-06T00:00:00Z')), { last: '2026-11-04T10:20:08.000Z', stale: false });
  assert.equal(channelState(tgHtml, Date.parse('2026-11-25T00:00:00Z')).stale, true, 'молчит больше 14 дней');
  assert.deepEqual(channelState('<html></html>'), { last: null, stale: true });
  // a channel handle in a post is not the employer's contact; case does not matter
  assert.deepEqual(contactsOf('Подписывайтесь @notificajobs_ai_machinelearning, пишите @hr_alpha').telegram, ['hr_alpha']);
});

test('P2: a post from an English-language channel: the vacancy is parsed, the letter is in English', () => {
  const html =
    '<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="remote_ai_jobs/77">' +
    '<div class="tgme_widget_message_text" dir="auto">AI Engineer (LLM agents)<br/>We are looking for an engineer. Remote.<br/>Apply: @hr_beta</div>' +
    '<div class="tgme_widget_message_footer"><time datetime="2026-11-05T08:00:00+00:00"></time></div></div></div>';
  const [p] = parseTelegramPage(html, 'remote_ai_jobs');
  assert.equal(p.title, 'AI Engineer (LLM agents)');
  assert.equal(p.remote, true);
  const l = composeLetter(p);
  assert.equal(l.lang, 'en');
  assert.match(l.text, /^Hi! About your «AI Engineer \(LLM agents\)» role\./);
  assert.ok(!/[а-яё]/i.test(l.text));
  assert.equal(composeLetter(parseTelegramPage(tgHtml, 'ai_rabota')[0]).lang, undefined, 'русский пост — русское письмо');
});

test('secretary: the post title is "Должность: …", without emoji and label lines', () => {
  assert.equal(titleOf('🏢 Место работы: OOO Ромашка\n💻 AI-инженер · Middle\nФормат: удалённо'), 'AI-инженер · Middle');
  assert.equal(titleOf('#вакансия\nДолжность: Руководитель ИИ-направления\nЗарплата: 500к'), 'Руководитель ИИ-направления');
});

test('secretary: pay from the text and the date', () => {
  assert.equal(salaryFromText('Вилка $5 000–7 000 в месяц'), 'от 5 000 до 7 000 $');
  assert.equal(salaryFromText('до 300 000 руб.'), 'до 300 000 ₽');
  assert.equal(salaryFromText('без цифр'), 'не указан');
  assert.equal(ddmmyyyy('Mon, 02 Nov 2026 15:27:14 +0300'), '02.11.2026');
});

test('secretary: links are only hh, Habr Career and Telegram posts', () => {
  assert.ok(safeUrl('https://career.habr.com/vacancies/1'));
  assert.ok(safeUrl('https://t.me/ai_rabota/1295'));
  assert.equal(safeUrl('https://t.me/ai_rabota/1295?x=javascript:'), '');
  assert.equal(safeUrl('https://career.habr.com.evil.io/vacancies/1'), '');
});

test('secretary: letter of 4 lines: greeting, a phrase for the vacancy, projects with a link, "write"', () => {
  const v = { id: '1', title: 'Tech Lead платформы ИИ-агентов', risks: [] };
  assert.equal(themeOf(v).id, 'agents');
  const l = composeLetter(v);
  assert.deepEqual(l.text.split('\n'), [
    'Здравствуйте! По вакансии «Tech Lead платформы ИИ-агентов».',
    'Занимаюсь системами на основе ИИ-агентов.',
    'Мои проекты: https://example.com/',
    'Если интересно — пишите.',
  ]);
  assert.equal(l.resume, 'RESUME-AI-ENGINEER.md');
  assert.equal(l.v, LETTER_VERSION);
  assert.deepEqual(checkLetter(l.text, v.title), { ok: true, unknown: [] });
  assert.deepEqual(checkLetter(`${l.text} 12 агентов, 252 задачи`, v.title), { ok: false, unknown: ['12', '252'] });
  // each topic has its own phrase for the vacancy, and the letter passes the check
  const titles = ['Head of AI', 'Мультиагентная платформа', 'Внедрение ИИ', 'AI Product Manager', 'Инженер'];
  const hooks = new Set(titles.map((t) => composeLetter({ title: t }).text.split('\n')[1]));
  assert.equal(hooks.size, titles.length);
  for (const t of titles) assert.deepEqual(checkLetter(composeLetter({ title: t }).text, t), { ok: true, unknown: [] }, t);
  assert.equal(composeLetter({ title: 'Head of AI' }).resume, 'RESUME-AI-LEAD.md');
  assert.equal(resumeFor({ title: 'AI Engineer', risks: ['нужен английский'] }), 'RESUME-EN.md');
});

test('secretary: the vacancy title in the letter is cleaned of markup and links', () => {
  assert.equal(cleanTitle('AI <b>lead</b> `x` https://evil.io «Q»'), 'AI b lead /b x Q');
});

test('secretary: digest contains only new items above the threshold, letters, bot buttons; presses are parsed', () => {
  const list = [
    {
      id: '1',
      url: 'https://hh.ru/vacancy/1',
      title: 'Руководитель ИИ-направления',
      company: 'A',
      salaryText: 'до 600 000 ₽',
      site: 'ru',
      score: 90,
      excluded: null,
      why: ['x'],
      risks: [],
    },
    {
      id: '2',
      url: 'https://hh.ru/vacancy/2',
      title: 'AI Engineer',
      company: 'B',
      salaryText: 'не указан',
      site: 'ru',
      score: 50,
      excluded: null,
      why: [],
      risks: [],
    },
    {
      id: '3',
      url: 'https://hh.ru/vacancy/3',
      title: 'LLM Engineer',
      company: 'C',
      salaryText: 'не указан',
      site: 'ru',
      score: 70,
      excluded: null,
      why: [],
      risks: [],
    },
  ];
  const picked = selectNew(list, { 3: { status: 'shown' } }, { threshold: 55, max: 10 });
  assert.deepEqual(
    picked.map((v) => v.id),
    ['1'],
  );
  const { ok, rejected } = withLetters(picked);
  assert.equal(ok.length, 1);
  assert.equal(rejected.length, 0);
  const msgs = telegramMessages(ok);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].reply_markup.inline_keyboard[0][0].url, 'https://hh.ru/vacancy/1');
  assert.deepEqual(
    msgs[0].reply_markup.inline_keyboard.at(-1).map((b) => b.callback_data),
    ['job:done:1', 'job:skip:1', 'job:no:1'],
  );
  assert.match(msgs[1].text, /^<pre>Здравствуйте!/);
  // "auto": no status buttons; "Open the vacancy" and "Copy text" remain
  assert.equal(telegramMessages(ok, { mode: 'auto' })[0].reply_markup.inline_keyboard.length, 2);
  assert.deepEqual(parseJobCallback('job:no:tg-ai_rabota-1295'), { action: 'no', id: 'tg-ai_rabota-1295' });
  assert.equal(parseJobCallback('imp:123'), null);
  assert.match(renderDigest({ date: '2026-11-05', items: ok, mode: 'one-button', total: 3 }), /одна кнопка/);
});

test('secretary: HTML in the vacancy title is escaped in the bot message', () => {
  const v = {
    id: '9',
    url: 'https://hh.ru/vacancy/9',
    title: 'AI <script>x</script> lead',
    company: 'A&B',
    salaryText: '',
    site: 'ru',
    score: 80,
    why: [],
    risks: [],
  };
  const [card] = telegramMessages([{ ...v, letter: composeLetter(v) }]);
  assert.match(card.text, /AI &lt;script&gt;x&lt;\/script&gt; lead/);
  assert.match(card.text, /A&amp;B/);
});

test('letter check: a long letter, without a site link, with self-praise, does not pass; a word in the vacancy title does not interfere', () => {
  const title = 'AI Expert';
  const l = composeLetter({ title });
  assert.equal(checkLetter(l.text, title).ok, true, '«Expert» в названии вакансии — не самовосхваление');
  const long = `${l.text}\n\nЛишняя пятая строка.`;
  assert.deepEqual(checkLetter(long, title).problems, ['строк 5, нужно 2–4']);
  assert.deepEqual(checkLetter('Здравствуйте!\nПишите.', title).problems, ['нет ссылки на сайт']);
  const brag = l.text.replace('Мои проекты', 'Я опытный разработчик. Мои проекты');
  assert.deepEqual(checkLetter(brag, title).problems, ['лишнее: «опытн»']);
  assert.match(checkLetter(`${l.text} ${'а'.repeat(400)}`, title).problems.join(), /длиннее 400/);
  // an old-template letter in the database is rebuilt
  assert.equal(letterStale({ text: 'длинное письмо' }), true);
  assert.equal(letterStale(l), false);
});
