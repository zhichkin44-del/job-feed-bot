# job-feed-bot

A Node.js job-radar bot. It collects vacancies from open public feeds (no logins), removes duplicates,
scores each vacancy against your profile with plain rules, drafts a short cover letter for the best ones
from **approved phrases only**, rejects any letter that contains a number not present in those phrases
or in the vacancy title, and sends a card digest to Telegram.

Who it is for: a job seeker who wants a short, verified daily shortlist without an AI model.

> The repository ships a **template** profile and phrase bank with example values. Fill in your own.
> The phrases and vacancy texts are Russian by design (the bot targets the Russian job market). See
> [Language](#language).

## Features

- **Collects from 8+ open sources** with no accounts: Habr Career (RSS), public Telegram channels
  (web preview), Hacker News "Who is hiring", Remote OK, We Work Remotely, Remotive, Himalayas, Crypto Jobs List.
  hh.ru is off by default (see [Limitations](#limitations)).
- **Deduplicates and filters** vacancies (sales, support, markup and other excluded roles), parses salaries
  and currencies, and detects language and region.
- **Scores 0-100** against rules in `src/profile.js` (roles and stack that raise the score, risks that lower it).
- **Verified cover letters:** `checkLetter()` rejects letters with numbers, lines, links or self-praise that
  are not in the approved phrases. A rejected vacancy never reaches the digest.
- **Telegram digest:** card messages with links and copy-text buttons. Sending is opt-in (`--yes`).
- **Reports and tests:** Markdown and JSON reports per run; 44 unit tests, no network access in tests.

## Requirements

- Node.js 20 or newer (tested on Node 24). No npm dependencies.
- Windows, macOS or Linux.
- Optional, only for sending to Telegram: a bot token and a chat id.

## Installation

Works the same on Windows, macOS and Linux. Run the commands in a terminal (PowerShell or Command Prompt on
Windows, Terminal on macOS/Linux).

1. Install Node.js 20+ from <https://nodejs.org> and check it:

   ```bash
   node --version
   ```

2. Clone the repository and enter it:

   ```bash
   git clone https://github.com/zhichkin44-del/job-feed-bot.git
   cd job-feed-bot
   ```

3. Run the sample. It needs no network and no keys:

   ```bash
   npm run sample
   ```

   Expected output: console status lines (in Russian), for example `Радар 2026-11-18: ... вакансий 6, по профилю 4, ошибок 0`, and the
   files `data/<date>.md`, `data/<date>.json`, `data/digest-<date>.md`, `data/digest-<date>.tg.json`.

4. Run the tests:

   ```bash
   npm test
   ```

## Configuration

Copy `.env.example` to `.env` and fill in only what you need. All variables are optional for the sample run.

| Variable | Required for | Where to get it |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | sending the digest (`npm run send`) | create a bot with @BotFather in Telegram and copy the token |
| `TELEGRAM_CHAT_ID` | sending the digest | the chat id where the bot should post (e.g. your own chat with the bot) |
| `JOB_BOT_SITE` | letters (optional) | your website or portfolio URL; defaults to `https://example.com` |

Never commit `.env`. The token is read only from the environment and is never printed in error messages.

Then edit the two template files:

- `src/profile.js`: search queries, roles and stack that raise the score, excluded roles, risks that lower it
  (for example "English required", "5+ years"), and currency rates (dated, not refreshed automatically).
- `src/facts.js`: approved phrases for letters: name, project links, phrases by vacancy topic, letter variants.
  Replace the `[...]` placeholders and add only figures you can verify.

## Usage

Live run over open feeds (about 43 requests with pauses, honest User-Agent):

```bash
node src/radar.js --digest
```

Useful flags (see the header of `src/radar.js`):

- `--details 0`: do not open vacancy pages (faster, coarser scores)
- `--rescore data/<date>.json`: recalculate scores offline
- `--no-habr`, `--no-telegram`: skip a source
- `--no-seen`: do not remember what was already shown

Preview and send the digest to Telegram (dry run first, then `--yes`):

```bash
node --env-file=.env src/send.js data/digest-<date>.tg.json          # show what would be sent
node --env-file=.env src/send.js data/digest-<date>.tg.json --yes    # send
```

Sending never happens without `--yes`. The bot never submits a job application for you.

## Tests

```bash
npm test
```

The tests replace feeds and Telegram with fixtures; they make no network calls. Coverage: RSS and JSON parsing,
salaries and currencies, scoring and filtering, language and region, escaping of untrusted vacancy text,
letter checks, card and button layout, Telegram sending (the token never appears in error text).

Last verified: 21.11.2026, Node.js 24.22.1, Windows: 44 tests, 44 pass.

## Project structure

```
src/radar.js       entry point: collect, score, report, digest
src/collect.js     fetch feeds and vacancy pages (rate-limited)
src/sources.js     Russian sources (Habr Career, Telegram channels)
src/sources-en.js  English sources (Hacker News, Remote OK, ...)
src/lib.js         dedupe, salary parsing, scoring, report rendering
src/profile.js     search queries and scoring rules (template)
src/facts.js       approved letter phrases (template, Russian)
src/letters.js     letter assembly and checkLetter()
src/digest.js      digest and Telegram messages
src/send.js        Telegram sender (dry run by default)
src/geo.js         language and region detection
src/opinion.js     verdict text for each vacancy
src/apply.js       reply helpers (the user sends applications manually)
sample/run.json    offline sample feed (fictional vacancies)
test/              node:test suites
```

## Language

- Code, comments, documentation and messages for the developer: English.
- Cover-letter phrases (`src/facts.js`), the profile template, vacancy texts, and the bot's runtime messages
  (for example the console status lines and Telegram digest text) are Russian. They are product content for
  the Russian job market and are kept as they are.

## Limitations

- Letters are assembled from templates and approved phrases, not written by a model. They are short and
  similar to each other. A model draft can be plugged in by passing it through `checkLetter()`.
- The shipped profile and phrases are examples. Without filling them in, letters contain placeholders in square brackets.
- hh.ru is disabled by default. Its public API without authorization returned 403 from April 2026 (checked
  04.11.2026), and hh's terms do not allow parsing. Enabling it is your responsibility
  (`COLLECT_DEFAULTS.hh` in `src/collect.js`).
- The Telegram channel list and its activity were checked on 06.11.2026 and become outdated. The bot flags
  channels without posts for more than 14 days as replacement candidates.
- Buttons such as "Applied / Skip / Not for me" need a callback receiver, which this package does not include.
  `send.js` therefore sends link buttons and "Copy text" only.
- Currency rates in `src/profile.js` are dated 30.10.2026 and are not updated automatically.
- Verified on Windows locally. `.github/workflows/install-check.yml` runs the same steps on Ubuntu and Windows (Node 20 and 24).

## License

MIT. See [LICENSE](LICENSE).
