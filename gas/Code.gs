/**
 * 家計資産管理アプリ - GAS バックエンド (Google スプレッドシートをDBとして利用)
 *
 * シート構成:
 *  - MonthlyBalances   : 月次の残高/支払額データ本体
 *  - Accounts          : 口座・カードのマスタ（参照用。編集は下記 ACCOUNTS 定数側で行う）
 *  - ElectricityRecords: 資産管理とは別枠の、月次の売電収入・買電支出データ
 *  - Memos             : 奨学金の引き落とし口座・日付など、資産管理とは別枠の自由記述メモ
 *
 * デプロイ方法・初期設定手順は docs/spreadsheet-setup.md を参照。
 */

// ==== 基本設定 ====
var SHEET_MONTHLY = 'MonthlyBalances';
var SHEET_ACCOUNTS = 'Accounts';
var SHEET_ELECTRICITY = 'ElectricityRecords';
var SHEET_MEMOS = 'Memos';
var HEADER = ['year_month', 'person', 'category', 'account_name', 'amount', 'updated_at'];
// income_kwh / expense_kwh は末尾に追加した列。既存シートの列順（year_month, income,
// expense, updated_at）を崩さないよう、後方互換のため末尾に配置している。
var HEADER_ELECTRICITY = ['year_month', 'income', 'expense', 'updated_at', 'income_kwh', 'expense_kwh'];
var HEADER_MEMOS = ['id', 'date', 'account', 'amount', 'memo', 'created_at'];

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

  // 穂夏 名義 - 銀行・信用金庫・証券
  { person: '穂夏', category: '銀行', account_name: 'りそな銀行' },
  { person: '穂夏', category: '銀行', account_name: '多摩信用金庫' },
  { person: '穂夏', category: '銀行', account_name: '住信SBIネット銀行' },
  { person: '穂夏', category: '銀行', account_name: '埼玉りそな銀行' },
  { person: '穂夏', category: '証券', account_name: 'SBI証券' },

  // クレジットカード（世帯共通・月次支払額を管理）
  // closingDay: 締め日。対象月の1〜5日ごろに入力する金額は「2か月前の(closingDay+1)日〜
  // 1か月前のclosingDay日」の利用分になる（参考情報。集計ロジックでは未使用）。
  // withdrawalDay: 引き落とし日。対象月のwithdrawalDay日ごろに上記の利用分が引き落とされる。
  { person: '共通', category: 'カード', account_name: 'JCBカード', closingDay: 15, withdrawalDay: 10 },
  { person: '共通', category: 'カード', account_name: '三菱UFJカード', closingDay: 15, withdrawalDay: 10 },
  { person: '共通', category: 'カード', account_name: '楽天カード', closingDay: 25, withdrawalDay: 25 }
];

// ==== メニュー（スプレッドシートを開いたときに表示） ====
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('資産管理')
    .addItem('初期設定（シート作成）', 'setupSpreadsheet')
    .addItem('APIトークン設定', 'setApiToken')
    .addItem('年月データの修復（テキスト化）', 'repairYearMonthColumn')
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
  var accHeader = ['person', 'category', 'account_name', 'closing_day', 'withdrawal_day'];
  accounts.getRange(1, 1, 1, accHeader.length).setValues([accHeader]);
  accounts.setFrozenRows(1);
  accounts.getRange(1, 1, 1, accHeader.length).setFontWeight('bold');
  var accRows = ACCOUNTS.map(function (a) {
    return [a.person, a.category, a.account_name, a.closingDay || '', a.withdrawalDay || ''];
  });
  accounts.getRange(2, 1, accRows.length, accHeader.length).setValues(accRows);

  var electricity = ss.getSheetByName(SHEET_ELECTRICITY);
  if (!electricity) electricity = ss.insertSheet(SHEET_ELECTRICITY);
  electricity.clear();
  electricity.getRange(1, 1, 1, HEADER_ELECTRICITY.length).setValues([HEADER_ELECTRICITY]);
  electricity.setFrozenRows(1);
  electricity.getRange(1, 1, 1, HEADER_ELECTRICITY.length).setFontWeight('bold');
  electricity.getRange('A:A').setNumberFormat('@');

  var memos = ss.getSheetByName(SHEET_MEMOS);
  if (!memos) memos = ss.insertSheet(SHEET_MEMOS);
  memos.clear();
  memos.getRange(1, 1, 1, HEADER_MEMOS.length).setValues([HEADER_MEMOS]);
  memos.setFrozenRows(1);
  memos.getRange(1, 1, 1, HEADER_MEMOS.length).setFontWeight('bold');

  var defaultSheet = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 4) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.getUi().alert(
    '初期設定が完了しました。\n「MonthlyBalances」「Accounts」「ElectricityRecords」「Memos」シートを作成しました。'
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

/**
 * MonthlyBalances / ElectricityRecords の year_month 列（A列）が過去にスプレッドシートに
 * よって日付型へ自動変換されてしまった行を、"YYYY-MM" のプレーンテキストに一括修復する。
 * 「資産管理 > 年月データの修復（テキスト化）」から手動実行する。
 * （通常はコード修正後の再デプロイのみで解消するが、既存行を即座に直したい場合に使う）
 */
function repairYearMonthColumn() {
  var ui = SpreadsheetApp.getUi();
  var sheetNames = [SHEET_MONTHLY, SHEET_ELECTRICITY];
  var totalFixed = 0;
  var totalRows = 0;

  sheetNames.forEach(function (name) {
    var sheet = getSheet_(name);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    var range = sheet.getRange(2, 1, lastRow - 1, 1);
    var values = range.getValues();
    totalRows += values.length;
    var normalized = values.map(function (row) {
      var original = row[0];
      if (Object.prototype.toString.call(original) === '[object Date]') totalFixed++;
      return [normalizeYearMonth_(original)];
    });

    // 先にプレーンテキスト書式にしてから書き込むことで、再度日付化されるのを防ぐ
    sheet.getRange('A:A').setNumberFormat('@');
    range.setValues(normalized);
  });

  if (totalRows === 0) {
    ui.alert('修復対象のデータがありません。');
    return;
  }

  ui.alert('修復が完了しました。（' + totalFixed + ' 件のセルを日付形式からテキストに変換しました）');
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

// ==== 売電・買電（資産管理とは別集計） ====

function getElectricityRows_() {
  var sheet = getSheet_(SHEET_ELECTRICITY);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, HEADER_ELECTRICITY.length).getValues();
  return values.map(function (row) {
    return {
      year_month: normalizeYearMonth_(row[0]),
      income: row[1] === '' ? null : Number(row[1]),
      expense: row[2] === '' ? null : Number(row[2]),
      updated_at: row[3],
      income_kwh: row[4] === '' ? null : Number(row[4]),
      expense_kwh: row[5] === '' ? null : Number(row[5])
    };
  });
}

/**
 * 指定年月の売電収入・買電支出を取得する。データが無い場合は null を返す。
 */
function getElectricityData_(yearMonth) {
  if (!yearMonth) return null;
  var rows = getElectricityRows_();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].year_month === yearMonth) return rows[i];
  }
  return null;
}

