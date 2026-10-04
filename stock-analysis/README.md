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

## 注意

- 採点は機械的な計算結果です。売買を推奨するものではありません。
- 一時的要因、季節性、重大リスク、地合いは、スクリプトでは判定できません。Claude が別途確認します。
