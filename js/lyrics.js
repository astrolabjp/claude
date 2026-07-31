// LRCLIB (https://lrclib.net) から歌詞を取得する。無料・APIキー不要・CORS対応

const API = "https://lrclib.net/api";
const TIMEOUT_MS = 8000;

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

// 曲の長さが近い候補を優先して選ぶ
function pickBest(candidates, durationSec) {
  return candidates
    .filter((c) => c.syncedLyrics || c.plainLyrics || c.instrumental)
    .sort((a, b) => Math.abs((a.duration ?? 0) - durationSec) - Math.abs((b.duration ?? 0) - durationSec))[0];
}

// 曲情報から歌詞を検索。見つからなければ null、全リクエストが通信失敗なら throw
export async function fetchLyrics(track) {
  const durationSec = track.durationMs / 1000;
  let attempts = 0;
  let failures = 0;

  async function apiGet(path, params) {
    attempts++;
    try {
      const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      failures++;
      return null;
    }
  }

  // 戦略1: 完全一致（曲名・アーティスト・アルバム・長さ）
  const exact = await apiGet("get", {
    track_name: track.name,
    artist_name: track.artists[0],
    album_name: track.album,
    duration: Math.round(durationSec),
  });
  const exactResult = toResult(exact);
  if (exactResult) return exactResult;

  // 戦略2: 曲名＋アーティスト名で検索
  const byArtist = await apiGet("search", {
    track_name: track.name,
    artist_name: track.artists[0],
  });
  if (Array.isArray(byArtist) && byArtist.length) {
    const result = toResult(pickBest(byArtist, durationSec));
    if (result) return result;
  }

  // 戦略3: 曲名のみで検索
  // Spotifyがアーティスト名をローカライズして返す場合（例: 周杰倫→ジェイ・チョウ）
  // でも、曲名だけならヒットすることが多い
  const byName = await apiGet("search", { q: track.name });
  if (Array.isArray(byName) && byName.length) {
    const result = toResult(pickBest(byName, durationSec));
    if (result) return result;
  }

  if (failures >= attempts) throw new Error("lyrics network error");
  return null;
}
