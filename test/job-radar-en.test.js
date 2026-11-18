// Английский рынок : открытые ленты HN, Remote OK, We Work Remotely, cryptojobslist;
// удалёнка, ИИ-агенты, оплата от $3000/мес; английский отклик из фраз RESUME-EN.md; предупреждение про совмещение.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  usdMonthly,
  usdText,
  latestHiringThread,
  parseHnThread,
  parseRemoteOk,
  parseEnRss,
  parseHimalayas,
  EN_FEEDS,
} from '../src/sources-en.js';
import { scoreVacancy, safeUrl, EN_MIN_USD } from '../src/lib.js';
import { composeLetter, checkLetter } from '../src/letters.js';
import { opinionOf, pitchOf, multiJobFlags } from '../src/opinion.js';
import { applyLinks } from '../src/apply.js';
import { SITE_EN } from '../src/facts.js';

const today = new Date('2026-11-06T00:00:00Z');
const details = (v) => ({ ok: true, description: v.text, workFormat: 'удалённо', skills: [], experience: '' });
const score = (v) => scoreVacancy(v, { today, details: details(v) });

test('оплата: годовая, почасовая, месячная — в доллары в месяц; ноль и мелочь — «не указано»', () => {
  assert.deepEqual(usdMonthly('$120k–$150k'), { from: 10000, to: 12500 });
  assert.deepEqual(usdMonthly('Salary: $150,000'), { from: 12500, to: 12500 });
  assert.deepEqual(usdMonthly('$60-80/hr'), { from: 9600, to: 12800 });
  assert.deepEqual(usdMonthly('$8,000/month'), { from: 8000, to: 8000 });
  assert.deepEqual(usdMonthly('$0 – $200,000'), { from: 16667, to: 16667 });
  assert.equal(usdMonthly('$5 bonus'), null);
  assert.equal(usdMonthly('no salary'), null);
  assert.equal(usdText(null), 'не указан');
  assert.equal(usdText({ from: 9000, to: 12500 }), '$9,000–12,500/мес');
});

test('HN: свежая ветка «Who is hiring», вакансии — комментарии верхнего уровня «Компания | Роль | …»', () => {
  const search = {
    hits: [
      { objectID: '1', title: 'Ask HN: Who is hiring? (October 2026)', created_at: '2026-10-01T15:00:00Z' },
      { objectID: '2', title: 'Ask HN: Who is hiring? (November 2026)', created_at: '2026-11-02T15:00:00Z' },
      { objectID: '3', title: 'Ask HN: Who wants to be hired? (November 2026)', created_at: '2026-11-02T15:00:00Z' },
    ],
  };
  assert.equal(latestHiringThread(search), '2');
  const items = parseHnThread({
    children: [
      {
        id: 101,
        author: 'acme',
        created_at: '2026-11-03T10:00:00Z',
        text: 'Acme (https://acme.example) | Senior AI Engineer, LLM agents | REMOTE | $150k-$190k<p>We build agentic workflows with Claude.',
      },
      { id: 102, author: 'x', created_at: '2026-11-03T10:00:00Z', text: 'Just a question without pipes' },
      { id: 103, author: null, text: '[deleted]' },
    ],
  });
  assert.equal(items.length, 1);
  const [v] = items;
  assert.equal(v.company, 'Acme');
  assert.equal(v.title, 'Senior AI Engineer, LLM agents');
  assert.equal(v.url, 'https://news.ycombinator.com/item?id=101');
  assert.equal(v.remote, true);
  assert.deepEqual(v.usd, { from: 12500, to: 15833 });
  assert.equal(safeUrl(v.url), v.url);
});

test('Remote OK: первый элемент — условия API, вилка годовая, 0 = не указано; ссылка ведёт на Remote OK', () => {
  const items = parseRemoteOk([
    { legal: 'API terms' },
    {
      id: 777,
      position: 'AI Agent Engineer',
      company: 'Foo &amp; Co',
      date: '2026-11-04T00:00:00Z',
      salary_min: 96000,
      salary_max: 0,
      tags: ['llm'],
      description: '<p>Build AI agents</p>',
    },
    { id: 778, position: '' },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].company, 'Foo & Co');
  assert.deepEqual(items[0].usd, { from: 8000, to: 8000 });
  assert.equal(items[0].url, 'https://remoteok.com/remote-jobs/777');
  assert.equal(safeUrl(items[0].url), items[0].url);
});

