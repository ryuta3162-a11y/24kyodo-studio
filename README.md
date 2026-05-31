# 体験会予約 Web App（Vercel）

1ページ完結：日時選択 → 申込 → **Googleスプレッドシート「7月スタジオイベント」** に保存

## 構成

```
ブラウザ (index.html)
    ↓ GET /api/slots
Vercel → slots.json（月次更新）
    ↓ POST /api/book
Vercel → GAS Web App (予約API.gs)
    ↓
スプレッドシート「7月スタジオイベント」
```

## 1. GAS のセットアップ

1. `gas/予約API.gs` を GAS プロジェクトに追加  
   （予約先スプレッドシートにバインドした新規プロジェクトがおすすめ）
2. スプレッドシート ID は既に設定済み：
   `1Eba3Uvn4lRK5z4hshHdsOav6yMrpvQov6bT_5TWINag`
3. GAS エディタで `testSaveReservation` を一度実行 → シートにテスト行が入るか確認
4. **デプロイ → 新しいデプロイ → ウェブアプリ**
   - 実行ユーザー：**自分**
   - アクセス：**全員**
5. 表示 URL（`https://script.google.com/macros/s/.../exec`）をコピー

### シート列（1行目）

| 申込日時 | 希望日 | 開始 | 終了 | お名前 | 電話番号 | メール | ご要望 | ステータス |

既存シートの1行目が空なら自動で作成します。  
列名が違う場合は、1行目を上記に合わせてください。

## 2. Vercel デプロイ

1. [vercel.com](https://vercel.com) にログイン
2. **Add New → Project**
3. この `booking` フォルダをアップロード、または Git 連携
4. **Root Directory**: `booking`（リポジトリ全体からデプロイする場合）
5. **Environment Variables** に追加：

| 名前 | 値 |
|------|-----|
| `GAS_WEB_APP_URL` | GAS Web App の `/exec` URL |

6. Deploy

## 3. 月次データ更新

1. 新しいシフト CSV をルートに配置
2. `scripts/compute_slots.mjs` のパス・年月を更新
3. Vercel が再デプロイ時に `node ../scripts/compute_slots.mjs` で slots.json を再生成

7月用：シート名を `7月スタジオイベント` のまま使う場合、`予約API.gs` の `SHEET_NAME` は変更不要。

## ローカル確認

GAS URL を `.env.local` に設定（Vercel CLI 使用時）：

```
GAS_WEB_APP_URL=https://script.google.com/macros/s/xxxx/exec
```

```bash
cd booking
npx vercel dev
```

※ 社内PCで npm が使えない場合は Vercel 上で直接確認してください。
