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
   - 実行が完了すると `MonthlyBalances` `Accounts` `ElectricityRecords` `Memos` の4シートが作成される。
     - `MonthlyBalances`: 列 `year_month`, `person`, `category`, `account_name`, `amount`, `updated_at`（資産・カードの実データ本体）
     - `Accounts`: 口座・カードのマスタ一覧（参照用。編集は `gas/Code.gs` 内の `ACCOUNTS` 定数で行う）
     - `ElectricityRecords`: 列 `year_month`, `income`, `expense`, `updated_at`, `income_kwh`, `expense_kwh`（売電収入・買電支出・売電量/買電量[kWh、任意]。資産管理とは別集計）
     - `Memos`: 列 `id`, `date`, `account`, `amount`, `memo`, `created_at`（奨学金の引き落とし口座・日付など、資産管理とは別枠の自由記述メモ）
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
| `getElectricityData` | `year_month` | 指定年月の売電収入・買電支出を返す（データが無ければ `data: null`） |
| `getElectricityYearMonths` | - | 売電・買電データが存在する年月の一覧（昇順）を返す |
| `getElectricityTrend` | - | 月ごとの売電収入・買電支出・収支（income − expense）の一覧を返す |
| `getMemos` | - | メモの一覧を日付の新しい順で返す |

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

売電・買電（資産管理とは別集計）の保存:

```json
{
  "action": "saveElectricity",
  "token": "xxxx",
  "year_month": "2026-07",
  "income": 9500,
  "expense": 6800,
  "income_kwh": 105.5,
  "expense_kwh": 80.2
}
```

`income_kwh` / `expense_kwh`（売電量・買電量、任意）は既存の `ElectricityRecords` シートの末尾列として追加されており、`gas/Code.gs` を再デプロイするだけで反映されます（既存データの列がずれることはありません）。ヘッダー行（1行目）が古いままの場合は E1・F1 セルに手動で `income_kwh` / `expense_kwh` と入力するか、メニューの「初期設定（シート作成）」を再実行してください（再実行すると中身が消えるので既存データがある場合は注意）。

`income` / `expense` は片方だけ送ってもよく、未指定の側は既存値が保持されます（同一 `year_month` の行が既にあれば上書き更新、無ければ新規追加）。

メモ（資産管理とは別集計）の追加・削除:

```json
{ "action": "addMemo", "token": "xxxx", "date": "2026-07-27", "account": "りそな銀行（雅一）", "amount": 15000, "memo": "奨学金の引き落とし。毎月27日ごろ。" }
```

```json
{ "action": "deleteMemo", "token": "xxxx", "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
```

`account` / `amount` は任意。`addMemo` は常に新規行を追加する（upsertしない）。

## トラブルシューティング: 入力したのに総資産推移にしか反映されない

Google スプレッドシートは `"2026-07"` のような文字列を自動的に日付型に変換してしまうことがあります（`MonthlyBalances` シートの `year_month` 列が `2026/07/01` のような日付表示に見える場合、これが起きています）。この場合、`getMonthlyData`（ダッシュボードの内訳・明細・入力フォームの初期値読み込みに使用）の年月の完全一致フィルタが効かなくなり、データが「無い」ものとして扱われます。一方 `getTrend` は値をそのままキーにして集計するため、一見グラフ上は反映されて見えてしまいます。

`gas/Code.gs` は年月セルを常にプレーンテキストとして書き込み・読み込む対策済みです。発生している場合は以下の手順で直してください。

1. Apps Script エディタで `gas/Code.gs` の中身を最新版に貼り替えて保存する。
2. **重要**: **デプロイ > デプロイを管理** を開き、既存デプロイ（新しいデプロイではなく）の鉛筆アイコンから「バージョン: 新バージョン」→ **デプロイ** を実行する。ここで「新しいデプロイ」を作ってしまうとURLが変わり、Vercel側の `GAS_API_URL` と一致しなくなるので注意。
3. スプレッドシートに戻り、リロードしてメニューから **資産管理 > 年月データの修復（テキスト化）** を実行する。既存の行がまとめてテキスト形式に修復される（データの再入力は不要）。
4. ダッシュボードを再読み込みして反映を確認する。

再デプロイができているかは、ブラウザで `{ウェブアプリURL}?action=getYearMonths&token={トークン}` を開き、`["2026-06","2026-07"]` のように `/` や時刻を含まないシンプルな文字列が返ってくるかで確認できます。

## 8. 次のステップ

このドキュメントと `gas/Code.gs` でバックエンドの土台が整いました。次のフェーズで Next.js の入力フォーム・ダッシュボード UI を実装します（`GAS_API_URL` と `GAS_API_TOKEN` を環境変数として利用予定）。
