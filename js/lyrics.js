// LRCLIB (https://lrclib.net) から歌詞を取得する。無料・APIキー不要・CORS対応

const API = "https://lrclib.net/api";

// LRC形式 "[mm:ss.xx] text" を [{timeMs, text}] にパースする
function parseLrc(lrc) {
  const lines = [];
  for (const raw of lrc.split("\n")) {
    const m = raw.match(/^\s*\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (!m) continue;
    const timeMs = (parseInt(m[1], 10) * 60 + parseFloat(m[2])) * 1000;
    lines.push({ timeMs, text: m[3].trim() });
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

function toResult(record) {
  if (!record) return null;
  if (record.instrumental) return { instrumental: true, synced: null, plain: null };
  const synced = record.syncedLyrics ? parseLrc(record.syncedLyrics) : null;
  const plain = record.plainLyrics
    ? record.plainLyrics.split("\n").map((text) => ({ timeMs: null, text: text.trim() }))
    : null;
  if (!synced && !plain) return null;
  return { instrumental: false, synced, plain };
}

// 曲情報から歌詞を検索。見つからなければ null
export async function fetchLyrics(track) {
  const exact = new URLSearchParams({
    track_name: track.name,
    artist_name: track.artists[0],
    album_name: track.album,
    duration: Math.round(track.durationMs / 1000),
  });
  try {
    const res = await fetch(`${API}/get?${exact}`);
    if (res.ok) {
      const result = toResult(await res.json());
      if (result) return result;
    }
  } catch { /* fall through to search */ }

  // 完全一致で見つからない場合はあいまい検索で最も近いものを使う
  try {
    const q = new URLSearchParams({ track_name: track.name, artist_name: track.artists[0] });
    const res = await fetch(`${API}/search?${q}`);
    if (!res.ok) return null;
    const candidates = await res.json();
    const durationSec = track.durationMs / 1000;
    const best = candidates
      .filter((c) => c.syncedLyrics || c.plainLyrics)
      .sort((a, b) => Math.abs(a.duration - durationSec) - Math.abs(b.duration - durationSec))[0];
    return toResult(best);
  } catch {
    return null;
  }
}
