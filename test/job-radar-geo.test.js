// Язык и регион вакансии: письменный английский + живой перевод — подходит, разговорный — помечаем и не отсекаем;
// удалёнка любых стран: регион (весь мир / СНГ / Европа / США / Азия), новые открытые источники, поднятие оценки за асинхронную работу.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, geoMatches, geoOf, isAsyncWork, langFits, langMatches, langOf, needsSpoken } from '../src/geo.js';
import { scoreVacancy, safeUrl, EN_SITES, ASYNC_POINTS, SPOKEN_EN_PENALTY } from '../src/lib.js';
import { EN_FEEDS, REMOTEOK_TAGS, REMOTIVE_QUERIES, parseRemoteOk, parseRemotive } from '../src/sources-en.js';
import { COLLECT_DEFAULTS, collect } from '../src/collect.js';
import { applyLinks } from '../src/apply.js';

const en = (o = {}) => ({
  site: 'remoteok',
  title: 'AI Agent Engineer',
  company: 'Acme',
  region: 'remote',
  remote: true,
  text: 'Build LLM agents with Claude and MCP.',
  ...o,
});

test('язык: русская вакансия — «русский»; английская — «англ. письменный»; свободный разговорный — «нужен разговорный» (помечаем, не отсекаем)', () => {
  assert.equal(langOf({ site: 'habr', title: 'ИИ-инженер', text: 'Строим агентов на LLM, удалённо' }), 'ru');
  assert.equal(langOf(en()), 'en_written');
  assert.equal(
    langOf({ site: 'telegram', title: 'AI Lead', text: 'Looking for an AI lead. Remote.' }),
    'en_written',
    'пост по-английски в Telegram',
  );
  for (const t of [
    'Excellent spoken and written English.',
    'C1 English level or higher',
    'Fluent English is a must',
    'We need strong verbal communication in English',
    'English: fluent, daily calls with the team',
    'Английский от B2: команда билингвальная',
    'Свободный английский обязателен',
  ])
    assert.equal(langOf({ site: 'habr', title: 'AI engineer', text: t }), 'en_spoken', t);
  assert.equal(
    needsSpoken(en({ text: 'Documentation in English, async written updates.' })),
    false,
    'письменный английский — не разговорный',
  );
  assert.equal(langOf({ site: 'ru', title: 'ИИ-инженер', text: 'Читать документацию на английском' }), 'ru');
  assert.deepEqual(
    ['ru', 'en_written', 'en_spoken'].map(langFits),
    [true, true, false],
    '«Подходит мне» — русский и письменный английский',
  );
});

test('асинхронная и письменная работа — признак; «asyncio» и «async/await» в стеке — не он', () => {
  for (const t of [
    'We are an async-first company',
    'Fully async remote team',
    'Strong written communication',
    'асинхронный формат работы',
    'письменная коммуникация',
  ])
    assert.equal(isAsyncWork(t), true, t);
  for (const t of ['Python: asyncio, async/await', 'Опыт с asyncio и async/await', 'асинхронность, очереди, FastAPI', 'Build agents'])
    assert.equal(isAsyncWork(t), false, t);
});

