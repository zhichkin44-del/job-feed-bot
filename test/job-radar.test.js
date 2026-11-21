// Vacancy radar: parsing of hh RSS, pay, scoring for the owner's profile, escaping of untrusted text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeLetter } from '../src/letters.js';
import { collect, COLLECT_DEFAULTS } from '../src/collect.js';
import {
  parseRss,
  parseSalary,
  toRub,
  topRub,
  ageDays,
  parseVacancyPage,
  scoreVacancy,
  mdCell,
  safeUrl,
  salaryStats,
  renderReport,
  dedupe,
} from '../src/lib.js';

const item = (id, title, salary, created = '02.11.2026', company = 'ООО Пример') =>
  `<item><pubDate>2026-11-02T14:37:32.420+03:00</pubDate><title>${title}</title><link>https://hh.ru/vacancy/${id}</link>` +
  `<description><![CDATA[<p>Вакансия компании: ${company}</p> <p>Создана: ${created}</p> <p>Регион: Москва</p> <p>Предполагаемый уровень месячного дохода: ${salary}</p>]]></description></item>`;
const rss = (...items) =>
  `<?xml version='1.0' encoding='utf-8'?><rss version="2.0"><channel><title>HeadHunter Vacancy</title><link>https://hh.ru</link>${items.join('')}</channel></rss>`;
const today = new Date('2026-11-04T10:00:00Z');

test('radar: hh RSS is parsed into vacancies with company, date, region and pay', () => {
  const list = parseRss(rss(item(1, 'Head of AI &amp; Agents', 'от 450 000 до 550 000 ₽'), item(2, 'LLM Engineer', 'не указан')), 'kz');
  assert.equal(list.length, 2);
  assert.deepEqual(
    {
      id: list[0].id,
      url: list[0].url,
      title: list[0].title,
      company: list[0].company,
      created: list[0].created,
      region: list[0].region,
      salaryText: list[0].salaryText,
    },
    {
      id: '1',
      url: 'https://hh.kz/vacancy/1',
      title: 'Head of AI & Agents',
      company: 'ООО Пример',
      created: '02.11.2026',
      region: 'Москва',
      salaryText: 'от 450 000 до 550 000 ₽',
    },
  );
  assert.equal(list[1].salaryText, 'не указан');
});

test('radar: pay: range, "from", "to", currencies, "not stated"', () => {
  assert.deepEqual(parseSalary('от 450 000 до 550 000 ₽'), { from: 450000, to: 550000, currency: 'RUB' });
  assert.deepEqual(parseSalary('до 5 000 $'), { from: null, to: 5000, currency: 'USD' });
  assert.deepEqual(parseSalary('от 1 000 000 ₸'), { from: 1000000, to: null, currency: 'KZT' });
  assert.equal(parseSalary('не указан'), null);
  assert.equal(parseSalary(''), null);
  assert.equal(topRub(parseSalary('до 5 000 $')), 405000);
  assert.deepEqual(toRub(parseSalary('от 454 000 ₸')), { from: 81000, to: null });
});

test('radar: vacancy age in days', () => {
  assert.equal(ageDays('02.11.2026', today), 2);
  assert.equal(ageDays('мусор', today), null);
});

test('radar: range 120–200k: the vacancy is not discarded and passes the threshold of 55; range figures do not get into the letter', () => {
  const v = { title: 'Разработчик ИИ-агентов', salaryText: 'от 120 000 до 200 000 ₽', created: '03.11.2026' };
  const s = scoreVacancy(v, { today });
  assert.equal(s.excluded, null);
  assert.ok(s.score >= 55, String(s.score));
  assert.ok(s.why.some((w) => /сумма из теста/.test(w)));
  const text = composeLetter(v).text;
  assert.ok(!/тыс. ₽/.test(text));
  assert.ok(!/200/.test(text), 'их цифры в письмо не попадают');
});

