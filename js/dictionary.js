// 単語の意味を調べる。Wiktionary REST API（多言語対応）を優先し、
// 英単語は Free Dictionary API にもフォールバックする。

const cache = new Map();

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent.trim();
}

// https://en.wiktionary.org/api/rest_v1/page/definition/{word}
// → { "en": [...], "fr": [...] } のように言語ごとの定義が返る
async function lookupWiktionary(word) {
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}?redirect=true`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const entries = [];
  for (const langEntries of Object.values(data)) {
    for (const entry of langEntries) {
      const definitions = (entry.definitions ?? [])
        .map((d) => stripHtml(d.definition ?? ""))
        .filter(Boolean)
        .slice(0, 5);
      if (definitions.length === 0) continue;
      entries.push({
        language: entry.language,
        partOfSpeech: entry.partOfSpeech,
        definitions,
      });
    }
  }
  return entries.length ? entries : null;
}

async function lookupFreeDictionary(word) {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const entries = [];
  for (const item of data) {
    for (const meaning of item.meanings ?? []) {
      const definitions = (meaning.definitions ?? [])
        .map((d) => d.definition)
        .filter(Boolean)
        .slice(0, 5);
      if (definitions.length === 0) continue;
      entries.push({
        language: "English",
        partOfSpeech: meaning.partOfSpeech,
        definitions,
      });
    }
  }
  return entries.length ? entries : null;
}

// 定義のリストを返す。見つからなければ null
export async function lookupWord(word) {
  const key = word.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  let result = null;
  const attempts = [word];
  // 文頭の大文字などで引っかからないよう小文字でも試す
  if (word !== key) attempts.push(key);

  for (const w of attempts) {
    try { result = await lookupWiktionary(w); } catch { /* try next */ }
    if (result) break;
  }
  if (!result) {
    try { result = await lookupFreeDictionary(key); } catch { /* not found */ }
  }

  cache.set(key, result);
  return result;
}

export function translateUrl(word) {
  return `https://translate.google.com/?sl=auto&tl=ja&text=${encodeURIComponent(word)}&op=translate`;
}
