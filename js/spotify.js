// Spotify Web API 連携（Authorization Code with PKCE — クライアントシークレット不要）

const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SCOPES = "user-read-currently-playing user-read-playback-state";

const store = {
  get clientId() { return localStorage.getItem("ll_client_id"); },
  set clientId(v) { localStorage.setItem("ll_client_id", v); },
  get tokens() {
    const raw = localStorage.getItem("ll_tokens");
    return raw ? JSON.parse(raw) : null;
  },
  set tokens(v) {
    if (v) localStorage.setItem("ll_tokens", JSON.stringify(v));
    else localStorage.removeItem("ll_tokens");
  },
};

export function getRedirectUri() {
  return location.origin + location.pathname;
}

export function isConnected() {
  return !!(store.clientId && store.tokens);
}

export function disconnect() {
  store.tokens = null;
  localStorage.removeItem("ll_client_id");
  localStorage.removeItem("ll_verifier");
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 認可画面へリダイレクト
export async function startAuth(clientId) {
  store.clientId = clientId.trim();
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  localStorage.setItem("ll_verifier", verifier);
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  );
  const params = new URLSearchParams({
    client_id: store.clientId,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  location.href = `${AUTH_URL}?${params}`;
}

async function tokenRequest(body) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status}`);
  const data = await res.json();
  store.tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? store.tokens?.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
}

// リダイレクト後の ?code=... を処理。認証を完了したら true を返す
export async function handleAuthCallback() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return false;
  history.replaceState({}, "", getRedirectUri());
  await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(),
    client_id: store.clientId,
    code_verifier: localStorage.getItem("ll_verifier"),
  });
  return true;
}

async function getAccessToken() {
  const tokens = store.tokens;
  if (!tokens) throw new Error("not connected");
  if (Date.now() >= tokens.expires_at) {
    await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: store.clientId,
    });
  }
  return store.tokens.access_token;
}

// 再生中の曲を取得。何も再生していなければ null
export async function getCurrentlyPlaying() {
  const token = await getAccessToken();
  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return null;
  if (res.status === 401) { store.tokens = null; throw new Error("unauthorized"); }
  if (!res.ok) throw new Error(`currently-playing failed: ${res.status}`);
  const data = await res.json();
  if (!data.item || data.currently_playing_type !== "track") return null;
  return {
    id: data.item.id,
    name: data.item.name,
    artists: data.item.artists.map((a) => a.name),
    album: data.item.album.name,
    albumArt: data.item.album.images?.[1]?.url ?? data.item.album.images?.[0]?.url,
    durationMs: data.item.duration_ms,
    progressMs: data.progress_ms,
    isPlaying: data.is_playing,
    fetchedAt: Date.now(),
  };
}