test('регион: площадки СНГ — СНГ; английские — по полю «регион», потом по ограничению в тексте; без ограничений — весь мир', () => {
  assert.deepEqual(geoOf({ site: 'habr', region: '' }), ['cis']);
  assert.deepEqual(geoOf({ site: 'telegram', region: '', text: 'remote anywhere in the world' }), ['cis'], 'каналы Telegram — СНГ');
  assert.deepEqual(geoOf(en({ region: 'Anywhere in the World' })), ['world']);
  assert.deepEqual(geoOf(en({ region: 'remote' })), ['world']);
  assert.deepEqual(geoOf(en({ region: 'USA Only' })), ['usa']);
  assert.deepEqual(geoOf(en({ region: 'North America Only' })), ['usa']);
  assert.deepEqual(geoOf(en({ region: 'Europe' })), ['europe']);
  assert.deepEqual(geoOf(en({ region: 'remote: Thailand, Vietnam' })), ['asia']);
  assert.deepEqual(geoOf(en({ region: 'Latin America' })), ['other']);
  assert.deepEqual(geoOf(en({ region: 'Europe, USA, Canada, Singapore' })).sort(), ['asia', 'europe', 'usa']);
  assert.deepEqual(geoOf(en({ text: 'Remote role. Candidates in Germany only, EU work permit.' })), ['europe']);
  assert.deepEqual(geoOf(en({ text: 'This is a US-based role.' })), ['usa']);
  assert.deepEqual(
    geoOf(en({ text: 'Our company is based in Germany. Work from anywhere.' })),
    ['world'],
    'где компания — не ограничение для кандидата',
  );
  assert.deepEqual(geoOf(en({ text: 'Join us — we hire in all countries' })), ['world'], '«us» — местоимение, не США');
  // HN: место — в коротких частях первой строки; длинный абзац в ней не читаем
  const hn = (first) => ({ site: 'hn', region: 'remote', title: 'AI Engineer', text: first });
  assert.deepEqual(geoOf(hn('Juro | AI Engineer | London | REMOTE (UK) | Full-time')), ['europe']);
  assert.deepEqual(geoOf(hn('River | Staff Engineers | NYC or REMOTE (US, Europe, South America) | $200K')).sort(), ['europe', 'usa']);
  assert.deepEqual(geoOf(hn('Egg | AI leads | REMOTE | We are a small team and a lot of us have experience in consulting. Join us.')), [
    'world',
  ]);
  assert.deepEqual(geoOf(hn('Acme | AI Engineer | REMOTE (anywhere) | Full-time')), ['world']);
});

test('фильтры по региону и языку: «Весь мир» — всё; регион — свой и открытые любой стране; «Подходит мне» — русский и письменный английский', () => {
  assert.equal(geoMatches(['cis'], ''), true);
  assert.equal(geoMatches(['cis'], 'world'), true);
  assert.equal(geoMatches(['usa'], 'cis'), false);
  assert.equal(geoMatches(['world'], 'cis'), true, 'открытая любой стране подходит и СНГ');
  assert.equal(geoMatches(['usa', 'europe'], 'europe'), true);
  assert.equal(geoMatches(undefined, 'asia'), true, 'региона нет — как «весь мир»');
  assert.equal(langMatches('en_spoken', 'fit'), false);
  assert.equal(langMatches('en_written', 'fit'), true);
  assert.equal(langMatches('en_spoken', 'en_spoken'), true);
  assert.equal(langMatches('ru', 'all'), true);
});

test('оценка: асинхронная работа — плюс; «нужен разговорный» у английской — минус и пометка, не отсев; язык и регион возвращаются', () => {
  const today = new Date('2026-11-07');
  const base = scoreVacancy(en({ text: 'Build LLM agents with Claude and MCP. Remote worldwide.' }), { today });
  assert.equal(base.excluded, null);
  assert.equal(base.lang, 'en_written');
  assert.deepEqual(base.geo, ['world']);
  assert.equal(base.async, false);
  const asyncV = scoreVacancy(en({ text: 'Build LLM agents with Claude and MCP. Remote worldwide. We are an async-first company.' }), {
    today,
  });
  assert.equal(asyncV.score, base.score + ASYNC_POINTS, 'асинхронная работа поднимает оценку');
  assert.equal(asyncV.async, true);
  assert.ok(asyncV.why.includes('асинхронная / письменная работа'));
  const spoken = scoreVacancy(en({ text: 'Build LLM agents with Claude and MCP. Remote worldwide. Fluent spoken English required.' }), {
    today,
  });
  assert.equal(spoken.excluded, null, 'разговорный — не отсев');
  assert.equal(spoken.lang, 'en_spoken');
  assert.equal(spoken.score, base.score - SPOKEN_EN_PENALTY);
  assert.ok(spoken.risks.some((r) => /разговорный английский — только через переводчика/.test(r)));
  assert.deepEqual(scoreVacancy(en({ region: 'USA Only' }), { today }).geo, ['usa']);
  assert.equal(scoreVacancy({ site: 'habr', title: 'ИИ-инженер', text: 'Агенты на LLM, удалённо', remote: true }).lang, 'ru');
});

