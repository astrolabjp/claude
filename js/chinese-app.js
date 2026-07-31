// 中国語特化モード: 歌詞にピンインをルビ表示し、タップで日本語の意味＋ピンインを表示する

import * as spotify from "./spotify.js";
import { fetchLyrics } from "./lyrics.js";
import { lookupChinese, translateUrlZh } from "./dictionary-zh.js";
import { loadPinyin, toPinyin, hasHan } from "./pinyin.js";

const $ = (id) => document.getElementById(id);

const state = {
  track: null,
  lyrics: null,
  lyricsFor: null,
  lyricsAttempts: 0,
  activeLine: -1,
  stopped: false,
  pinyinReady: false,
};

const MAX_LYRICS_ATTEMPTS = 3;

// ---------- 画面切り替え ----------

function showSetup() {
  $("setup-screen").classList.remove("hidden");
  $("player-screen").classList.add("hidden");
}

function showPlayer() {
  $("setup-screen").classList.add("hidden");
  $("player-screen").classList.remove("hidden");
}

// ---------- 歌詞レンダリング ----------

// 中国語向けの単語分割。Intl.Segmenter を zh ロケールで使う
function segmentLine(text) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
    return [...segmenter.segment(text)].map((s) => ({
      text: s.segment,
      isWord: s.isWordLike,
    }));
  }
  return [{ text, isWord: true }];
}

function buildWordEl(wordText) {
  const span = document.createElement("span");
  span.className = "word";
  const py = state.pinyinReady ? toPinyin(wordText) : null;
  if (py) {
    const ruby = document.createElement("ruby");
    ruby.appendChild(document.createTextNode(wordText));
    const rt = document.createElement("rt");
    rt.textContent = py;
    ruby.appendChild(rt);
    span.appendChild(ruby);
    span.dataset.word = wordText;
  } else {
    span.textContent = wordText;
    span.dataset.word = wordText;
  }
  span.addEventListener("click", () => openDictionary(wordText, span));
  return span;
}

function renderLyrics() {
  const container = $("lyrics-lines");
  container.innerHTML = "";
  state.activeLine = -1;

  const status = $("lyrics-status");
  if (!state.track) {
    status.textContent = "Spotifyで曲を再生してください…";
    status.classList.remove("hidden");
    return;
  }
  if (!state.lyrics) {
    status.textContent = "この曲の歌詞は見つかりませんでした 😢";
    status.classList.remove("hidden");
    return;
  }
  if (state.lyrics.instrumental) {
    status.textContent = "♪ インストゥルメンタル曲です";
    status.classList.remove("hidden");
    return;
  }
  status.classList.add("hidden");

  const lines = state.lyrics.synced ?? state.lyrics.plain;
  for (const line of lines) {
    const div = document.createElement("div");
    div.className = "lyric-line zh-line";
    if (line.text === "") {
      div.innerHTML = "&nbsp;";
    } else {
      for (const seg of segmentLine(line.text)) {
        if (seg.isWord) {
          div.appendChild(buildWordEl(seg.text));
        } else {
          div.appendChild(document.createTextNode(seg.text));
        }
      }
    }
    container.appendChild(div);
  }
}

function syncActiveLine() {
  if (!state.track?.isPlaying || !state.lyrics?.synced) return;
  const progress = state.track.progressMs + (Date.now() - state.track.fetchedAt);
  const lines = state.lyrics.synced;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= progress) idx = i;
    else break;
  }
  if (idx === state.activeLine) return;
  state.activeLine = idx;

  const els = $("lyrics-lines").children;
  for (let i = 0; i < els.length; i++) {
    els[i].classList.toggle("active", i === idx);
    els[i].classList.toggle("past", i < idx);
  }
  if (idx >= 0) els[idx].scrollIntoView({ behavior: "smooth", block: "center" });
}

// ---------- 辞書パネル ----------

let selectedWordEl = null;

