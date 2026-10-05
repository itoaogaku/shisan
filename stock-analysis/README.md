# stock-analysis - 株式銘柄分析（Claude Code用）

ファンダメンタルズ5項目（45点）とテクニカル7項目（55点）で銘柄を採点し、判断材料を整理する仕組みです。採点基準と出力形式は [`.claude/skills/kabu-bunseki/SKILL.md`](../.claude/skills/kabu-bunseki/SKILL.md) にあります。

## 使い方

Claude Code で次のように頼みます。

```
/kabu-bunseki 7203
```

「7203を分析して」と頼むだけでも動きます。

## 用意するデータ

| ファイル | 中身 | 必須 |
|---|---|---|
| `data/<コード>.csv` | 日足（分割調整済み・250営業日以上） | テクニカルに必須 |
| `data/<コード>_fund.json` | 決算短信の数値（形式は `fund_template.json`） | ファンダに必須 |

### 日足CSVの形式

1行目は見出しにします。日本語でも英語でも読み込めます。文字コードは UTF-8 か Shift_JIS、日付は `2026/10/02`、`2026-10-02`、`20261002` のどれでも構いません。

```
日付,始値,高値,安値,終値,出来高
2026/10/01,2500,2550,2490,2540,1234500
```

ネットワークで Yahoo! Finance に接続できる環境なら、次のコマンドで自動取得できます。

```
python3 stock-analysis/fetch_prices.py 7203
```

### 業績データ

決算短信のPDFやスクリーンショットをチャットに添付すると、Claude が読み取って JSON にします。

## スクリプトを直接使う場合

```
python3 stock-analysis/score.py --csv stock-analysis/data/7203.csv --fund stock-analysis/data/7203_fund.json
```

- 標準ライブラリのみで動きます。
- `--json` を付けると、結果をJSONで出力します。

## 全市場スクリーニング

東証の全銘柄（プライム・スタンダード・グロースの国内普通株）を同じ採点基準で絞り込みます。設計は [`SCREENING_PLAN.md`](SCREENING_PLAN.md) にあります。

新方式（強い株を選んでから買い時で並べる。2026-10-05〜）:

```
python3 stock-analysis/screen_universe.py                                   # ⓪ 銘柄一覧
python3 stock-analysis/screen_strength.py                                   # ① 日足取得・株価の強さで上位300
python3 stock-analysis/screen_fundamental.py --stage1 stock-analysis/screening/strength_<日付>.csv --out strong   # ② 業績
python3 stock-analysis/screen_select.py --flags stock-analysis/screening/flags_<日付>.json                         # ③ 強い株20・買い時順
```

旧方式（テクニカル点で絞る。比較用）:

```
python3 stock-analysis/screen_universe.py      # ⓪ JPXの銘柄一覧 → screening/universe.csv
python3 stock-analysis/screen_technical.py     # ① 全銘柄の日足取得・テクニカル採点 → screening/stage1_<日付>.csv
python3 stock-analysis/screen_fundamental.py   # ② 上位150銘柄の決算取得・ファンダ採点 → screening/ranking_<日付>.csv
```

- ①は約3,700銘柄を1秒以上の間隔で取得するため、1時間強かかります。途中で止まっても、再実行すれば取得済みの銘柄を飛ばして再開します。動作確認は `--limit 10` で行えます。
- ①の除外条件：25日平均売買代金1億円未満、日足250本未満。②の除外条件：時価総額50億円未満、今期赤字予想、継続企業の前提に関する注記あり。
- ②の決算データは株探の決算ページ、継続企業の注記は株探の適時開示一覧（過去約15か月の表題）で確認します。取得できなかった項目は推定せず「評価不能」にします。
- 日足（`data/prices/`、約90MB）はコミットしません。除外理由や取得失敗は `screening/*_log.json`、銘柄ごとの業績データは `screening/fund_<日付>/` に残ります。
- `python3 stock-analysis/screen_views.py` で、上位20銘柄を「低リスク順」と「チャート条件がそろっている順」に並べ替えられます（次回決算日は IRBank から取得。基準はスクリプト冒頭に記載）。
- ③上位10銘柄の詳細確認は Claude が行い、`reports/screening_<日付>.md` に書きます。

## 注意

- 採点は機械的な計算結果です。売買を推奨するものではありません。
- 一時的要因、季節性、重大リスク、地合いは、スクリプトでは判定できません。Claude が別途確認します。
