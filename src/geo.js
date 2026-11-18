// Язык и регион вакансии: работодатели берут кандидатов с письменным английским и живым переводом, а искать
// надо по всему миру (удалёнка любых стран), не только по СНГ. Чистые функции без сети: признак языка, регион (или
// несколько), асинхронная работа. Всё из названия, региона и текста вакансии — недоверенные данные, как команды не исполняются.
// Язык:  ru — русская вакансия; en_written — английская, письменного хватает; en_spoken — нужен разговорный (помечаем, не отсекаем).
// Регион: world — открыта любой стране; cis / europe / usa / asia — только эти; other — Латинская Америка, Африка и прочее.
import { RISKS } from './profile.js';

export const LANGS = { ru: 'русский', en_written: 'англ. письменный', en_spoken: 'нужен разговорный' };
export const REGIONS = { world: 'Весь мир', cis: 'СНГ', europe: 'Европа', usa: 'США', asia: 'Азия', other: 'Другое' };
/** Площадки, где вакансии русскоязычные и для СНГ (hh, Хабр Карьера, Telegram-каналы). */
const CIS_SITES = new Set(['ru', 'kz', 'habr', 'telegram']);
const EN_SITE_IDS = new Set(['hn', 'remoteok', 'wwr', 'cryptojobs', 'himalayas', 'remotive']);

// Нужен свободный / разговорный английский (по-русски и по-английски). Письменный и «читать документацию» — не оно.
const SPOKEN_EN = [
  RISKS.find((r) => r.why === 'нужен английский')?.re,
  /(fluent|native|excellent|advanced|professional|proficient|business|upper[- ]intermediate|c1|c2|b2)[ -]+(level )?(english|spoken)/i,
  /(spoken|verbal|oral)[ -]+(and written )?(english|communication[^.\n]{0,15}english)|english[ -]+(speaking|conversation)/i,
  /english[^.\n]{0,40}(fluen|native|proficien|c1\b|c2\b|b2\b|upper[- ]intermediate)/i,
  /fluen(t|cy)[^.\n]{0,20}english/i,
].filter(Boolean);

// Асинхронная или письменная работа — для кандидата плюс: письма и разговоры идут через переводчика.
const ASYNC_WORK =
  /\basync(?:hronous(?:ly)?)?[- ](?:first|communication|work|culture|team|environment|collaborat\w*|remote|company|workflow)|work(?:s|ing)? (?:fully |mostly )?async(?:hronous(?:ly)?)?\b|asynchronous(?:ly)? (?:communication|work)|written (?:english|communication)|strong (?:written|writing)|write well|documentation[- ]first|асинхронн[а-яё]* (?:работ|коммуникац|формат|режим|общени)|письменн[а-яё]* (?:общени|коммуникац)/i;

export const isAsyncWork = (text) => ASYNC_WORK.test(String(text ?? ''));

const cyr = (s) => (String(s).match(/[а-яё]/gi) || []).length;
const lat = (s) => (String(s).match(/[a-z]/gi) || []).length;

/** Вакансия написана по-английски: английские ленты или текст почти без кириллицы. */
export function isEnglishText(v) {
  if (EN_SITE_IDS.has(v.site)) return true;
  const s = `${v.title ?? ''} ${String(v.description || v.text || '').slice(0, 800)}`;
  return lat(s) > 0 && cyr(s) < lat(s) * 0.25;
}

/** Нужен ли разговорный английский — по тексту (название, описание, текст ленты). */
export function needsSpoken(v) {
  const s = `${v.title ?? ''}\n${v.description ?? ''}\n${v.text ?? ''}`;
  return SPOKEN_EN.some((re) => re.test(s));
}

/** Язык вакансии: ru / en_written / en_spoken. */
export function langOf(v) {
  if (needsSpoken(v)) return 'en_spoken';
  return isEnglishText(v) ? 'en_written' : 'ru';
}

/** «Подходит мне» по языку: русский и письменный английский (перевод живой — у кандидата есть). */
export const langFits = (lang) => lang === 'ru' || lang === 'en_written';

// Слова регионов — для короткого поля «регион» (у площадок оно явное: «USA Only», «Europe», «remote: Thailand, Vietnam»).
const KEYWORDS = {
  // US / EU / UK — только заглавными (отдельная проверка в classes): «us» в тексте — местоимение
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
// «Удалёнка только для своего региона» в тексте вакансии (то же правило, что штраф в lib.js, но с хвостом: «… in Germany»).
// «Компания находится в …» — не ограничение для кандидата, поэтому голых «located in / based in» здесь нет.
const RESTRICT =
  /\b(?:latam|latin america|us[- ]only|usa only|u\.s\. only|us[- ]based|eu[- ]only|north america only|within the us|canada only|uk only|europe only|emea only|(?:must (?:be )?(?:located|based|reside) in|residents? of|candidates? (?:in|from))\s+[a-z ,/&.-]{2,40})/i;

const classes = (s) => {
  const out = Object.keys(KEYWORDS).filter((k) => KEYWORDS[k].test(s));
  if (/\bUS\b/.test(s) && !out.includes('usa')) out.push('usa');
  if (/\b(EU|UK)\b/.test(s) && !out.includes('europe')) out.push('europe');
  return out;
};

/** Какие регионы называет короткая строка («Remote (EU)», «London, UK»): список из usa / europe / asia / cis / other, пусто — ни одного. */
export const regionClasses = classes;

/**
 * Регион вакансии: список из world / cis / europe / usa / asia / other. Русскоязычные площадки — СНГ. Английские: поле
 * «регион» площадки; нет ограничений там — ищем их в начале текста; нет нигде — весь мир (удалёнка открыта любой стране).
 * @returns {string[]}
 */
export function geoOf(v) {
  if (CIS_SITES.has(v.site)) return ['cis'];
  const region = String(v.region ?? '');
  const fromRegion = classes(region);
  if (fromRegion.length) return fromRegion;
  // HN: место работы — в первой строке комментария («Компания | Роль | Remote (US/EU) | …»)
  const text = String(v.text ?? '');
  // у HN первая строка бывает целым абзацем — берём только короткие части «Компания | Роль | Место | …»
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

/** Язык, регион, асинхронность одной вакансии — всё, что экран и фильтры берут из текста. */
export function classify(v) {
  return { lang: langOf(v), geo: geoOf(v), async: isAsyncWork(`${v.title ?? ''}\n${v.description ?? ''}\n${v.text ?? ''}`) };
}

/** Регион подходит под фильтр: пусто — «весь мир» (без ограничений); иначе вакансия этого региона или открытая всему миру. */
export function geoMatches(geo, want) {
  if (!want || want === 'world') return true;
  const g = Array.isArray(geo) && geo.length ? geo : ['world'];
  return g.includes(want) || g.includes('world');
}

/** Язык подходит под фильтр: all — любой; fit — «подходит мне»; иначе точное значение. */
export function langMatches(lang, want) {
  if (!want || want === 'all') return true;
  if (want === 'fit') return langFits(lang);
  return lang === want;
}