/**
 * データが存在する年月の一覧（昇順）を取得する。
 */
function getElectricityYearMonths_() {
  var set = {};
  getElectricityRows_().forEach(function (r) {
    set[r.year_month] = true;
  });
  return Object.keys(set).sort();
}

/**
 * 月ごとの売電収入・買電支出・収支（income - expense）・売電量/買電量(kWh)の一覧を昇順で返す。
 */
function getElectricityTrend_() {
  return getElectricityRows_()
    .slice()
    .sort(function (a, b) {
      return a.year_month < b.year_month ? -1 : a.year_month > b.year_month ? 1 : 0;
    })
    .map(function (r) {
      return {
        year_month: r.year_month,
        income: r.income,
        expense: r.expense,
        net: r.income !== null && r.expense !== null ? r.income - r.expense : null,
        income_kwh: r.income_kwh,
        expense_kwh: r.expense_kwh,
        net_kwh: r.income_kwh !== null && r.expense_kwh !== null ? r.income_kwh - r.expense_kwh : null
      };
    });
}

/**
 * income/expense/income_kwh/expense_kwh の1項目分の新しい保存値を決める。
 *   - undefined（未指定） → 既存値をそのまま保持
 *   - null（明示的なリセット） → 空欄にする
 *   - 数値 → その値を保存
 */
function resolveElectricityField_(newValue, existingValue) {
  if (newValue === undefined) return existingValue;
  if (newValue === null) return '';
  var num = Number(newValue);
  return isNaN(num) ? existingValue : num;
}

/**
 * 指定年月の売電収入・買電支出・売電量/買電量(kWh)を保存（Upsert）する。
 * 各項目は
 *   - 未指定（キー自体が無い）: 既存値を保持
 *   - null: 明示的に空欄へリセット（間違えて入力した値の取り消し用）
 *   - 数値: その値で更新
 * を区別して扱う。
 */
function saveElectricity_(yearMonth, income, expense, incomeKwh, expenseKwh) {
  if (!yearMonth) throw new Error('year_month は必須です');
  if (income === undefined && expense === undefined && incomeKwh === undefined && expenseKwh === undefined) {
    throw new Error('income, expense, income_kwh, expense_kwh のいずれかは必須です');
  }

  var sheet = getSheet_(SHEET_ELECTRICITY);
  sheet.getRange('A:A').setNumberFormat('@');

  var lastRow = sheet.getLastRow();
  var now = new Date();
  var rowIndex = -1;
  var existingIncome = '';
  var existingExpense = '';
  var existingIncomeKwh = '';
  var existingExpenseKwh = '';

  if (lastRow > 1) {
    var values = sheet.getRange(2, 1, lastRow - 1, HEADER_ELECTRICITY.length).getValues();
    for (var i = 0; i < values.length; i++) {
      if (normalizeYearMonth_(values[i][0]) === yearMonth) {
        rowIndex = i + 2;
        existingIncome = values[i][1];
        existingExpense = values[i][2];
        existingIncomeKwh = values[i][4];
        existingExpenseKwh = values[i][5];
        break;
      }
    }
  }

  var newIncome = resolveElectricityField_(income, existingIncome);
  var newExpense = resolveElectricityField_(expense, existingExpense);
  var newIncomeKwh = resolveElectricityField_(incomeKwh, existingIncomeKwh);
  var newExpenseKwh = resolveElectricityField_(expenseKwh, existingExpenseKwh);
  var rowValues = [String(yearMonth), newIncome, newExpense, now, newIncomeKwh, newExpenseKwh];

  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 1, 1, HEADER_ELECTRICITY.length).setValues([rowValues]);
  } else {
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, HEADER_ELECTRICITY.length).setValues([rowValues]);
  }
}

