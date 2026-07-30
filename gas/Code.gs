/**
 * 家計資産管理アプリ - GAS バックエンド (Google スプレッドシートをDBとして利用)
 *
 * シート構成:
 *  - MonthlyBalances   : 月次の残高/支払額データ本体
 *  - Accounts          : 口座・カードのマスタ（参照用。編集は下記 ACCOUNTS 定数側で行う）
 *  - ElectricityRecords: 資産管理とは別枠の、月次の売電収入・買電支出データ
 *  - Memos             : 奨学金の引き落とし口座など、資産管理とは別枠の定期/都度の入出金メモ
 *  - AnnualMemos       : 自動車税・固定資産税の振込など、毎年決まった時期に発生する支払いのメモ
 *
 * デプロイ方法・初期設定手順は docs/spreadsheet-setup.md を参照。
 */

// ==== 基本設定 ====
var SHEET_MONTHLY = 'MonthlyBalances';
var SHEET_ACCOUNTS = 'Accounts';
var SHEET_ELECTRICITY = 'ElectricityRecords';
var SHEET_MEMOS = 'Memos';
var SHEET_ANNUAL_MEMOS = 'AnnualMemos';
var HEADER = ['year_month', 'person', 'category', 'account_name', 'amount', 'updated_at'];
// income_kwh / expense_kwh は末尾に追加した列。既存シートの列順（year_month, income,
// expense, updated_at）を崩さないよう、後方互換のため末尾に配置している。
var HEADER_ELECTRICITY = ['year_month', 'income', 'expense', 'updated_at', 'income_kwh', 'expense_kwh'];
// date（B列）は初期バージョンの名残りで、後方互換のため列として残しているが
// 現在のUIでは使用しない（常に空欄で書き込む）。type/frequency/day_of_month/amount_type は
// 既存データの列がずれないよう末尾に追加している。
var HEADER_MEMOS = [
  'id', 'date', 'account', 'amount', 'memo', 'created_at',
  'type', 'frequency', 'day_of_month', 'amount_type'
];
// 自動車税・固定資産税の振込など、毎年決まった時期に発生する支払いのメモ（Memosとは別シート）。
var HEADER_ANNUAL_MEMOS = ['id', 'item_name', 'payment_date', 'amount', 'note', 'created_at'];

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

  var annualMemos = ss.getSheetByName(SHEET_ANNUAL_MEMOS);
  if (!annualMemos) annualMemos = ss.insertSheet(SHEET_ANNUAL_MEMOS);
  annualMemos.clear();
  annualMemos.getRange(1, 1, 1, HEADER_ANNUAL_MEMOS.length).setValues([HEADER_ANNUAL_MEMOS]);
  annualMemos.setFrozenRows(1);
  annualMemos.getRange(1, 1, 1, HEADER_ANNUAL_MEMOS.length).setFontWeight('bold');

  var defaultSheet = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 5) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.getUi().alert(
    '初期設定が完了しました。\n「MonthlyBalances」「Accounts」「ElectricityRecords」「Memos」「AnnualMemos」シートを作成しました。'
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

/**
 * AnnualMemos シートを返す。既存ユーザーが「初期設定」を再実行せず（＝既存データを消さずに）
 * この機能を使えるよう、無ければここで自動的に作成する。
 */
function getAnnualMemosSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_ANNUAL_MEMOS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ANNUAL_MEMOS);
    sheet.getRange(1, 1, 1, HEADER_ANNUAL_MEMOS.length).setValues([HEADER_ANNUAL_MEMOS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADER_ANNUAL_MEMOS.length).setFontWeight('bold');
  }
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
 * person_totals: 雅一 / 穂夏 それぞれの合計（カードを除く。後方互換のため残置）
 * category_totals: 銀行 / 証券 / 暗号資産 / カード それぞれの合計
 * card_total: クレジットカードの当月請求額合計（category_totals.カード と同値。後方互換のため残置）
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
        category_totals: { 銀行: 0, 証券: 0, 暗号資産: 0, カード: 0 },
        card_total: 0
      };
    }
    var m = map[r.year_month];
    if (m.category_totals[r.category] !== undefined) {
      m.category_totals[r.category] += r.amount;
    }
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

// ==== メモ（奨学金の引き落とし口座など、資産管理とは別枠の定期/都度の入出金メモ） ====

/**
 * メモの一覧を、定期（日付が早い順）→都度（登録が新しい順）の順で取得する。
 * 並び替えは呼び出し側（フロントエンド）でも行うが、API単体で見ても意味のある順序にしておく。
 */
function listMemos_() {
  var sheet = getSheet_(SHEET_MEMOS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, HEADER_MEMOS.length).getValues();
  var memos = values.map(function (row) {
    return {
      id: String(row[0]),
      account: row[2],
      amount: row[3] === '' ? null : Number(row[3]),
      memo: row[4],
      created_at: row[5],
      type: row[6] || '',
      frequency: row[7] || '',
      day_of_month: row[8] === '' ? null : Number(row[8]),
      amount_type: row[9] || '固定'
    };
  });
  memos.sort(function (a, b) {
    if (a.frequency !== b.frequency) return a.frequency === '定期' ? -1 : 1;
    if (a.frequency === '定期') return (a.day_of_month || 99) - (b.day_of_month || 99);
    return String(b.created_at) < String(a.created_at) ? -1 : 1;
  });
  return memos;
}