async function openDictionary(word, el) {
  word = word.trim();
  if (!word) return;

  if (selectedWordEl) selectedWordEl.classList.remove("selected");
  selectedWordEl = el;
  el.classList.add("selected");

  $("dict-panel").classList.remove("hidden");
  $("dict-word").textContent = word;
  $("dict-pinyin").textContent = (state.pinyinReady && toPinyin(word)) || "";
  $("dict-translate-link").href = translateUrlZh(word);
  const body = $("dict-body");
  body.innerHTML = '<div class="dict-loading">検索中…</div>';

  const result = await lookupChinese(word);
  if ($("dict-word").textContent !== word) return; // 別の単語が選ばれた

  body.innerHTML = "";

  if (!result) {
    body.innerHTML = '<div class="dict-empty">意味が見つかりませんでした。下のGoogle翻訳リンクをお試しください。</div>';
    return;
  }

  if (result.japanese) {
    const label = document.createElement("div");
    label.className = "dict-lang";
    label.textContent = "日本語訳";
    body.appendChild(label);
    const p = document.createElement("div");
    p.className = "dict-ja";
    p.textContent = result.japanese;
    body.appendChild(p);
  }

  if (result.wiktionary) {
    const label = document.createElement("div");
    label.className = "dict-lang";
    label.textContent = "詳しい定義（Wiktionary・英語）";
    body.appendChild(label);
    for (const entry of result.wiktionary) {
      if (entry.partOfSpeech) {
        const pos = document.createElement("div");
        pos.className = "dict-pos";
        pos.textContent = entry.partOfSpeech;
        body.appendChild(pos);
      }
      const ul = document.createElement("ul");
      ul.className = "dict-defs";
      for (const def of entry.definitions) {
        const li = document.createElement("li");
        li.textContent = def;
        ul.appendChild(li);
      }
      body.appendChild(ul);
    }
  }
}

function closeDictionary() {
  $("dict-panel").classList.add("hidden");
  if (selectedWordEl) selectedWordEl.classList.remove("selected");
  selectedWordEl = null;
}

// ---------- ポーリングループ ----------

async function poll() {
  try {
    let track = null;
    try {
      track = await spotify.getCurrentlyPlaying();
    } catch (e) {
      if (e.message === "unauthorized") {
        state.stopped = true;
        showSetup();
        return;
      }
    }

    const changed = track?.id !== state.track?.id;
    state.track = track;

    $("track-name").textContent = track?.name ?? "—";
    $("artist-name").textContent = track ? track.artists.join(", ") : "再生中の曲がありません";
    if (track?.albumArt) $("album-art").src = track.albumArt;

    if (changed) {
      closeDictionary();
      state.lyrics = null;
      state.lyricsFor = null;
      state.lyricsAttempts = 0;
      renderLyrics();
    }

    if (track && state.lyricsFor !== track.id && state.lyricsAttempts < MAX_LYRICS_ATTEMPTS) {
      const status = $("lyrics-status");
      status.textContent = "歌詞を検索中…";
      status.classList.remove("hidden");
      state.lyricsAttempts++;
      try {
        const lyrics = await fetchLyrics(track);
        if (state.track?.id !== track.id) return;
        state.lyrics = lyrics;
        state.lyricsFor = track.id;
        renderLyrics();
      } catch {
        if (state.lyricsAttempts >= MAX_LYRICS_ATTEMPTS && state.track?.id === track.id) {
          status.textContent = "歌詞サーバーに接続できませんでした。ネットワークを確認してください。";
        }
      }
    }
  } finally {
    if (!state.stopped) setTimeout(poll, 2000);
  }
}

setInterval(syncActiveLine, 300);

// ---------- 初期化 ----------

$("logout-btn").addEventListener("click", () => {
  spotify.disconnect();
  location.href = "index.html";
});

$("dict-close").addEventListener("click", closeDictionary);

$("pinyin-toggle").addEventListener("click", () => {
  const on = $("lyrics-container").classList.toggle("hide-pinyin");
  $("pinyin-toggle").classList.toggle("active", !on);
});

(async function init() {
  if (!spotify.isConnected()) {
    showSetup();
    return;
  }
  showPlayer();
  poll();
  // ピンインライブラリは裏で読み込み、準備でき次第ルビ付きで再描画
  loadPinyin().then((ok) => {
    state.pinyinReady = ok;
    if (ok && state.lyrics) renderLyrics();
  });
})();
