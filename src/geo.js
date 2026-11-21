// Language and region of a vacancy: employers take candidates with written English and live translation, and search
// must cover the whole world (remote work from any country), not only the CIS. Pure functions without network: the language sign, region (or
// several), async work. Everything comes from the title, region and vacancy text: untrusted data, never executed as commands.
// Language:  ru: a Russian vacancy; en_written: English, written is enough; en_spoken: spoken is needed (flagged, not cut).
// Region: world: open to any country; cis / europe / usa / asia: only these; other: Latin America, Africa and the rest.
import { RISKS } from './profile.js';

export const LANGS = { ru: 'русский', en_written: 'англ. письменный', en_spoken: 'нужен разговорный' };
export const REGIONS = { world: 'Весь мир', cis: 'СНГ', europe: 'Европа', usa: 'США', asia: 'Азия', other: 'Другое' };
/** Platforms where the vacancies are Russian-speaking and for the CIS (hh, Habr Career, Telegram channels). */
const CIS_SITES = new Set(['ru', 'kz', 'habr', 'telegram']);
const EN_SITE_IDS = new Set(['hn', 'remoteok', 'wwr', 'cryptojobs', 'himalayas', 'remotive']);

// Needs free / spoken English (in Russian and in English). Written and "read the documentation" is not it.
const SPOKEN_EN = [
  RISKS.find((r) => r.why === 'нужен английский')?.re,
  /(fluent|native|excellent|advanced|professional|proficient|business|upper[- ]intermediate|c1|c2|b2)[ -]+(level )?(english|spoken)/i,
  /(spoken|verbal|oral)[ -]+(and written )?(english|communication[^.\n]{0,15}english)|english[ -]+(speaking|conversation)/i,
  /english[^.\n]{0,40}(fluen|native|proficien|c1\b|c2\b|b2\b|upper[- ]intermediate)/i,
  /fluen(t|cy)[^.\n]{0,20}english/i,
].filter(Boolean);

// Asynchronous or written work is a plus for the candidate: letters and conversations go through a translator.
const ASYNC_WORK =
  /\basync(?:hronous(?:ly)?)?[- ](?:first|communication|work|culture|team|environment|collaborat\w*|remote|company|workflow)|work(?:s|ing)? (?:fully |mostly )?async(?:hronous(?:ly)?)?\b|asynchronous(?:ly)? (?:communication|work)|written (?:english|communication)|strong (?:written|writing)|write well|documentation[- ]first|асинхронн[а-яё]* (?:работ|коммуникац|формат|режим|общени)|письменн[а-яё]* (?:общени|коммуникац)/i;

export const isAsyncWork = (text) => ASYNC_WORK.test(String(text ?? ''));

const cyr = (s) => (String(s).match(/[а-яё]/gi) || []).length;
const lat = (s) => (String(s).match(/[a-z]/gi) || []).length;

/** The vacancy is written in English: English feeds or text with almost no Cyrillic. */
export function isEnglishText(v) {
  if (EN_SITE_IDS.has(v.site)) return true;
  const s = `${v.title ?? ''} ${String(v.description || v.text || '').slice(0, 800)}`;
  return lat(s) > 0 && cyr(s) < lat(s) * 0.25;
}

/** Whether spoken English is needed, by the text (title, description, feed text). */
export function needsSpoken(v) {
  const s = `${v.title ?? ''}\n${v.description ?? ''}\n${v.text ?? ''}`;
  return SPOKEN_EN.some((re) => re.test(s));
}

/** Language of the vacancy: ru / en_written / en_spoken. */
export function langOf(v) {
  if (needsSpoken(v)) return 'en_spoken';
  return isEnglishText(v) ? 'en_written' : 'ru';
}

/** "Fits me" by language: Russian and written English (the translation is live: the candidate has one). */
export const langFits = (lang) => lang === 'ru' || lang === 'en_written';