test('radar: an AI head ranks above an engineer without pay; sales are discarded; a low range is not a filter', () => {
  const lead = scoreVacancy(
    { title: 'Руководитель направления ИИ-агентов', salaryText: 'от 450 000 до 600 000 ₽', created: '03.11.2026' },
    { today },
  );
  const eng = scoreVacancy({ title: 'AI-инженер', salaryText: 'не указан', created: '20.10.2026' }, { today });
  assert.equal(lead.excluded, null);
  assert.ok(lead.score > eng.score, `${lead.score} > ${eng.score}`);
  assert.match(lead.why.join(' '), /руководящая/);
  assert.ok(eng.why.includes('вилка не указана — сумма из теста'));
  assert.equal(scoreVacancy({ title: 'Менеджер по продажам AI-решений', salaryText: 'не указан' }, { today }).excluded, 'продажи');
  // the range is neither a filter nor a minus
  const low = scoreVacancy({ title: 'AI-разработчик', salaryText: 'до 200 000 ₽' }, { today });
  assert.equal(low.excluded, null);
  assert.equal(low.score, scoreVacancy({ title: 'AI-разработчик', salaryText: 'до 900 000 ₽' }, { today }).score);
  assert.equal(scoreVacancy({ title: 'Бухгалтер', salaryText: 'не указан' }, { today }).excluded, 'не ИИ-роль');
});

test('radar: "agent" without AI is not an AI agent (real estate, client acquisition)', () => {
  assert.ok(scoreVacancy({ title: 'Агент по недвижимости (горячие лиды)', salaryText: 'от 500 000 ₽' }, { today }).excluded);
  assert.ok(scoreVacancy({ title: 'B2B-агент по привлечению клиентов (AI / CRM)', salaryText: 'до 600 000 ₽' }, { today }).excluded);
  assert.ok(scoreVacancy({ title: 'Агент по закупкам', salaryText: 'не указан' }, { today }).excluded);
  assert.ok(scoreVacancy({ title: 'Сценарист на YouTube-канал (нейросети, llm, ai-агенты)', salaryText: 'не указан' }, { today }).excluded);
  assert.ok(
    scoreVacancy({ title: 'AI-амбассадор / B2B-партнёр по внедрению AI-решений', salaryText: 'до 1 000 000 ₽' }, { today }).excluded,
  );
  assert.deepEqual(
    dedupe([
      { company: 'Novakid', title: 'Продакт (AI)', id: 1 },
      { company: 'Novakid', title: 'Продакт  (AI)', id: 2 },
      { company: 'X', title: 'Продакт (AI)', id: 3 },
    ]).map((v) => v.id),
    [1, 3],
  );
  const ok = scoreVacancy(
    { title: 'Ведущий разработчик (Tech Lead) платформы ИИ-агентов', salaryText: 'от 450 000 до 550 000 ₽' },
    { today },
  );
  assert.equal(ok.excluded, null);
});

test('radar: "AI engineer: Marketing OS" is not marketing; ML research is lowered', () => {
  assert.equal(scoreVacancy({ title: 'AI-инженер: Marketing OS', salaryText: 'не указан' }, { today }).excluded, null);
  const ds = scoreVacancy({ title: 'Data Scientist (NLP, LLM)', salaryText: 'не указан' }, { today });
  const agent = scoreVacancy({ title: 'Разработчик ИИ-агентов', salaryText: 'не указан' }, { today });
  assert.ok(ds.score < agent.score);
  assert.ok(ds.risks.some((r) => /ML/.test(r)));
});

test('radar: vacancy page: description, experience, format; English lowers the score', () => {
  const html =
    '<div data-qa="vacancy-experience">3–6 лет</div><div data-qa="work-formats-text"><dl><dt>Формат работы: </dt><dd>удалённо</dd></dl></div>' +
    '<div data-qa="vacancy-description"><p>Строим ИИ-агентов на Claude и MCP, Node.js.</p><p>Английский язык не ниже B2.</p></div>' +
    '<ul><li data-qa="skills-element">LLM</li></ul>';
  const d = parseVacancyPage(html);
  assert.equal(d.ok, true);
  assert.equal(d.experience, '3–6 лет');
  assert.match(d.workFormat, /удалённо/);
  assert.deepEqual(d.skills, ['LLM']);
  const v = { title: 'AI Engineer', salaryText: 'не указан', created: '03.11.2026' };
  const withEn = scoreVacancy(v, { today, details: d });
  assert.ok(withEn.risks.includes('нужен английский'));
  assert.ok(withEn.stack.includes('Claude') && withEn.stack.includes('MCP'));
  assert.equal(parseVacancyPage('<html>капча</html>').ok, false);
});