// ==== メモ（奨学金の引き落とし口座・日付など、資産管理とは別枠の自由記述） ====

/**
 * 日付セルの値を "YYYY-MM-DD" 形式の文字列に正規化する（normalizeYearMonth_ の日付版）。
 */
function normalizeDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  }
  return String(value).trim();
}

/**
 * メモの一覧を、日付の新しい順（同日なら登録が新しい順）で取得する。
 */
function listMemos_() {
  var sheet = getSheet_(SHEET_MEMOS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, HEADER_MEMOS.length).getValues();
  var memos = values.map(function (row) {
    return {
      id: String(row[0]),
      date: normalizeDate_(row[1]),
      account: row[2],
      amount: row[3] === '' ? null : Number(row[3]),
      memo: row[4],
      created_at: row[5]
    };
  });
  memos.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return String(b.created_at) < String(a.created_at) ? -1 : 1;
  });
  return memos;
}

/**
 * メモを1件追加する。date, memo は必須。account, amount は任意。
 */
function addMemo_(date, account, amount, memo) {
  if (!date) throw new Error('date は必須です');
  if (!memo) throw new Error('memo は必須です');

  var sheet = getSheet_(SHEET_MEMOS);
  sheet.getRange('B:B').setNumberFormat('@'); // date 列も年月と同様の日付自動変換を防ぐ

  var id = Utilities.getUuid();
  var now = new Date();
  var rowValues = [
    id,
    String(date),
    account || '',
    amount !== undefined && amount !== null && amount !== '' ? Number(amount) : '',
    memo,
    now
  ];
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, HEADER_MEMOS.length).setValues([rowValues]);
  return id;
}

/**
 * 指定 id のメモを1件削除する。
 */
function deleteMemo_(id) {
  if (!id) throw new Error('id は必須です');
  var sheet = getSheet_(SHEET_MEMOS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

// ==== エンドポイント ====

/**
 * GET /exec?action=getAccounts
 * GET /exec?action=getMonthlyData&year_month=2026-07
 * GET /exec?action=getYearMonths
 * GET /exec?action=getTrend
 * GET /exec?action=getElectricityData&year_month=2026-07
 * GET /exec?action=getElectricityYearMonths
 * GET /exec?action=getElectricityTrend
 * GET /exec?action=getMemos
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
      case 'getElectricityData':
        return jsonOutput_({
          ok: true,
          year_month: params.year_month,
          data: getElectricityData_(params.year_month)
        });
      case 'getElectricityYearMonths':
        return jsonOutput_({ ok: true, year_months: getElectricityYearMonths_() });
      case 'getElectricityTrend':
        return jsonOutput_({ ok: true, trend: getElectricityTrend_() });
      case 'getMemos':
        return jsonOutput_({ ok: true, memos: listMemos_() });
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
 *
 * 売電・買電の保存:
 * {
 *   "action": "saveElectricity",
 *   "token": "xxx",
 *   "year_month": "2026-07",
 *   "income": 12000,
 *   "expense": 8000,
 *   "income_kwh": 120,
 *   "expense_kwh": 95
 * }
 * income / expense / income_kwh / expense_kwh はいずれも任意。キー自体を送らなければ既存値を保持し、
 * 明示的に null を送るとその項目だけ空欄にリセットできる（間違えて入力した値の取り消し用）。
 *
 * メモの追加:
 * {
 *   "action": "addMemo",
 *   "token": "xxx",
 *   "date": "2026-07-27",
 *   "account": "りそな銀行（雅一）",
 *   "amount": 15000,
 *   "memo": "奨学金の引き落とし。毎月27日ごろ。"
 * }
 * account, amount は任意。
 *
 * メモの削除:
 * {
 *   "action": "deleteMemo",
 *   "token": "xxx",
 *   "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
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
      case 'saveElectricity':
        saveElectricity_(body.year_month, body.income, body.expense, body.income_kwh, body.expense_kwh);
        return jsonOutput_({ ok: true });
      case 'addMemo':
        var newId = addMemo_(body.date, body.account, body.amount, body.memo);
        return jsonOutput_({ ok: true, id: newId });
      case 'deleteMemo':
        var deleted = deleteMemo_(body.id);
        return jsonOutput_({ ok: true, deleted: deleted });
      default:
        return jsonOutput_({ ok: false, error: 'unknown action: ' + action });
    }
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}
