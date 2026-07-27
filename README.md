# shisan - 夫婦用 月次資産・支払い管理アプリ

夫婦で利用する自宅の月次資産・クレジットカード支払い管理ウェブアプリです。

## 構成

- **フロントエンド**: Next.js (App Router), Tailwind CSS, shadcn/ui 相当のコンポーネント（[`web/`](./web)）
- **ホスティング**: Vercel（予定）
- **データベース / バックエンド**: Google Apps Script (GAS) + Google スプレッドシート

## ディレクトリ構成

- [`gas/Code.gs`](./gas/Code.gs): GAS バックエンド本体（`doGet` / `doPost`）
- [`docs/spreadsheet-setup.md`](./docs/spreadsheet-setup.md): スプレッドシート & GAS の初期設定手順
- [`web/`](./web): Next.js フロントエンド（入力フォーム・ダッシュボード）。詳細は [`web/README.md`](./web/README.md)

## 現在の進捗

1. ✅ GAS コード（`doGet` / `doPost`）
2. ✅ Next.js の入力フォーム & ダッシュボード UI
3. ✅ スプレッドシートの初期設定手順

セットアップは `docs/spreadsheet-setup.md`（GAS・スプレッドシート側）→ `web/README.md`（Next.js側）の順に進めてください。
