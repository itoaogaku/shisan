/**
 * 家計資産管理アプリ - GAS バックエンド (Google スプレッドシートをDBとして利用)
 *
 * シート構成:
 *  - MonthlyBalances : 月次の残高/支払額データ本体
 *  - Accounts        : 口座・カードのマスタ（参照用。編集は下記 ACCOUNTS 定数側で行う）
 *
 * デプロイ方法・初期設定手順は docs/spreadsheet-setup.md を参照。
 */

// ==== 基本設定 ====
var SHEET_MONTHLY = 'MonthlyBalances';
var SHEET_ACCOUNTS = 'Accounts';
var HEADER = ['year_month', 'person', 'category', 'account_name', 'amount', 'updated_at'];

// 口座・カードのマスタ定義。フロントエンドの入力フォームと内容を一致させること。
// person は「雅一」「穂夏」「共通」のいずれか。カードは世帯共通の支払いとして「共通」で管理する。
var ACCOUNTS = [
  // 雅一 名義 - 銀行・証券・暗号資産
  { person: '雅一', category: '銀行', account_name: 'GMOあおぞらネット銀行' },
  { person: '雅一', category: '銀行', account_name: 'りそな銀行' },
  { person: '雅一', category: '銀行', account_name: '三菱UFJ銀行' },
  { person: '雅一', category: '銀行', account_name: '住信SBIネット銀行' },
  { person: '雅一', category: '証券', account_name: '楽天証券' },
  { person: '雅一', category: '暗号資産', account_name: 'GMOコイン' },
  { person: '雅一', category: '暗号資産', account_name: 'Bybit' },

  // 穂夏 名義 - 銀行・信用金庫
  { person: '穂夏', category: '銀行', account_name: 'りそな銀行' },
  { person: '穂夏', category: '銀行', account_name: '多摩信用金庫' },
  { person: '穂夏', category: '銀行', account_name: '住信SBIネット銀行' },
  { person: '穂夏', category: '銀行', account_name: '埼玉りそな銀行' },

  // クレジットカード（世帯共通・月次支払額を管理）
  { person: '共通', category: 'カード', account_name: 'JCBカード' },
  { person: '共通', category: 'カード', account_name: '三菱UFJカード' },
  { person: '共通', category: 'カード', account_name: '楽天カード' }
];

// ==== メニュー（スプレッドシートを開いたときに表示） ====
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('資産管理')
    .addItem('初期設定（シート作成）', 'setupSpreadsheet')
    .addItem('APIトークン設定', 'setApiToken')
    .addToUi();
}

/**
 * 初回のみ実行。MonthlyBalances / Accounts シートを作成しヘッダーを設定する。
 * スプレッドシートのメニュー「資産管理 > 初期設定（シート作成）」から実行する。
 */
function setupSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var monthly = ss.getSheetByName(SHEET_MONTHLY);
  if (!monthly) monthly = ss.insertSheet(SHEET_MONTHLY);
  monthly.clear();
  monthly.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
  monthly.setFrozenRows(1);
  monthly.getRange(1, 1, 1, HEADER.length).setFontWeight('bold');
  // year_month（A列）が日付として自動変換されないよう、プレーンテキスト書式にしておく
  monthly.getRange('A:A').setNumberFormat('@');

  var accounts = ss.getSheetByName(SHEET_ACCOUNTS);
  if (!accounts) accounts = ss.insertSheet(SHEET_ACCOUNTS);
  accounts.clear();
  var accHeader = ['person', 'category', 'account_name'];
  accounts.getRange(1, 1, 1, accHeader.length).setValues([accHeader]);
  accounts.setFrozenRows(1);
  accounts.getRange(1, 1, 1, accHeader.length).setFontWeight('bold');
  var accRows = ACCOUNTS.map(function (a) {
    return [a.person, a.category, a.account_name];
  });
  accounts.getRange(2, 1, accRows.length, accHeader.length).setValues(accRows);

  var defaultSheet = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 2) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.getUi().alert(
    '初期設定が完了しました。\n「MonthlyBalances」「Accounts」シートを作成しました。'
  );
}

/**
 * Next.js からのアクセスを制限するための簡易トークンを設定する。
 * 空欄で設定した場合は認証なし（開発用途のみ推奨）。
 */
function setApiToken() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(
    'APIトークン設定',
    'Next.js側からのアクセスを制限するトークンを入力してください（空欄で認証なし）',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var token = res.getResponseText().trim();
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
  ui.alert(token ? 'トークンを設定しました。' : 'トークンをクリアしました（認証なし）。');
}

// ==== 共通ヘルパー ====
function getSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('シートが見つかりません: ' + name + '。先に「資産管理 > 初期設定」を実行してください。');
  return sheet;
}

function checkToken_(token) {
  var required = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!required) return true; // トークン未設定なら認証スキップ
  return token === required;
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * year_month セルの値を "YYYY-MM" 形式の文字列に正規化する。
 * スプレッドシートは "2026-07" のような文字列を日付として自動変換してしまうことがあり、
 * その場合 getValues() で Date オブジェクトが返ってくる。文字列の完全一致フィルタが
 * 効かなくなる（＝月次データが取得できない）事故を防ぐため、常にここで文字列化する。
 */
function normalizeYearMonth_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    return Utilities.formatDate(value, tz, 'yyyy-MM');
  }
  return String(value).trim();
}

