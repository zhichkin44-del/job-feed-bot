// Отправка в Telegram: токен только из аргумента (окружения), без callback-кнопок, ошибки не роняют отправку и не светят токен.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, sendAll, workingKeyboard } from '../src/send.js';

const msg = {
  parse_mode: 'HTML',
  text: '<b>1. Вакансия</b>',
  reply_markup: {
    inline_keyboard: [
      [{ text: 'Открыть вакансию', url: 'https://hh.ru/vacancy/1' }],
      [{ text: 'Скопировать текст', copy_text: { text: 'Здравствуйте!' } }],
      [{ text: 'Отправил', callback_data: 'job:done:1' }, { text: 'Пропустить', callback_data: 'job:skip:1' }],
    ],
  },
};

test('в отправку идут только кнопки без callback_data', () => {
  const kb = workingKeyboard(msg.reply_markup);
  assert.equal(kb.inline_keyboard.length, 2);
  assert.equal(workingKeyboard({ inline_keyboard: [[{ text: 'x', callback_data: 'a' }]] }), undefined);
  assert.equal('reply_markup' in prepare([{ text: 't' }])[0], false);
});

test('сообщения уходят в sendMessage с chat_id, токен в адресе запроса', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const r = await sendAll([msg, msg], { token: 'TEST_TOKEN', chatId: '42', fetchImpl, pauseMs: 0 });
  assert.deepEqual(r, { sent: 2, failed: [] });
  assert.equal(calls[0].url, 'https://api.telegram.org/botTEST_TOKEN/sendMessage');
  assert.equal(calls[0].body.chat_id, '42');
  assert.equal(calls[0].body.reply_markup.inline_keyboard.length, 2);
});

test('ошибка Telegram и сетевой сбой считаются, остальные сообщения уходят; токен из текста ошибки убирается', async () => {
  let n = 0;
  const fetchImpl = async () => {
    n++;
    if (n === 1) return { ok: false, status: 400, json: async () => ({ ok: false, description: 'Bad Request: chat not found' }) };
    if (n === 2) throw new Error('connect ECONNRESET https://api.telegram.org/botTEST_TOKEN/sendMessage');
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  const r = await sendAll([msg, msg, msg], { token: 'TEST_TOKEN', chatId: '42', fetchImpl, pauseMs: 0 });
  assert.equal(r.sent, 1);
  assert.equal(r.failed.length, 2);
  assert.match(r.failed[0].error, /chat not found/);
  assert.ok(!JSON.stringify(r.failed).includes('TEST_TOKEN'));
});

test('без токена или чата отправка не начинается', async () => {
  await assert.rejects(() => sendAll([msg], { token: '', chatId: '42', fetchImpl: async () => assert.fail('не должно') }), /TELEGRAM_BOT_TOKEN/);
});
