#!/usr/bin/env node
// Sends the digest to Telegram: reads digest-<date>.tg.json (written by radar.js --digest) and sends the messages through the Bot API.
// Token and chat come only from the environment (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID). Without the --yes flag it sends nothing.
//
//   node src/send.js data/digest-2026-11-18.tg.json          — show what will be sent
//   node src/send.js data/digest-2026-11-18.tg.json --yes    — send
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API = 'https://api.telegram.org';

/**
 * Buttons with callback_data need a handler for presses, which this package does not have: only link buttons go out
 * and "Copy text". Empty rows are dropped.
 */
export function workingKeyboard(markup) {
  const rows = (markup?.inline_keyboard ?? []).map((row) => row.filter((b) => !b.callback_data)).filter((row) => row.length);
  return rows.length ? { inline_keyboard: rows } : undefined;
}

export function prepare(messages) {
  return messages.map((m) => {
    const { reply_markup, ...rest } = m;
    const kb = workingKeyboard(reply_markup);
    return kb ? { ...rest, reply_markup: kb } : rest;
  });
}

/**
 * @param {object[]} messages sendMessage bodies without chat_id
 * @param {{ token: string, chatId: string, fetchImpl?: Function, pauseMs?: number }} opts
 * @returns {Promise<{ sent: number, failed: { index: number, error: string }[] }>}
 */
export async function sendAll(messages, { token, chatId, fetchImpl = fetch, pauseMs = 1100 }) {
  if (!token || !chatId) throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in the environment');
  let sent = 0;
  const failed = [];
  for (const [index, m] of prepare(messages).entries()) {
    try {
      const res = await fetchImpl(`${API}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...m, chat_id: chatId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) failed.push({ index, error: String(body.description ?? `HTTP ${res.status}`).slice(0, 200) });
      else sent++;
    } catch (e) {
      failed.push({ index, error: String(e?.message ?? e).replaceAll(token, '***').slice(0, 200) });
    }
    if (pauseMs && index < messages.length - 1) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return { sent, failed };
}

async function cli(argv) {
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) throw new Error('pass the file digest-<date>.tg.json');
  const messages = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(messages)) throw new Error('the file must contain a list of messages');
  if (!argv.includes('--yes')) {
    process.stdout.write(`Messages to send: ${messages.length}. Add --yes to send.\n`);
    for (const m of prepare(messages)) process.stdout.write(`---\n${String(m.text).replace(/<[^>]+>/g, '')}\n`);
    return;
  }
  const { sent, failed } = await sendAll(messages, { token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID });
  process.stdout.write(`Sent: ${sent}, errors: ${failed.length}.\n`);
  for (const f of failed) process.stderr.write(`message ${f.index + 1}: ${f.error}\n`);
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).catch((e) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  });
}
