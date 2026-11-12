/** Zero-width, format, and soft hyphen characters often used to bypass filters */
const invisibleChars =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF]/g;

/** Cyrillic (and similar) letters that look like Latin — map after NFKC */
const homoglyphToLatin = {
  а: 'a',
  А: 'a',
  е: 'e',
  Е: 'e',
  о: 'o',
  О: 'o',
  р: 'p',
  Р: 'p',
  с: 'c',
  С: 'c',
  у: 'y',
  У: 'y',
  х: 'x',
  Х: 'x',
  і: 'i',
  І: 'i',
  ѕ: 's',
  Ѕ: 's'
};

function normalizeForModeration(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return '';
  let s = raw.normalize('NFKC').replace(invisibleChars, '');
  let out = '';
  for (const ch of s) {
    out += homoglyphToLatin[ch] !== undefined ? homoglyphToLatin[ch] : ch;
  }
  return out.toLocaleLowerCase('en');
}

const mildLanguage = /\b(?:ass|crap|damn|hell|idiot|stupid)\b/i;
const strongLanguage = /\b(?:bastard|bitch|bullshit|f[u*]+ck(?:ing|ed|er|ers|s)?|motherfucker|shit(?:ty|ting|s)?)\b/i;
const suggestiveContent = /\b(?:boobs?|horny|kinky|make ?out|sexy)\b/i;
const explicitContent = /\b(?:blowjob|cock|dildo|dick|nudes?|orgasm|penis|porn|pussy|sex(?:ual)?|vagina)\b/i;

export function violatesContentSetting(body, setting) {
  if (setting === 'adult') return false;
  const text = normalizeForModeration(body);
  if (!text) return false;
  if (explicitContent.test(text)) return true;
  // For 7+–13+, block any substring "sex" after normalization (sexy, sеxу with Cyrillic letters, etc.)
  if (['7+', '10+', '13+'].includes(setting) && text.includes('sex')) return true;
  if (setting === '7+' && mildLanguage.test(text)) return true;
  if (['7+', '10+', '13+'].includes(setting) && strongLanguage.test(text)) return true;
  if (['7+', '10+'].includes(setting) && suggestiveContent.test(text)) return true;
  return false;
}