/**
 * メモを1件追加する。
 * account, type（入金/出金）, frequency（定期/都度）, amountType（固定/変動）は必須。
 * frequency が「定期」の場合のみ dayOfMonth（1〜31）が必須。
 * amountType が「固定」の場合のみ amount（任意の金額）を使う。「変動」の場合、amount は
 * 「利用料に応じて」等の意味になるため、渡された値に関わらず空欄で保存する。
 * memo は任意。
 */
function addMemo_(account, type, frequency, dayOfMonth, amountType, amount, memo) {
  if (!account) throw new Error('account は必須です');
  if (type !== '入金' && type !== '出金') throw new Error('type は "入金" または "出金" である必要があります');
  if (frequency !== '定期' && frequency !== '都度') throw new Error('frequency は "定期" または "都度" である必要があります');
  if (frequency === '定期' && (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31)) {
    throw new Error('定期の場合、day_of_month は1〜31の範囲で必須です');
  }
  if (amountType !== '固定' && amountType !== '変動') {
    throw new Error('amountType は "固定" または "変動" である必要があります');
  }

  var sheet = getSheet_(SHEET_MEMOS);

  var id = Utilities.getUuid();
  var now = new Date();
  var rowValues = [
    id,
    '', // date列（後方互換のため残置。新規行では未使用）
    account,
    amountType === '固定' && amount !== undefined && amount !== null && amount !== '' ? Number(amount) : '',
    memo || '',
    now,
    type,
    frequency,
    frequency === '定期' ? Number(dayOfMonth) : '',
    amountType
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

// ==== 年間メモ（自動車税・固定資産税の振込など、毎年決まった時期に発生する支払いのメモ） ====

/**
 * 年間メモの一覧を、登録が新しい順で取得する。
 */
function listAnnualMemos_() {
  var sheet = getAnnualMemosSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, HEADER_ANNUAL_MEMOS.length).getValues();
  var memos = values.map(function (row) {
    return {
      id: String(row[0]),
      item_name: row[1],
      payment_date: row[2],
      amount: row[3] === '' ? null : Number(row[3]),
      note: row[4],
      created_at: row[5]
    };
  });
  memos.sort(function (a, b) {
    return String(b.created_at) < String(a.created_at) ? -1 : 1;
  });
  return memos;
}

/**
 * 年間メモを1件追加する。
 * itemName（項目名）, paymentDate（支払い日。自由記述。例: "5月31日ごろ"）は必須。amount, note は任意。
 */
function addAnnualMemo_(itemName, paymentDate, amount, note) {
  if (!itemName) throw new Error('itemName は必須です');
  if (!paymentDate) throw new Error('paymentDate は必須です');

  var sheet = getAnnualMemosSheet_();

  var id = Utilities.getUuid();
  var now = new Date();
  var rowValues = [
    id,
    itemName,
    paymentDate,
    amount !== undefined && amount !== null && amount !== '' ? Number(amount) : '',
    note || '',
    now
  ];
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, HEADER_ANNUAL_MEMOS.length).setValues([rowValues]);
  return id;
}

/**
 * 指定 id の年間メモを1件削除する。
 */
function deleteAnnualMemo_(id) {
  if (!id) throw new Error('id は必須です');
  var sheet = getAnnualMemosSheet_();
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
 * GET /exec?action=getAnnualMemos
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
      case 'getAnnualMemos':
        return jsonOutput_({ ok: true, annual_memos: listAnnualMemos_() });
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
 *   "account": "りそな銀行（雅一）",
 *   "type": "出金",
 *   "frequency": "定期",
 *   "day_of_month": 27,
 *   "amount_type": "固定",
 *   "amount": 15000,
 *   "memo": "奨学金の引き落とし"
 * }
 * account / type（入金・出金） / frequency（定期・都度） / amount_type（固定・変動） は必須。
 * frequency が「定期」の場合のみ day_of_month（1〜31）が必須。amount_type が「変動」の場合、
 * amount は「利用料に応じて」等の意味になるため無視され、常に空欄で保存される。memo は任意。
 *
 * メモの削除:
 * {
 *   "action": "deleteMemo",
 *   "token": "xxx",
 *   "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 * }
 *
 * 年間メモ（自動車税・固定資産税の振込など）の追加:
 * {
 *   "action": "addAnnualMemo",
 *   "token": "xxx",
 *   "item_name": "自動車税",
 *   "payment_date": "5月31日ごろ",
 *   "amount": 34500,
 *   "note": "普通車・軽自動車の2台分"
 * }
 * item_name, payment_date は必須。amount, note は任意。
 *
 * 年間メモの削除:
 * {
 *   "action": "deleteAnnualMemo",
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
        var newId = addMemo_(
          body.account, body.type, body.frequency, body.day_of_month, body.amount_type, body.amount, body.memo
        );
        return jsonOutput_({ ok: true, id: newId });
      case 'deleteMemo':
        var deleted = deleteMemo_(body.id);
        return jsonOutput_({ ok: true, deleted: deleted });
      case 'addAnnualMemo':
        var newAnnualId = addAnnualMemo_(body.item_name, body.payment_date, body.amount, body.note);
        return jsonOutput_({ ok: true, id: newAnnualId });
      case 'deleteAnnualMemo':
        var deletedAnnual = deleteAnnualMemo_(body.id);
        return jsonOutput_({ ok: true, deleted: deletedAnnual });
      default:
        return jsonOutput_({ ok: false, error: 'unknown action: ' + action });
    }
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}
