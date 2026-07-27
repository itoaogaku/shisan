# shisan / web

夫婦用 月次資産・支払い管理アプリの Next.js (App Router) フロントエンドです。
バックエンドは Google Apps Script + Google スプレッドシート（[`../gas/Code.gs`](../gas/Code.gs)）で、
このアプリはその Web アプリ URL を叩いて画面を表示します。

## セットアップ

1. `../docs/spreadsheet-setup.md` の手順に沿って GAS 側のセットアップとデプロイを済ませる。
2. 依存パッケージをインストール:

   ```bash
   npm install
   ```

3. 環境変数を設定する:

   ```bash
   cp .env.local.example .env.local
   ```

   `.env.local` に GAS の Web アプリ URL とトークンを記入する。

   ```
   GAS_API_URL=https://script.google.com/macros/s/xxxxx/exec
   GAS_API_TOKEN=（gas/Code.gs の「APIトークン設定」で設定した値）
   ```

4. 開発サーバーを起動:

   ```bash
   npm run dev
   ```

   [http://localhost:3000](http://localhost:3000) を開く。

## 画面構成

- `/`（ダッシュボード）: 世帯全体・雅一・穂夏の資産合計、口座別内訳（棒グラフ）、総資産推移（折れ線グラフ）、カード当月合計を表示。年月は `?ym=YYYY-MM` で切り替え可能。
- `/input`（データ入力）: 年月を選び、名義（雅一・穂夏・カード）タブとカテゴリ別セクションで口座残高・カード請求額をまとめて入力・保存。

## ディレクトリ

- `src/lib/accounts.ts`: 口座・カードのマスタ定義（`gas/Code.gs` の `ACCOUNTS` と一致させること）
- `src/lib/gas.ts`: GAS Web アプリとの通信（サーバー側のみで使用、トークンはクライアントに露出しない）
- `src/app/api/gas/*`: フロントエンド(クライアント)から使う GAS プロキシ用 Route Handlers
- `src/components/`: UI コンポーネント（`ui/` は shadcn 相当の基本部品）

## デプロイ

Vercel へのデプロイ手順は本リポジトリのやり取りの中で案内します（Vercel プロジェクト作成 → 環境変数 `GAS_API_URL` / `GAS_API_TOKEN` の設定 → デプロイ）。
