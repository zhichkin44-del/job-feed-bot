#!/usr/bin/env node
// Vacancy radar for the owner: AI roles, remote work, Russia and Kazakhstan, pay from 300k ₽ or not stated.
// Sources are in collect.js: hh.ru / hh.kz (RSS; the public /vacancies API has answered 403 without authorization since April 2026), Habr Career, Telegram.
// Sends nothing and logs in nowhere: it only reads the open feeds and (optionally) the pages of the best vacancies.
//
//   node src/radar.js                 — full run, report in data/<date>.md and .json
//   node src/radar.js --details 0     — without reading the vacancy pages (faster, rougher score)
//   node src/radar.js --top 30 --delay 2000 --sites ru,kz
//   node src/radar.js --rescore data/2026-11-04.json — re-score without network
//   node src/radar.js --digest        — plus the bot digest with letters and bot messages (to files, without sending)
//   flags: --no-habr, --no-telegram, --no-seen (do not remember what was shown), --mode one-button|auto
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITES } from './profile.js';
import { scoreVacancy, salaryStats, renderReport, dedupe } from './lib.js';
import { collect, textDetails } from './collect.js';
import { DEFAULTS, selectNew, withLetters, telegramMessages, renderDigest } from './digest.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function args(argv) {
  const o = {
    top: 30,
    details: 40,
    delay: 1500,
    sites: SITES.map((s) => s.id),
    out: join(root, 'data', 'job-radar'),
    rescore: '',
    habr: true,
    telegram: true,
    digest: false,
    seen: true,
    mode: '',
  };
  const flags = { 'no-habr': ['habr', false], 'no-telegram': ['telegram', false], digest: ['digest', true], 'no-seen': ['seen', false] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    const v = argv[i + 1];
    if (flags[k]) {
      o[flags[k][0]] = flags[k][1];
      continue;
    }
    if (k === 'top' || k === 'details' || k === 'delay') o[k] = Number(v);
    else if (k === 'mode') o.mode = v;
    else if (k === 'sites') o.sites = String(v).split(',');
    else if (k === 'out') o.out = v;
    else if (k === 'rescore') o.rescore = v;
    else continue;
    i++;
  }
  return o;
}

async function main(o) {
  const r = await collect({ ...o, log: (s) => process.stderr.write(`${s}\n`) });
  finish({ o, ...r });
}

/** Re-scoring of saved results, without network (after editing profile.js). */
function rescore(o) {
  const data = JSON.parse(readFileSync(o.rescore, 'utf8'));
  const today = new Date(`${data.date}T12:00:00Z`);
  const all = data.vacancies.map((v) => {
    const details = v.detailed
      ? {
          ok: true,
          description: v.description ?? '',
          workFormat: v.workFormat ?? '',
          skills: v.skills ?? [],
          experience: v.experience ?? '',
        }
      : textDetails(v);
    return { ...v, ...scoreVacancy(v, { today, details }) };
  });
  const sites = SITES.filter((s) => o.sites.includes(s.id));
  finish({ o, date: data.date, all, counts500: data.counts500 ?? [], errors: data.errors ?? [], sites, note: 're-scored offline' });
}

function finish({ o, date, all, counts500, errors, sites, note }) {
  const kept = all.filter((v) => !v.excluded);
  const ranked = dedupe(kept.sort((a, b) => b.score - a.score)).slice(0, o.top);
  const report = renderReport({
    date,
    ranked,
    excludedCount: all.length - kept.length,
    stats: salaryStats(all),
    fit: salaryStats(kept),
    counts500,
    errors,
    sources: [...new Set(sites.map((s) => s.host))],
  });

  mkdirSync(o.out, { recursive: true });
  writeFileSync(join(o.out, `${date}.md`), report);
  writeFileSync(
    join(o.out, `${date}.json`),
    JSON.stringify({ date, counts500, errors, vacancies: all.sort((a, b) => b.score - a.score) }, null, 2),
  );
  process.stdout.write(
    `Radar ${date}: ${note}, vacancies ${all.length}, matching the profile ${kept.length}, errors ${errors.length}.\n` +
      `Report: ${join(o.out, `${date}.md`)}\n`,
  );
  if (o.digest) secretary({ o, date, kept: dedupe(kept) });
}

const readJson = (file, fallback) => {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
  } catch {
    return fallback;
  }
};

/** Bot digest: new above the threshold → letters → the digest file and the bot messages. Sends nothing. */
function secretary({ o, date, kept }) {
  const cfg = { ...DEFAULTS, ...readJson(join(o.out, 'secretary.json'), {}), ...(o.mode ? { mode: o.mode } : {}) };
  const seenFile = join(o.out, 'seen.json');
  const seen = readJson(seenFile, {});
  const max = cfg.mode === 'auto' ? cfg.autoMaxPerDay : cfg.maxPerDay;
  const { ok, rejected } = withLetters(selectNew(kept, seen, { threshold: cfg.threshold, max }));
  writeFileSync(join(o.out, `digest-${date}.md`), renderDigest({ date, items: ok, mode: cfg.mode, rejected, total: kept.length }));
  writeFileSync(join(o.out, `digest-${date}.tg.json`), JSON.stringify(telegramMessages(ok, { mode: cfg.mode }), null, 2));
  if (o.seen) {
    for (const v of ok) seen[v.id] = { date, score: v.score, status: 'shown' };
    writeFileSync(seenFile, JSON.stringify(seen, null, 2));
  }
  process.stdout.write(
    `bot: mode ${cfg.mode}, in the digest ${ok.length}, letters rejected by the check: ${rejected.length}. ` +
      `File: ${join(o.out, `digest-${date}.md`)} (nothing sent to the bot)\n`,
  );
}

(async () => {
  const o = args(process.argv.slice(2));
  if (o.rescore) rescore(o);
  else await main(o);
})().catch((e) => {
  process.stderr.write(`radar crashed: ${e.stack ?? e}\n`);
  process.exit(1);
});
