# スプレッドシート & GAS 初期設定手順

夫婦用 月次資産・支払い管理アプリのバックエンド（Google スプレッドシート + Google Apps Script）のセットアップ手順です。
GAS のコード本体は [`gas/Code.gs`](../gas/Code.gs) を参照してください。

## 1. スプレッドシートを作成する

1. Google ドライブで新規スプレッドシートを作成する。
2. わかりやすい名前を付ける（例: `資産管理シート`）。

## 2. Apps Script プロジェクトを作成する

1. スプレッドシートのメニューから **拡張機能 > Apps Script** を開く。
2. デフォルトで生成される `コード.gs`（または `Code.gs`）の中身を全て削除する。
3. [`gas/Code.gs`](../gas/Code.gs) の内容を丸ごと貼り付ける。
4. プロジェクト名を任意で設定し（例: `shisan-backend`）、保存する（Ctrl+S / Cmd+S）。

## 3. シートの初期化を実行する

1. スプレッドシートの画面に戻り、リロードする。
2. メニューバーに **「資産管理」** メニューが追加されていることを確認する。
3. **資産管理 > 初期設定（シート作成）** を実行する。
   - 初回実行時は Google から権限確認のダイアログが表示されるので、対象アカウント（世帯で使うGoogleアカウント）を選択し、「許可」する。
   - 実行が完了すると `MonthlyBalances` と `Accounts` の2シートが作成される。
     - `MonthlyBalances`: 列 `year_month`, `person`, `category`, `account_name`, `amount`, `updated_at`（実データ本体）
     - `Accounts`: 口座・カードのマスタ一覧（参照用。編集は `gas/Code.gs` 内の `ACCOUNTS` 定数で行う）
   - 既定で残っていた空の「シート1」は自動的に削除される。

## 4. APIトークンを設定する（推奨）

Web アプリとして公開すると URL を知っていれば誰でもアクセスできてしまうため、簡易的なトークン認証を設定することを強く推奨します。

1. **資産管理 > APIトークン設定** を実行する。
2. 任意の文字列（例: ランダムな英数字20文字程度）を入力して OK。
3. この値は後で Next.js（Vercel）側の環境変数 `GAS_API_TOKEN` にも同じ値を設定します。控えておいてください。
4. 空欄のままOKすると認証なし（開発中のみ推奨）になります。

## 5. Web アプリとしてデプロイする

1. Apps Script エディタ右上の **デプロイ > 新しいデプロイ** をクリック。
2. 「種類の選択」の歯車アイコンから **ウェブアプリ** を選択。
3. 設定値:
   - **説明**: 任意（例: `v1`）
   - **次のユーザーとして実行**: 自分（スプレッドシートの所有者アカウント）
   - **アクセスできるユーザー**: 全員
     - トークン認証を設定済みであれば「全員」でも実質保護されます。
4. **デプロイ** をクリックし、Google アカウントへのアクセス許可を再度承認する。
5. 発行された **ウェブアプリ URL**（`https://script.google.com/macros/s/xxxxx/exec` の形式）をコピーしておく。
   - この URL を Next.js 側の環境変数（例: `GAS_API_URL`）に設定します（フロントエンド実装時に使用）。

### コードを更新した場合の再デプロイ

`gas/Code.gs` の内容を更新した場合、既存のデプロイには自動反映されません。

1. **デプロイ > デプロイを管理**
2. 対象デプロイの鉛筆アイコン（編集）をクリック
3. 「バージョン」を **新バージョン** に変更して **デプロイ**

これで同じ URL のまま最新コードが反映されます。

## 6. 動作確認

ブラウザで以下の URL にアクセスし、JSON が返ってくることを確認する（`{{WEB_APP_URL}}` と `{{TOKEN}}` は実際の値に置き換える）。

```
{{WEB_APP_URL}}?action=getAccounts&token={{TOKEN}}
```

以下のようなレスポンスが返れば成功です。

```json
{
  "ok": true,
  "accounts": [
    { "person": "雅一", "category": "銀行", "account_name": "GMOあおぞらネット銀行" },
    ...
  ]
}
```

続けて、以下も確認しておくと安心です。

```
{{WEB_APP_URL}}?action=getYearMonths&token={{TOKEN}}
{{WEB_APP_URL}}?action=getTrend&token={{TOKEN}}
{{WEB_APP_URL}}?action=getMonthlyData&year_month=2026-07&token={{TOKEN}}
```

## 7. API 仕様サマリ

### GET（データ取得）

| action | パラメータ | 説明 |
| --- | --- | --- |
| `getAccounts` | - | 口座・カードのマスタ一覧を返す |
| `getMonthlyData` | `year_month` (例: `2026-07`) | 指定年月の全データを返す |
| `getYearMonths` | - | データが存在する年月の一覧（昇順）を返す |
| `getTrend` | - | 月次推移データ（総資産・名義別合計・カード合計）を返す |

### POST（データ保存・一括Upsert）

`Content-Type: text/plain` で JSON文字列を送信すること（`application/json` で送るとブラウザがプリフライト(OPTIONS)リクエストを送り、GAS側が対応していないため失敗します）。

```json
{
  "action": "saveMonthlyData",
  "token": "xxxx",
  "year_month": "2026-07",
  "entries": [
    { "person": "雅一", "category": "銀行", "account_name": "GMOあおぞらネット銀行", "amount": 1234567 },
    { "person": "雅一", "category": "証券", "account_name": "楽天証券", "amount": 2000000 },
    { "person": "穂夏", "category": "銀行", "account_name": "りそな銀行", "amount": 500000 },
    { "person": "共通", "category": "カード", "account_name": "楽天カード", "amount": 80000 }
  ]
}
```

同一の `year_month` + `person` + `category` + `account_name` の組み合わせが既に存在する場合は上書き更新、存在しない場合は新規行として追加されます（`updated_at` は保存時のタイムスタンプに更新）。

## 8. 次のステップ

このドキュメントと `gas/Code.gs` でバックエンドの土台が整いました。次のフェーズで Next.js の入力フォーム・ダッシュボード UI を実装します（`GAS_API_URL` と `GAS_API_TOKEN` を環境変数として利用予定）。
