// ピンイン変換。pinyin-pro をCDNから動的に読み込む。
// オフライン等で読み込めない場合は null を返し、アプリはピンインなしで動作する。

let pinyinFn = null;
let loadPromise = null;

export function loadPinyin() {
  if (!loadPromise) {
    loadPromise = import("https://cdn.jsdelivr.net/npm/pinyin-pro@3.26.0/+esm")
      .then((mod) => { pinyinFn = mod.pinyin; return true; })
      .catch(() => false);
  }
  return loadPromise;
}

export function hasHan(text) {
  return /\p{Script=Han}/u.test(text);
}

// 単語のピンインを返す（例: "告白" → "gào bái"）。変換不可なら null
export function toPinyin(text) {
  if (!pinyinFn || !hasHan(text)) return null;
  try {
    return pinyinFn(text);
  } catch {
    return null;
  }
}