test('WWR и cryptojobslist: «Компания: Роль», чужие ссылки отброшены', () => {
  const rss = `<rss><channel>
    <item><title>Helmsted: Founding AI Engineer</title><link>https://weworkremotely.com/remote-jobs/helmsted-founding-ai-engineer</link>
      <description><![CDATA[<p>Agentic systems. $140,000 - $180,000 per year</p>]]></description><pubDate>Wed, 05 Nov 2026 10:00:00 +0000</pubDate></item>
    <item><title>Bad: Job</title><link>https://evil.example/x</link></item>
  </channel></rss>`;
  const items = parseEnRss(rss, 'wwr');
  assert.equal(items.length, 1);
  assert.equal(items[0].company, 'Helmsted');
  assert.equal(items[0].title, 'Founding AI Engineer');
  assert.equal(items[0].remote, true);
  assert.equal(safeUrl(items[0].url), items[0].url);
  const cj = parseEnRss(
    '<item><title>LLM Engineer</title><link>https://cryptojobslist.com/jobs/llm-engineer-x</link><description>Remote, worldwide</description></item>',
    'cryptojobs',
  );
  assert.equal(cj[0].remote, true);
  assert.equal(cj[0].company, '');
});

test('оценка: нужна удалёнка, ИИ и оплата от $3000/мес; английский — не риск, а условие с живым переводом', () => {
  const base = {
    id: 'hn-1',
    site: 'hn',
    title: 'Senior AI Engineer',
    remote: true,
    text: 'Build LLM agents with Claude and MCP',
    created: '05.11.2026',
  };
  const ok = score({ ...base, usd: { from: 9000, to: 12000 } });
  assert.equal(ok.excluded, null);
  assert.ok(ok.score >= 55, String(ok.score));
  assert.ok(ok.risks.includes('общение на английском — письменно и через живой перевод'));
  assert.ok(!ok.risks.includes('нужен английский'));
  // вилка не фильтр : низкая оплата — та же оценка, в письме всё равно «от 600k»
  const low = score({ ...base, usd: { from: 2000, to: EN_MIN_USD - 1 } });
  assert.equal(low.excluded, null);
  assert.equal(low.score, ok.score);
  assert.equal(score({ ...base, remote: false }).excluded, 'не удалёнка');
  assert.equal(score({ ...base, title: 'Backend Engineer', text: 'We use AI tools' }).excluded, 'нет ИИ в названии');
  const region = score({ ...base, title: 'Senior AI Engineer - US', usd: null });
  assert.ok(region.risks.some((r) => /только для своего региона/.test(r)));
  assert.ok(region.score < ok.score);
  assert.equal(score({ ...base, title: 'Junior AI Engineer (new grad)' }).excluded !== null, true);
});

test('английский отклик: от первого лица, сайт /en/, строка про письменное общение и перевод, цифры только утверждённые', () => {
  const v = {
    id: 'wwr-1',
    site: 'wwr',
    title: 'Founding AI Engineer — agentic platform',
    url: 'https://weworkremotely.com/remote-jobs/x',
    score: 80,
    why: ['ИИ-инженер'],
    risks: [],
  };
  const letter = composeLetter(v);
  assert.equal(letter.lang, 'en');
  assert.equal(letter.resume, 'RESUME-EN.md');
  assert.deepEqual(letter.text.split('\n'), [
    'Hi! About your «Founding AI Engineer — agentic platform» role.',
    'I work on systems built from AI agents.',
    `My projects: ${SITE_EN}`,
    "Interested? Let's talk.",
  ]);
  assert.ok(!/[а-яё]/i.test(letter.text), 'в английском письме нет кириллицы');
  assert.deepEqual(checkLetter(letter.text, v.title), { ok: true, unknown: [] });

  const p = pitchOf(v);
  assert.ok(p.length <= 256, String(p.length));
  assert.match(p, /^Hi! About your «/);
  assert.ok(p.includes(SITE_EN));
  const longTitle = pitchOf({ ...v, title: 'x'.repeat(400) });
  assert.ok(longTitle.length <= 256);
  assert.equal(checkLetter(longTitle, 'x'.repeat(400)).ok, true);

  const links = applyLinks({ ...v, contacts: { emails: ['jobs@example.com'], telegram: [] } }, letter.text);
  assert.equal(links[0].label, 'Открыть на We Work Remotely');
  assert.match(links[1].url, /subject=Application/);
});