test('radar: untrusted text is escaped, links only to hh vacancies', () => {
  assert.equal(mdCell('a|b [x](javascript:alert(1)) <img>'), 'a\\|b \\[x\\](javascript:alert(1)) \\<img\\>');
  assert.equal(safeUrl('https://hh.ru/vacancy/123'), 'https://hh.ru/vacancy/123');
  assert.equal(safeUrl('https://evil.example/vacancy/123'), '');
  assert.equal(safeUrl('https://hh.ru/vacancy/123?x=1'), '');
});

test('radar: the report contains the 500+ counters and a table', () => {
  const list = [
    {
      id: '1',
      url: 'https://hh.ru/vacancy/1',
      title: 'Head of AI',
      company: 'X',
      salaryText: 'от 500 000 до 700 000 ₽',
      region: 'Москва',
      created: '03.11.2026',
    },
    {
      id: '2',
      url: 'https://hh.ru/vacancy/2',
      title: 'LLM Engineer',
      company: 'Y',
      salaryText: 'не указан',
      region: 'Москва',
      created: '03.11.2026',
    },
  ].map((v) => ({ ...v, ...scoreVacancy(v, { today }) }));
  const stats = salaryStats(list);
  assert.deepEqual(stats, { total: 2, withSalary: 1, top300: 1, top500: 1, from500: 1 });
  const md = renderReport({
    date: '2026-11-04',
    ranked: list,
    excludedCount: 0,
    stats,
    fit: stats,
    counts500: [{ label: 'Россия', n: 20 }],
    errors: [],
    sources: ['hh.ru'],
  });
  assert.match(md, /Россия: ≥ 20/);
  assert.match(md, /\| 1 \| \d+ \| \[Head of AI\]\(https:\/\/hh\.ru\/vacancy\/1\)/);
});

test('hh is off by default (hh robots.txt and terms): neither feeds nor hh pages; enabled only with hh: true', async () => {
  const urls = [];
  const fetchImpl = async (url) => (urls.push(String(url)), { ok: true, status: 200, text: async () => '<rss></rss>' });
  const quiet = { delay: 0, pause: 0, habr: false, telegram: false, en: false, fetchImpl };
  assert.equal(COLLECT_DEFAULTS.hh, false);
  await collect(quiet);
  assert.equal(urls.filter((u) => /hh\.(ru|kz)/.test(u)).length, 0, 'к hh не уходит ни одного запроса');
  await collect({ ...quiet, hh: true, details: 0 });
  assert.ok(
    urls.some((u) => /hh\.ru\/search\/vacancy\/rss/.test(u)),
    'с явным hh: true — как раньше',
  );
});

test('radar : a prompt-role without development is skipped, junior is allowed, development ranks above management', () => {
  const s = (title) => scoreVacancy({ title, salaryText: 'от 150 000 ₽', created: '12.11.2026' }, { today: new Date('2026-11-13') });
  assert.equal(s('Prompt engineer').excluded, 'промпты без разработки');
  assert.equal(s('Промпт-инженер (ИИ)').excluded, 'промпты без разработки');
  assert.equal(s('Разработчик LLM-приложений (prompt engineering)').excluded, null);
  assert.equal(s('Junior AI-разработчик').excluded, null);
  assert.equal(s('Стажёр AI').excluded, 'начальный уровень');
  assert.equal(s('Асессор ответов ИИ').excluded, 'разметка / ручное обучение моделей');
  assert.ok(s('AI-разработчик').score > s('Руководитель ИИ-направления').score, 'разработка выше руководства');
});