// Region words for the short "region" field (the platforms have it explicit: "USA Only", "Europe", "remote: Thailand, Vietnam").
const KEYWORDS = {
  // US / EU / UK: uppercase only (a separate check in classes): "us" in the text is a pronoun
  usa: /\b(usa|u\.s\.a?\.?|united states|north america|americas|canada)\b/i,
  europe:
    /\b(europe|european|emea|united kingdom|england|germany|france|spain|poland|portugal|netherlands|ireland|italy|sweden|norway|finland|denmark|switzerland|austria|belgium|czech\w*|romania|lithuania|latvia|estonia|bulgaria|greece|cet|cest)\b/i,
  asia: /\b(asia|apac|asia-pacific|thailand|singapore|india|japan|china|philippines|vietnam|indonesia|bali|malaysia|korea|hong kong|taiwan|pakistan|bangladesh|sri lanka|nepal)\b/i,
  cis: /\b(cis|russia|belarus|kazakhstan|armenia|georgia|uzbekistan|azerbaijan|kyrgyz\w*|ukraine|moldova)\b|снг|росси|казахстан|беларус|украин/i,
  other:
    /\b(latam|latin america|argentina|brazil|mexico|colombia|chile|peru|africa|nigeria|kenya|south africa|egypt|middle east|australia|new zealand|oceania|turkey|israel|uae|dubai|saudi)\b/i,
};
const WORLD =
  /\b(anywhere|worldwide|world-wide|global(?:ly)?|any ?where in the world|all countries|any country)\b|любой (?:страны|точки мира)/i;
// "Remote only for its region" in the vacancy text (the same rule as the penalty in lib.js, but with a tail: "… in Germany").
// "The company is located in …" is not a restriction for the candidate, so bare "located in / based in" are not here.
const RESTRICT =
  /\b(?:latam|latin america|us[- ]only|usa only|u\.s\. only|us[- ]based|eu[- ]only|north america only|within the us|canada only|uk only|europe only|emea only|(?:must (?:be )?(?:located|based|reside) in|residents? of|candidates? (?:in|from))\s+[a-z ,/&.-]{2,40})/i;

const classes = (s) => {
  const out = Object.keys(KEYWORDS).filter((k) => KEYWORDS[k].test(s));
  if (/\bUS\b/.test(s) && !out.includes('usa')) out.push('usa');
  if (/\b(EU|UK)\b/.test(s) && !out.includes('europe')) out.push('europe');
  return out;
};

/** Which regions a short string names ("Remote (EU)", "London, UK"): a list of usa / europe / asia / cis / other; empty means none. */
export const regionClasses = classes;

/**
 * Vacancy region: a list of world / cis / europe / usa / asia / other. Russian-speaking platforms are CIS. For English ones: the
 * platform's "region" field; if there are no restrictions there, we look for them at the start of the text; nowhere means the whole world (remote is open to any country).
 * @returns {string[]}
 */
export function geoOf(v) {
  if (CIS_SITES.has(v.site)) return ['cis'];
  const region = String(v.region ?? '');
  const fromRegion = classes(region);
  if (fromRegion.length) return fromRegion;
  // HN: place of work is in the first line of the comment ("Company | Role | Remote (US/EU) | …")
  const text = String(v.text ?? '');
  // the HN first line is sometimes a whole paragraph; we take only the short parts "Company | Role | Place | …"
  const head =
    v.site === 'hn'
      ? text
          .split('\n')[0]
          .split('|')
          .filter((p) => p.length <= 70)
          .join(' | ')
      : `${v.title ?? ''} ${text.slice(0, 1500)}`;
  const hit = RESTRICT.exec(head);
  if (hit) {
    const c = classes(hit[0]);
    if (c.length) return c;
    if (/latam|latin america/i.test(hit[0])) return ['other'];
  }
  if (v.site === 'hn' && !WORLD.test(head)) {
    const c = classes(head);
    if (c.length) return c;
  }
  return ['world'];
}

/** Language, region, asynchrony of one vacancy: everything the screen and filters take from the text. */
export function classify(v) {
  return { lang: langOf(v), geo: geoOf(v), async: isAsyncWork(`${v.title ?? ''}\n${v.description ?? ''}\n${v.text ?? ''}`) };
}

/** The region fits the filter: empty means "whole world" (no restrictions); otherwise a vacancy of this region or one open to the whole world. */
export function geoMatches(geo, want) {
  if (!want || want === 'world') return true;
  const g = Array.isArray(geo) && geo.length ? geo : ['world'];
  return g.includes(want) || g.includes('world');
}

/** The language fits the filter: all means any; fit means "fits me"; otherwise the exact value. */
export function langMatches(lang, want) {
  if (!want || want === 'all') return true;
  if (want === 'fit') return langFits(lang);
  return lang === want;
}
