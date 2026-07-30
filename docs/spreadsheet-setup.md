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
   - 実行が完了すると `MonthlyBalances` `Accounts` `ElectricityRecords` `Memos` `AnnualMemos` の5シートが作成される。
     - `MonthlyBalances`: 列 `year_month`, `person`, `category`, `account_name`, `amount`, `updated_at`（資産・カードの実データ本体）
     - `Accounts`: 口座・カードのマスタ一覧（参照用。編集は `gas/Code.gs` 内の `ACCOUNTS` 定数で行う）
     - `ElectricityRecords`: 列 `year_month`, `income`, `expense`, `updated_at`, `income_kwh`, `expense_kwh`（売電収入・買電支出・売電量/買電量[kWh、任意]。資産管理とは別集計）
     - `Memos`: 列 `id`, `date`（未使用・後方互換のため残置）, `account`, `amount`, `memo`, `created_at`, `type`, `frequency`, `day_of_month`, `amount_type`（奨学金の引き落とし口座など、資産管理とは別枠の定期/都度の入出金メモ。`amount_type` は `固定`（金額を指定）/`変動`（利用料に応じて引落など、金額を確定できない場合）のいずれか）
     - `AnnualMemos`: 列 `id`, `item_name`, `payment_date`, `amount`, `note`, `created_at`（自動車税・固定資産税の振込など、毎年決まった時期に発生する支払いのメモ。既存ユーザーが「初期設定」を再実行しなくても、初回アクセス時に自動的にシートが作成される）
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
| `getTrend` | - | 月次推移データ（総資産・カテゴリ別合計・名義別合計・カード合計）を返す |
| `getElectricityData` | `year_month` | 指定年月の売電収入・買電支出を返す（データが無ければ `data: null`） |
| `getElectricityYearMonths` | - | 売電・買電データが存在する年月の一覧（昇順）を返す |
| `getElectricityTrend` | - | 月ごとの売電収入・買電支出・収支（income − expense）の一覧を返す |
| `getMemos` | - | メモの一覧を「定期（日付が早い順）→都度（登録が新しい順）」で返す |
| `getAnnualMemos` | - | 年間メモ（自動車税・固定資産税の振込など）の一覧を登録が新しい順で返す |

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

`income` / `expense` / `income_kwh` / `expense_kwh` はいずれも任意で、キー自体を送らなければ既存値を保持します（同一 `year_month` の行が既にあれば上書き更新、無ければ新規追加）。**明示的に `null` を送るとその項目だけ空欄にリセットできます**（間違えて入力した値の取り消し用）。Next.js の「売電・買電」タブでは各欄の「クリア」ボタンで空にしてから保存すると、内部的にこの `null` 送信が行われます。

メモ（資産管理とは別集計）の追加・削除:

```json
{
  "action": "addMemo",
  "token": "xxxx",
  "account": "りそな銀行（雅一）",
  "type": "出金",
  "frequency": "定期",
  "day_of_month": 27,
  "amount_type": "固定",
  "amount": 14222,
  "memo": "奨学金引落"
}
```

```json
{ "action": "deleteMemo", "token": "xxxx", "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
```

`account` は銀行口座名（例: `りそな銀行（雅一）`）、`type` は `入金` / `出金`、`frequency` は `定期` / `都度`、`amount_type` は `固定` / `変動` のいずれも必須。`frequency` が `定期` の場合のみ `day_of_month`（1〜31）が必須。`amount_type` が `変動`（例: JCBカードの「利用料に応じて引落」のように金額が確定しない場合）のときは `amount` を送っても無視され、常に空欄で保存される。`amount_type` が `固定` の場合のみ `amount`（任意）が使われる。`memo` は任意。`addMemo` は常に新規行を追加する（upsertしない）。旧バージョンのデータ（`amount_type` 列が空欄）は読み込み時に自動的に `固定` として扱われる。

メモの更新（内容の編集）:

```json
{
  "action": "updateMemo",
  "token": "xxxx",
  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "account": "りそな銀行（雅一）",
  "type": "出金",
  "frequency": "定期",
  "day_of_month": 27,
  "amount_type": "固定",
  "amount": 15000,
  "memo": "奨学金引落"
}
```

`id` に加えて、`addMemo` と同じ必須項目（account / type / frequency / amount_type、`frequency`が`定期`の場合は day_of_month）が必要。指定した `id` の行の内容を丸ごと上書きする（`id` と `created_at` は変更されない）。Next.js の「メモ」タブでは各カードの「編集」ボタンから、このAPIを使ってその場で内容を書き換えられる。

年間メモ（自動車税・固定資産税の振込など、毎年決まった時期に発生する支払い）の追加・削除:

```json
{
  "action": "addAnnualMemo",
  "token": "xxxx",
  "item_name": "自動車税",
  "payment_date": "5月31日ごろ",
  "amount": 34500,
  "note": "普通車・軽自動車の2台分"
}
```

```json
{ "action": "deleteAnnualMemo", "token": "xxxx", "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
```

`item_name`（項目名）と `payment_date`（支払い日。自由記述。例: `5月31日ごろ`）は必須。`amount` / `note` は任意。`addAnnualMemo` は常に新規行を追加する（upsertしない）。

年間メモの更新（内容の編集）:

```json
{
  "action": "updateAnnualMemo",
  "token": "xxxx",
  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "item_name": "自動車税",
  "payment_date": "5月31日ごろ",
  "amount": 34500,
  "note": "普通車・軽自動車の2台分"
}
```

`id` に加えて、`addAnnualMemo` と同じ必須項目（item_name / payment_date）が必要。指定した `id` の行の内容を丸ごと上書きする（`id` と `created_at` は変更されない）。

## トラブルシューティング: 既存の「Memos」データが新しいメモ一覧に表示されない

メモ機能を旧バージョン（日付・口座・金額・内容のみの自由記述）で既に使っていた場合、`type`（入金/出金）・`frequency`（定期/都度）・`day_of_month` の列が空欄のため、新しい一覧（定期/都度に分類して表示）には出てきません。既存行の `G`〜`I` 列（`type`, `frequency`, `day_of_month`）に手動で値を入力すれば表示されるようになります。`date` 列（B列）は今後使用しないため、そのまま残しておいて問題ありません。

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