function getAllRows_() {
  var sheet = getSheet_(SHEET_MONTHLY);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, HEADER.length).getValues();
  return values.map(function (row) {
    return {
      year_month: normalizeYearMonth_(row[0]),
      person: row[1],
      category: row[2],
      account_name: row[3],
      amount: Number(row[4]) || 0,
      updated_at: row[5]
    };
  });
}

// ==== データ操作 ====

/**
 * 指定年月の月次データを取得する。
 */
function getMonthlyData_(yearMonth) {
  if (!yearMonth) return [];
  return getAllRows_().filter(function (r) {
    return r.year_month === yearMonth;
  });
}

/**
 * データが存在する年月の一覧（昇順）を取得する。
 */
function getYearMonths_() {
  var set = {};
  getAllRows_().forEach(function (r) {
    set[r.year_month] = true;
  });
  return Object.keys(set).sort();
}

/**
 * 月ごとの推移データを集計する。
 * total_assets: カードを除く全資産の合計（世帯全体の総資産額）
 * person_totals: 雅一 / 穂夏 それぞれの合計（カードを除く）
 * card_total: クレジットカードの当月請求額合計
 */
function getTrend_() {
  var rows = getAllRows_();
  var map = {};
  rows.forEach(function (r) {
    if (!map[r.year_month]) {
      map[r.year_month] = {
        year_month: r.year_month,
        total_assets: 0,
        person_totals: { 雅一: 0, 穂夏: 0 },
        card_total: 0
      };
    }
    var m = map[r.year_month];
    if (r.category === 'カード') {
      m.card_total += r.amount;
    } else {
      m.total_assets += r.amount;
      if (m.person_totals[r.person] !== undefined) {
        m.person_totals[r.person] += r.amount;
      }
    }
  });
  return Object.keys(map)
    .sort()
    .map(function (k) {
      return map[k];
    });
}

/**
 * 月次データを一括で保存（Upsert）する。
 * 同一 year_month + person + category + account_name の行が既にあれば更新、なければ追加する。
 */
function saveMonthlyData_(yearMonth, entries) {
  if (!yearMonth) throw new Error('year_month は必須です');
  if (!entries || !entries.length) throw new Error('entries は必須です');

  var sheet = getSheet_(SHEET_MONTHLY);
  var lastRow = sheet.getLastRow();
  var now = new Date();

  // year_month 列（A列）がスプレッドシートによって日付型へ自動変換されるのを防ぐため、
  // 常にプレーンテキスト書式を強制してから書き込む。
  sheet.getRange('A:A').setNumberFormat('@');

  var existingMap = {};
  if (lastRow > 1) {
    var values = sheet.getRange(2, 1, lastRow - 1, HEADER.length).getValues();
    values.forEach(function (row, i) {
      var key = [normalizeYearMonth_(row[0]), row[1], row[2], row[3]].join('|');
      existingMap[key] = i + 2; // 実シート行番号
    });
  }

  var rowsToAppend = [];
  entries.forEach(function (entry) {
    var key = [yearMonth, entry.person, entry.category, entry.account_name].join('|');
    var rowValues = [
      String(yearMonth),
      entry.person,
      entry.category,
      entry.account_name,
      Number(entry.amount) || 0,
      now
    ];
    if (existingMap[key]) {
      sheet.getRange(existingMap[key], 1, 1, HEADER.length).setValues([rowValues]);
    } else {
      rowsToAppend.push(rowValues);
    }
  });

  if (rowsToAppend.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, HEADER.length).setValues(rowsToAppend);
  }
}

// ==== エンドポイント ====

/**
 * GET /exec?action=getAccounts
 * GET /exec?action=getMonthlyData&year_month=2026-07
 * GET /exec?action=getYearMonths
 * GET /exec?action=getTrend
 * 全て &token=xxx を付与可能（APIトークン設定時は必須）
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = params.action || 'getMonthlyData';
    var token = params.token || '';
    if (!checkToken_(token)) return jsonOutput_({ ok: false, error: 'unauthorized' });

    switch (action) {
      case 'getAccounts':
        return jsonOutput_({ ok: true, accounts: ACCOUNTS });
      case 'getMonthlyData':
        return jsonOutput_({
          ok: true,
          year_month: params.year_month,
          data: getMonthlyData_(params.year_month)
        });
      case 'getYearMonths':
        return jsonOutput_({ ok: true, year_months: getYearMonths_() });
      case 'getTrend':
        return jsonOutput_({ ok: true, trend: getTrend_() });
      default:
        return jsonOutput_({ ok: false, error: 'unknown action: ' + action });
    }
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

/**
 * POST /exec
 * body (JSON, text/plain で送信してCORSプリフライトを回避すること):
 * {
 *   "action": "saveMonthlyData",
 *   "token": "xxx",
 *   "year_month": "2026-07",
 *   "entries": [
 *     { "person": "雅一", "category": "銀行", "account_name": "りそな銀行", "amount": 123456 },
 *     ...
 *   ]
 * }
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOutput_({ ok: false, error: 'request body is empty' });
    }
    var body = JSON.parse(e.postData.contents);
    if (!checkToken_(body.token)) return jsonOutput_({ ok: false, error: 'unauthorized' });

    var action = body.action || 'saveMonthlyData';
    switch (action) {
      case 'saveMonthlyData':
        saveMonthlyData_(body.year_month, body.entries);
        return jsonOutput_({ ok: true, saved: body.entries.length });
      default:
        return jsonOutput_({ ok: false, error: 'unknown action: ' + action });
    }
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}
