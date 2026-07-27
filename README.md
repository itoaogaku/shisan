# shisan - 夫婦用 月次資産・支払い管理アプリ

夫婦で利用する自宅の月次資産・クレジットカード支払い管理ウェブアプリです。

## 構成

- **フロントエンド**: Next.js (App Router), Tailwind CSS, Shadcn UI（実装予定）
- **ホスティング**: Vercel（予定）
- **データベース / バックエンド**: Google Apps Script (GAS) + Google スプレッドシート

## ディレクトリ構成

- [`gas/Code.gs`](./gas/Code.gs): GAS バックエンド本体（`doGet` / `doPost`）
- [`docs/spreadsheet-setup.md`](./docs/spreadsheet-setup.md): スプレッドシート & GAS の初期設定手順

## 現在の進捗

1. ✅ GAS コード（`doGet` / `doPost`）
2. ⏳ Next.js の入力フォーム & ダッシュボード UI
3. ✅ スプレッドシートの初期設定手順

まずはバックエンド（GAS + スプレッドシート）を先行して用意しています。`docs/spreadsheet-setup.md` の手順に沿ってセットアップを行った後、フロントエンド実装に進みます。
