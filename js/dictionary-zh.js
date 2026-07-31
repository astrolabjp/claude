// 中国語の単語 → 日本語の意味を調べる。
// 日本語訳: MyMemory 翻訳API（無料・キー不要・CORS対応）
// 参考定義: 英語Wiktionary の Chinese エントリ

const cache = new Map();

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent.trim();
}

async function fetchJapanese(word) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=zh-CN%7Cja`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.responseData?.translatedText?.trim();
  // API がエラーメッセージを translatedText に入れて返すことがあるので弾く
  if (!text || /INVALID|QUERY LENGTH|NO QUERY/i.test(text)) return null;
  return text;
}

async function fetchWiktionaryChinese(word) {
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}?redirect=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  const entries = [];
  for (const langEntries of Object.values(data)) {
    for (const entry of langEntries) {
      if (entry.language !== "Chinese") continue;
      const definitions = (entry.definitions ?? [])
        .map((d) => stripHtml(d.definition ?? ""))
        .filter(Boolean)
        .slice(0, 5);
      if (definitions.length === 0) continue;
      entries.push({ partOfSpeech: entry.partOfSpeech, definitions });
    }
  }
  return entries.length ? entries : null;
}

// { japanese: string|null, wiktionary: [{partOfSpeech, definitions}]|null } を返す
export async function lookupChinese(word) {
  if (cache.has(word)) return cache.get(word);

  const [japanese, wiktionary] = await Promise.all([
    fetchJapanese(word).catch(() => null),
    fetchWiktionaryChinese(word).catch(() => null),
  ]);

  const result = japanese || wiktionary ? { japanese, wiktionary } : null;
  cache.set(word, result);
  return result;
}

export function translateUrlZh(word) {
  return `https://translate.google.com/?sl=zh-CN&tl=ja&text=${encodeURIComponent(word)}&op=translate`;
}
