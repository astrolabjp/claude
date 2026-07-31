# 🎵 Lyric Lens

Spotifyで再生中の曲の歌詞をリアルタイム表示し、**歌詞の単語をタップすると辞書で意味を調べられる** Webアプリです。外国語の音楽を聴きながら語彙を増やしたい人向け。

## 機能

- **Spotify連携** — 再生中の曲を自動検出（PKCE認証、サーバー不要でブラウザだけで動作）
- **同期歌詞表示** — [LRCLIB](https://lrclib.net)（無料・APIキー不要）から歌詞を取得し、再生位置に合わせてカラオケ風にハイライト＆自動スクロール。同期歌詞がない曲はプレーン歌詞を表示
- **タップ辞書** — 歌詞の単語をクリック/タップすると Wiktionary（多言語対応）で意味を表示。英単語は Free Dictionary API にもフォールバック。見つからない場合は Google翻訳へのリンクを表示
- **多言語の分かち書き対応** — `Intl.Segmenter` により、日本語・中国語などスペース区切りのない言語の歌詞でも単語単位でタップ可能

## セットアップ

### 1. Spotifyアプリを登録する

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) にログインし「Create app」
2. **Redirect URI** に `http://127.0.0.1:8080/` を追加（後述のURLと一致させること）
3. 「Which API/SDKs are you planning to use?」は **Web API** を選択
4. 作成後に表示される **Client ID** を控える

### 2. アプリを起動する

ビルド不要の静的サイトです。任意の静的サーバーで配信します：

```bash
# Python
python3 -m http.server 8080 --bind 127.0.0.1

# または Node.js
npx serve -l 8080
```

ブラウザで `http://127.0.0.1:8080/` を開き、Client IDを貼り付けて「Spotifyと連携する」を押してください。

> **注意**: Spotifyの仕様上、Redirect URIは `https://` か `http://127.0.0.1` のループバックのみ許可されます（`localhost` は不可）。GitHub PagesなどHTTPSでホストする場合は、そのURLをDashboardのRedirect URIに追加してください。

### 3. 使う

1. Spotifyアプリ（スマホ・PCどちらでも）で曲を再生
2. 歌詞が自動で表示され、再生に合わせてスクロールします
3. 気になる単語をタップ → 画面下（PCでは右側）に辞書パネルが開きます

## 中国語モード（chinese.html）

中国語の曲に特化したモードです。メイン画面右上の「中文」ボタン、または `http://127.0.0.1:8080/chinese.html` から開けます（Spotify連携はメイン画面と共有されるので再設定不要）。

- **ピンインのルビ表示** — 歌詞のすべての漢字の上にピンインを表示（[pinyin-pro](https://github.com/zh-lx/pinyin-pro) をCDNから読み込み）。右上の「拼音」ボタンで表示ON/OFF
- **タップで日本語の意味** — 単語をタップすると、ピンイン＋日本語訳（MyMemory翻訳API）＋詳しい定義（Wiktionary）を表示
- Google翻訳リンクも中国語→日本語に固定

## 構成

```
index.html        画面（セットアップ / プレイヤー / 辞書パネル）
css/style.css     スタイル
js/spotify.js     Spotify認証（PKCE）と再生中トラック取得
js/lyrics.js      LRCLIBからの歌詞取得とLRCパース
js/dictionary.js  Wiktionary / Free Dictionary APIでの単語検索
js/app.js         画面制御・ポーリング・同期ハイライト
```

外部サービス: Spotify Web API（認証必要）/ LRCLIB / Wiktionary / Free Dictionary API（いずれも無料・キー不要）。トークン類はブラウザの localStorage にのみ保存されます。

## 制限事項

- 歌詞はLRCLIBのコミュニティデータベースに依存するため、曲によっては見つからないことがあります
- 再生状態の取得にSpotifyアカウントが必要です（無料アカウントでも再生中トラックの取得は可能）
