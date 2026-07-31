import * as spotify from "./spotify.js";
import { fetchLyrics } from "./lyrics.js";
import { lookupWord, translateUrl } from "./dictionary.js";

const $ = (id) => document.getElementById(id);

const state = {
  track: null,        // 現在の曲（spotify.getCurrentlyPlaying の戻り値）
  lyrics: null,       // fetchLyrics の戻り値
  lyricsFor: null,    // 歌詞取得が完了した曲のID（失敗時はセットせずリトライ）
  lyricsAttempts: 0,
  activeLine: -1,
};

const MAX_LYRICS_ATTEMPTS = 3;

// ---------- 画面切り替え ----------

function showSetup(errorMsg) {
  $("setup-screen").classList.remove("hidden");
  $("player-screen").classList.add("hidden");
  $("redirect-uri-display").textContent = spotify.getRedirectUri();
  const old = document.querySelector(".error-msg");
  if (old) old.remove();
  if (errorMsg) {
    const p = document.createElement("p");
    p.className = "error-msg";
    p.textContent = errorMsg;
    $("connect-btn").after(p);
  }
}

function showPlayer() {
  $("setup-screen").classList.add("hidden");
  $("player-screen").classList.remove("hidden");
}

// ---------- 歌詞レンダリング ----------

// 行テキストを「クリック可能な単語」と「区切り文字」に分割する。
// Intl.Segmenter が使える環境では日本語・中国語などの分かち書きにも対応。
function segmentLine(text) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    return [...segmenter.segment(text)].map((s) => ({
      text: s.segment,
      isWord: s.isWordLike,
    }));
  }
  return text.split(/(\s+)/).map((part) => ({
    text: part,
    isWord: /\p{L}/u.test(part),
  }));
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
    div.className = "lyric-line";
    if (line.text === "") {
      div.innerHTML = "&nbsp;";
    } else {
      for (const seg of segmentLine(line.text)) {
        if (seg.isWord) {
          const span = document.createElement("span");
          span.className = "word";
          span.textContent = seg.text;
          span.addEventListener("click", () => openDictionary(span));
          div.appendChild(span);
        } else {
          div.appendChild(document.createTextNode(seg.text));
        }
      }
    }
    container.appendChild(div);
  }
}

// 再生位置に合わせてアクティブ行をハイライト＆スクロール
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

async function openDictionary(el) {
  const word = el.textContent.replace(/[.,!?"“”'’;:()\[\]…]+$/g, "").replace(/^[.,!?"“”'’;:()\[\]…]+/g, "");
  if (!word) return;

  if (selectedWordEl) selectedWordEl.classList.remove("selected");
  selectedWordEl = el;
  el.classList.add("selected");

  $("dict-panel").classList.remove("hidden");
  $("dict-word").textContent = word;
  $("dict-translate-link").href = translateUrl(word);
  const body = $("dict-body");
  body.innerHTML = '<div class="dict-loading">検索中…</div>';

  const entries = await lookupWord(word);
  if ($("dict-word").textContent !== word) return; // 別の単語が選ばれた

  if (!entries) {
    body.innerHTML = '<div class="dict-empty">辞書に見つかりませんでした。下のGoogle翻訳リンクをお試しください。</div>';
    return;
  }
  body.innerHTML = "";
  for (const entry of entries) {
    const lang = document.createElement("div");
    lang.className = "dict-lang";
    lang.textContent = entry.language;
    const pos = document.createElement("span");
    pos.className = "dict-pos";
    pos.textContent = entry.partOfSpeech ? ` — ${entry.partOfSpeech}` : "";
    lang.appendChild(pos);
    body.appendChild(lang);

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
        showSetup("Spotifyの認証が切れました。再度連携してください。");
        return; // ループ停止
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

    // 歌詞が未取得ならフェッチ。通信失敗時は次のポーリングでリトライ
    if (track && state.lyricsFor !== track.id && state.lyricsAttempts < MAX_LYRICS_ATTEMPTS) {
      const status = $("lyrics-status");
      status.textContent = "歌詞を検索中…";
      status.classList.remove("hidden");
      state.lyricsAttempts++;
      try {
        const lyrics = await fetchLyrics(track);
        if (state.track?.id !== track.id) return; // フェッチ中に曲が変わった
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

// 同期ハイライトはポーリングより細かく更新して滑らかに
setInterval(syncActiveLine, 300);

// ---------- 初期化 ----------

$("connect-btn").addEventListener("click", () => {
  const clientId = $("client-id-input").value.trim();
  if (!clientId) return showSetup("Client IDを入力してください。");
  spotify.startAuth(clientId);
});

$("logout-btn").addEventListener("click", () => {
  spotify.disconnect();
  location.reload();
});

$("dict-close").addEventListener("click", closeDictionary);

(async function init() {
  try {
    if (await spotify.handleAuthCallback()) {
      showPlayer();
      poll();
      return;
    }
  } catch {
    showSetup("認証に失敗しました。Client IDとRedirect URIの設定を確認してください。");
    return;
  }
  if (spotify.isConnected()) {
    showPlayer();
    poll();
  } else {
    showSetup();
  }
})();