test('Remote OK: поле location — регион; теги ai и llm — отдельные запросы того же официального API', () => {
  const json = [
    { legal: 'API Terms' },
    {
      id: 1,
      position: 'AI Engineer',
      company: 'A',
      location: 'Anywhere in the World',
      tags: ['ai'],
      description: '<p>x</p>',
      date: '2026-11-05T15:01:09+00:00',
    },
    { id: 2, position: 'AI Lead', company: 'B', location: 'USA Only', tags: ['llm'], description: 'y', date: '2026-11-05T15:01:09+00:00' },
    { id: 3, position: 'AI Dev', company: 'C', location: '', tags: [], description: 'z', date: '2026-11-05T15:01:09+00:00' },
  ];
  assert.deepEqual(
    parseRemoteOk(json).map((v) => [v.region, geoOf(v)[0]]),
    [
      ['Anywhere in the World', 'world'],
      ['USA Only', 'usa'],
      ['remote', 'world'],
    ],
  );
  assert.deepEqual(REMOTEOK_TAGS, ['ai', 'llm']);
  assert.equal(EN_FEEDS.remoteokTag('ai'), 'https://remoteok.com/api?tag=ai');
});

test('Remotive (официальный API): ссылка только на их страницу, регион и оплата из их полей, 2 запроса в сутки; чужое — мимо', () => {
  const json = {
    'legal-notice': 'link back',
    jobs: [
      {
        id: 2091,
        url: 'https://remotive.com/remote-jobs/software-dev/ai-engineer-2091',
        title: 'AI Engineer',
        company_name: 'Acme',
        tags: ['ai', 'python'],
        publication_date: '2026-11-06T08:51:01',
        candidate_required_location: 'Worldwide',
        salary: '$120k - $150k',
        description: '<p>Build <b>LLM</b> agents</p>',
      },
      { id: 2, url: 'https://evil.example/remote-jobs/x/y', title: 'Чужая', company_name: 'X' },
      {
        id: 3,
        url: 'https://remotive.com/remote-jobs/software-dev/usa-only-3',
        title: 'AI Lead',
        company_name: 'U',
        candidate_required_location: 'USA',
        salary: '',
      },
    ],
  };
  const list = parseRemotive(json);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'rem-2091');
  assert.equal(list[0].site, 'remotive');
  assert.equal(list[0].region, 'Worldwide');
  assert.deepEqual(list[0].usd, { from: 10000, to: 12500 });
  assert.match(list[0].text, /Build LLM agents/);
  assert.deepEqual([geoOf(list[0]), geoOf(list[1])], [['world'], ['usa']]);
  assert.ok(EN_SITES.has('remotive'));
  assert.equal(langOf(list[0]), 'en_written');
  assert.equal(safeUrl(list[0].url), list[0].url);
  assert.equal(safeUrl('https://remotive.com/evil?x=1'), '');
  assert.equal(applyLinks({ ...list[0], contacts: {} })[0].label, 'Открыть на Remotive');
  assert.equal(REMOTIVE_QUERIES.length, 2, 'просят не чаще 4 запросов в сутки');
  assert.match(EN_FEEDS.remotive('AI'), /^https:\/\/remotive\.com\/api\/remote-jobs\?search=AI&limit=100$/);
});

test('сбор: мировые источники — HN, Remote OK (общая лента и теги), WWR (и программирование), Remotive, Himalayas — без входа и без hh', async () => {
  const urls = [];
  const empty = (u) =>
    /hn\.algolia\.com\/api\/v1\/search/.test(u) ? '{"hits":[]}' : /remoteok|remotive|himalayas/.test(u) ? '{}' : '<rss></rss>';
  const fetchImpl = async (u) => {
    urls.push(String(u));
    return { ok: true, status: 200, text: async () => empty(String(u)) };
  };
  assert.equal(COLLECT_DEFAULTS.hh, false);
  await collect({ fetchImpl, delay: 0, pause: 0, habr: false, telegram: false });
  const has = (re) => urls.filter((u) => re.test(u)).length;
  assert.equal(has(/remoteok\.com\/api$/), 1);
  assert.equal(has(/remoteok\.com\/api\?tag=(ai|llm)$/), 2);
  assert.equal(has(/weworkremotely\.com\/remote-jobs\.rss$/), 1);
  assert.equal(has(/weworkremotely\.com\/categories\/remote-programming-jobs\.rss$/), 1);
  assert.equal(has(/remotive\.com\/api\/remote-jobs\?/), 2);
  assert.equal(has(/himalayas\.app/), 5);
  assert.ok(!urls.some((u) => /hh\.(ru|kz)/.test(u)), 'hh не трогаем');
});