test('совмещение: эксклюзив, NDA/неконкуренция, обязательные часы — предупреждение в «мнении», вакансия не отбрасывается', () => {
  const v = (text) => ({ id: 'x', site: 'ru', title: 'AI Lead', score: 85, why: ['руководящая ИИ-роль'], risks: [], description: text });
  assert.deepEqual(multiJobFlags(v('Чистый текст про агентов')), []);
  assert.deepEqual(multiJobFlags(v('This is an exclusive full-time role, no other employment.')), ['запрет совмещения']);
  assert.deepEqual(multiJobFlags(v('Совмещение не допускается. Подписываем NDA.')), ['запрет совмещения', 'NDA или неконкуренция']);
  assert.deepEqual(multiJobFlags(v('Non-compete clause applies')), ['NDA или неконкуренция']);
  assert.deepEqual(multiJobFlags(v('Core hours 9am-5pm EST required')), ['обязательные часы в чужом поясе']);
  assert.deepEqual(multiJobFlags(v('Работа с 10:00 до 19:00 по московскому')), ['обязательные часы в чужом поясе']);
  assert.deepEqual(multiJobFlags(v('PST hours overlap required')), ['обязательные часы в чужом поясе']);
  // «testing … hours» — не часовой пояс (живая лента WWR, 06.11)
  assert.deepEqual(multiJobFlags(v('Planning, coding, testing, and deployment. Flexible hours.')), []);

  const plain = opinionOf(v('Агенты и боты'));
  assert.ok(!plain.includes('Совмещение'));
  const warned = opinionOf(v('Exclusive employment, NDA, core hours 9-6 EST'));
  assert.match(warned, /^Стоит откликнуться/);
  assert.match(warned, /Совмещение: ⚠ запрет совмещения, NDA или неконкуренция, обязательные часы в чужом поясе\.$/);
});

test('Himalayas (официальный API): ссылка — applicationLink без изменений, оплата в $/мес, истёкшие и чужие ссылки — мимо', () => {
  const NOW = Date.parse('2026-11-06T05:00:00Z');
  const job = (extra = {}) => ({
    title: 'AI Engineer (LLM agents)',
    companyName: 'Acme',
    companySlug: 'acme',
    locationRestrictions: [],
    minSalary: 120000,
    maxSalary: 150000,
    salaryPeriod: 'annual',
    currency: 'USD',
    description: '<p>Build LLM agents with Claude and MCP. Fully remote.</p>',
    pubDate: 1793768082,
    expiryDate: 1798952081,
    applicationLink: 'https://himalayas.app/companies/acme/jobs/ai-engineer-llm?utm_source=api',
    ...extra,
  });
  const list = parseHimalayas(
    {
      jobs: [
        job(),
        job({
          title: 'Hourly',
          applicationLink: 'https://himalayas.app/companies/acme/jobs/hourly?utm_source=api',
          minSalary: 80,
          maxSalary: 95,
          salaryPeriod: 'hourly',
        }),
        job({ title: 'Old', applicationLink: 'https://himalayas.app/companies/acme/jobs/old?utm_source=api', expiryDate: 1700000000 }),
        job({ title: 'Evil', applicationLink: 'https://evil.example/apply' }),
        job({
          title: 'US only',
          applicationLink: 'https://himalayas.app/companies/acme/jobs/us?utm_source=api',
          locationRestrictions: [{ name: 'United States' }],
        }),
      ],
    },
    NOW,
  );
  assert.deepEqual(
    list.map((v) => v.title),
    ['AI Engineer (LLM agents)', 'Hourly', 'US only'],
  );
  const [a, h, us] = list;
  assert.equal(a.url, 'https://himalayas.app/companies/acme/jobs/ai-engineer-llm?utm_source=api', 'applicationLink без изменений');
  assert.equal(safeUrl(a.url), a.url);
  assert.deepEqual(a.usd, { from: 10000, to: 12500 });
  assert.deepEqual(h.usd, { from: 12800, to: 15200 });
  assert.equal(a.remote, true);
  assert.equal(us.remote, false, 'только для США — не наша удалёнка');
  assert.equal(scoreVacancy(us).excluded, 'не удалёнка');
  assert.equal(scoreVacancy(a).excluded, null);
  assert.equal(composeLetter(a).lang, 'en');
  assert.equal(applyLinks(a, '')[0].label, 'Открыть на Himalayas');
  assert.match(EN_FEEDS.himalayas('LLM'), /^https:\/\/himalayas\.app\/jobs\/api\/search\?q=LLM&worldwide=true&sort=recent&page=1$/);
});
