'use strict';

/* ============================================
   Constants & Config
   ============================================ */

const CATEGORIES = {
  income:  ['Cash','Rent','Salary','Investment','Other'],
  expense: ['Cash','Credit','Investment','Loans','Rent','Other'],
};

const CREDIT_CARDS = [
  { name: 'Discover',  day: 1  },
  { name: 'Amex',      day: 9  },
  { name: 'Robinhood', day: 28 },
  { name: 'Amazon',    day: 5  },
];

const CATEGORY_COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#f43f5e', '#06b6d4',
  '#a78bfa', '#34d399', '#fb923c', '#e879f9', '#60a5fa',
  '#4ade80', '#fbbf24',
];

const STORAGE_KEY = 'cashflow_transactions';
const BALANCE_KEY  = 'cashflow_opening_balance';

/* ============================================
   State
   ============================================ */

let transactions        = loadTransactions();
let currentBalance      = loadBalance();  // stored opening balance
let computedCurrentBalance = currentBalance; // opening + all past tx nets; updated each render
let editingId          = null;
let editingSourceId    = null;   // set when editing a single recurring occurrence
let editingSpecificDate = null;  // the occurrence date being overridden
let pendingDeleteId    = null;
let ccMode             = false;
let _cashFlowRows      = [];

/* ============================================
   Persistence
   ============================================ */

function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const defaults = getDefaultTransactions();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults)); } catch {}
  return defaults;
}

function saveTransactions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  } catch {}
}

function loadBalance() {
  const raw = localStorage.getItem(BALANCE_KEY);
  return raw !== null ? parseFloat(raw) : 0;
}

function saveBalance(amount) {
  currentBalance = amount;
  localStorage.setItem(BALANCE_KEY, String(amount));
}

function getDefaultTransactions() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return [
    { id: uid(), type: 'income',  description: 'Monthly Salary',    category: 'Salary',          amount: 4500,  date: `${y}-${m}-01`, note: '' },
    { id: uid(), type: 'expense', description: 'Apartment Rent',    category: 'Housing',          amount: 1200,  date: `${y}-${m}-02`, note: '' },
    { id: uid(), type: 'expense', description: 'Grocery Shopping',  category: 'Food & Dining',    amount: 180,   date: `${y}-${m}-05`, note: 'Weekly groceries' },
    { id: uid(), type: 'income',  description: 'Freelance Project',  category: 'Freelance',        amount: 800,   date: `${y}-${m}-10`, note: '' },
    { id: uid(), type: 'expense', description: 'Internet & Phone',  category: 'Utilities',        amount: 90,    date: `${y}-${m}-12`, note: '' },
    { id: uid(), type: 'expense', description: 'Netflix & Spotify', category: 'Subscriptions',   amount: 25,    date: `${y}-${m}-15`, note: '' },
    { id: uid(), type: 'expense', description: 'Bus Pass',          category: 'Transport',        amount: 60,    date: `${y}-${m}-15`, note: '' },
    { id: uid(), type: 'expense', description: 'Dinner Out',        category: 'Entertainment',    amount: 75,    date: `${y}-${m}-18`, note: 'Birthday dinner' },
    { id: uid(), type: 'income',  description: 'Stock Dividend',    category: 'Investment',       amount: 120,   date: `${y}-${m}-20`, note: '' },
    { id: uid(), type: 'expense', description: 'Gym Membership',    category: 'Healthcare',       amount: 45,    date: `${y}-${m}-22`, note: '' },
  ];
}

/* ============================================
   Utilities
   ============================================ */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmt(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function nextDueDate(day) {
  const now = new Date();
  let d = new Date(now.getFullYear(), now.getMonth(), day);
  if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, day);
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

function nextDate(d, freq) {
  const n = new Date(d);
  if (freq === 'weekly')    n.setDate(n.getDate() + 7);
  if (freq === 'bimonthly') {
    const y = n.getFullYear(), m = n.getMonth(), day = n.getDate();
    const lastDay = new Date(y, m + 1, 0).getDate();
    if (day < 15)        return new Date(y, m,     15);
    if (day < lastDay)   return new Date(y, m,     lastDay);
    /* last day → */     return new Date(y, m + 1, 15);
  }
  if (freq === 'monthly')   n.setMonth(n.getMonth() + 1);
  if (freq === 'yearly')    n.setFullYear(n.getFullYear() + 1);
  return n;
}

// Expands recurring transactions into individual instances up to endDate.
// Non-recurring transactions are returned as-is (unfiltered by date).
function expandRecurring(txs, endDate) {
  const result = [];
  for (const tx of txs) {
    if (!tx.recurring) {
      result.push(tx);
      continue;
    }
    const excluded = new Set(tx.excludeDates || []);
    const txEnd = tx.recurringEnd ? new Date(tx.recurringEnd + 'T00:00:00') : null;
    const limit = txEnd && txEnd < endDate ? txEnd : endDate;
    let d = new Date(tx.date + 'T00:00:00');
    while (d <= limit) {
      const ds = dateStr(d);
      if (!excluded.has(ds)) {
        result.push({ ...tx, date: ds, id: tx.id + '_' + ds, _sourceId: tx.id });
      }
      d = nextDate(d, tx.recurring);
    }
  }
  return result;
}

/* ============================================
   Filtering
   ============================================ */

function getPeriodRange(period) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (period === 'thisMonth') {
    return {
      start: new Date(y, m, 1),
      end:   new Date(y, m + 1, 0),
    };
  }
  if (period === 'twoMonth') {
    return {
      start: new Date(y, m, 1),
      end:   new Date(y, m + 2, 0),
    };
  }
  if (period === 'lastMonth') {
    return {
      start: new Date(y, m - 1, 1),
      end:   new Date(y, m, 0),
    };
  }
  if (period === 'ytd') {
    return {
      start: new Date(y, 0, 1),
      end:   new Date(),
    };
  }
  if (period === 'thisYear') {
    return {
      start: new Date(y, 0, 1),
      end:   new Date(y, 11, 31),
    };
  }
  if (period === 'custom') {
    const startVal = document.getElementById('customStart').value;
    const endVal   = document.getElementById('customEnd').value;
    if (!startVal || !endVal) return null;
    return {
      start: new Date(startVal + 'T00:00:00'),
      end:   new Date(endVal   + 'T00:00:00'),
    };
  }
  return null;
}

function filterByPeriod(txs, period) {
  const range = getPeriodRange(period);
  if (!range) return txs;
  return txs.filter(tx => {
    const d = new Date(tx.date + 'T00:00:00');
    return d >= range.start && d <= range.end;
  });
}

function getFilteredTransactions() {
  const period   = document.getElementById('periodFilter').value;
  const type     = document.getElementById('typeFilter').value;
  const search   = document.getElementById('searchInput').value.trim().toLowerCase();

  let txs = filterByPeriod(transactions, period);

  if (type !== 'all') txs = txs.filter(tx => tx.type === type);
  if (search)             txs = txs.filter(tx =>
    tx.description.toLowerCase().includes(search) ||
    tx.category.toLowerCase().includes(search) ||
    (tx.note && tx.note.toLowerCase().includes(search))
  );

  return txs.sort((a, b) => a.date.localeCompare(b.date));
}

/* ============================================
   Summary
   ============================================ */

function updateSummary() {}

/* ============================================
   Cash Flow by Date
   ============================================ */

function getCreditCardPlaceholders(range) {
  if (!range) return [];
  const result = [];
  for (const card of CREDIT_CARDS) {
    let d = new Date(range.start.getFullYear(), range.start.getMonth(), card.day);
    if (d < range.start) d = new Date(range.start.getFullYear(), range.start.getMonth() + 1, card.day);
    while (d <= range.end) {
      const y  = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      const dueDate = `${y}-${mo}-${da}`;
      const isPast = d < new Date(today() + 'T00:00:00');
      const paid = transactions.some(tx =>
        tx.type === 'expense' && tx.category === 'Credit' &&
        tx.date === dueDate && (!tx.card || tx.card === card.name)
      );
      if (!paid && !isPast) {
        result.push({ date: dueDate, cardName: card.name, isPlaceholder: true });
      }
      d = new Date(d.getFullYear(), d.getMonth() + 1, card.day);
    }
  }
  return result;
}

function updateCashFlowTable(expanded) {
  const period = document.getElementById('periodFilter').value;
  const range  = getPeriodRange(period);
  const tbody  = document.getElementById('cashflowDateBody');

  const todayStr = today();
  const sorted = [...expanded].sort((a, b) => a.date.localeCompare(b.date));
  const dateMap = new Map();

  // Group past transactions by date and sum their nets.
  // computedCurrentBalance = stored opening balance + all past transaction nets.
  const pastByDate = new Map();
  for (const tx of sorted) {
    if (tx.date > todayStr) continue;
    if (!pastByDate.has(tx.date)) pastByDate.set(tx.date, { inflow: 0, outflow: 0, investOutflow: 0 });
    const e = pastByDate.get(tx.date);
    const net = tx.amount - (tx.brokerageAmount || 0);
    if (tx.type === 'income') e.inflow  += net;
    else {
      e.outflow += net;
      if (tx.category === 'Investment') e.investOutflow += net;
    }
  }
  let pastNets = 0;
  for (const [, e] of pastByDate) pastNets += (e.inflow - e.outflow);
  computedCurrentBalance = currentBalance + pastNets;

  // Reflect computed balance in the header display
  const displayEl = document.getElementById('currentBalanceDisplay');
  displayEl.textContent = fmt(computedCurrentBalance);
  displayEl.className   = 'current-balance-value' + (computedCurrentBalance < 0 ? ' expense' : '');

  // Past dates: walk backward from computedCurrentBalance.
  // Balance at date D = computedCurrentBalance − sum of nets from D+1 through today.
  let bal = computedCurrentBalance;
  for (const date of [...pastByDate.keys()].sort().reverse()) {
    const e = pastByDate.get(date);
    dateMap.set(date, { inflow: e.inflow, outflow: e.outflow, investOutflow: e.investOutflow, balance: bal });
    bal -= (e.inflow - e.outflow);
  }

  // Future dates: project forward from computedCurrentBalance.
  bal = computedCurrentBalance;
  for (const tx of sorted) {
    if (tx.date <= todayStr) continue;
    const net = tx.amount - (tx.brokerageAmount || 0);
    if (tx.type === 'income') bal += net;
    else                      bal -= net;
    if (!dateMap.has(tx.date)) dateMap.set(tx.date, { inflow: 0, outflow: 0, investOutflow: 0, balance: 0 });
    const e = dateMap.get(tx.date);
    if (tx.type === 'income') e.inflow  += net;
    else {
      e.outflow += net;
      if (tx.category === 'Investment') e.investOutflow += net;
    }
    e.balance = bal;
  }

  // Filter to only dates within the selected period
  const rows = [];
  for (const [date, entry] of dateMap) {
    if (range) {
      const d = new Date(date + 'T00:00:00');
      if (d < range.start || d > range.end) continue;
    }
    rows.push({ date, ...entry });
  }

  // Inject credit card placeholders for unpaid due dates within the period
  for (const ph of getCreditCardPlaceholders(range)) {
    rows.push(ph);
  }

  // Always inject a "Current" row for today if today falls within the period
  const todayDate = new Date(todayStr + 'T00:00:00');
  const todayInRange = !range || (todayDate >= range.start && todayDate <= range.end);
  if (todayInRange) {
    rows.push({ date: todayStr, inflow: 0, outflow: 0, balance: computedCurrentBalance, isCurrent: true });
  }

  if (!rows.length) {
    _cashFlowRows = [];
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No transactions found.</td></tr>';
    return;
  }

  // Sort by date; Current first, placeholders last among same-date rows
  rows.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    if (a.isCurrent)     return -1;
    if (b.isCurrent)     return  1;
    if (a.isPlaceholder) return  1;
    if (b.isPlaceholder) return -1;
    return 0;
  });
  _cashFlowRows = rows;

  tbody.innerHTML = rows.map(r => {
    if (r.isCurrent) {
      return `
        <tr class="current-row">
          <td class="tx-date current-row-label">Current</td>
          <td class="text-right"><span style="color:var(--text-muted)">—</span></td>
          <td class="text-right"><span style="color:var(--text-muted)">—</span></td>
          <td class="text-right tx-amount ${r.balance >= 0 ? '' : 'expense'}">${fmt(r.balance)}</td>
        </tr>`;
    }
    if (r.isPlaceholder) {
      return `
        <tr class="cc-placeholder-row">
          <td class="tx-date">${fmtDate(r.date)}<span class="cc-placeholder-label">${escHtml(r.cardName)}</span></td>
          <td class="text-right"><span style="color:var(--text-muted)">—</span></td>
          <td class="text-right cc-placeholder-amount">pending</td>
          <td class="text-right"><span style="color:var(--text-muted)">—</span></td>
        </tr>`;
    }
    return `
      <tr>
        <td class="tx-date">${fmtDate(r.date)}</td>
        <td class="text-right tx-amount income">${r.inflow  ? '+' + fmt(r.inflow)  : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td class="text-right tx-amount ${r.outflow && r.outflow === r.investOutflow ? 'income' : 'expense'}">${r.outflow ? '-' + fmt(r.outflow) : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td class="text-right tx-amount ${r.balance >= 0 ? '' : 'expense'}">${fmt(r.balance)}</td>
      </tr>`;
  }).join('');
}

/* ============================================
   Category Breakdown
   ============================================ */

function updateCategoryBreakdown(txs) {
  const container = document.getElementById('categoryBreakdown');
  const relevant = txs.filter(t =>
    (t.type === 'expense' && t.category !== 'Investment') ||
    (t.type === 'income' && t.category === 'Rent')
  );

  if (!relevant.length) {
    container.innerHTML = '<p class="empty-msg">No expense data.</p>';
    return;
  }

  const totals = {};
  relevant.forEach(tx => {
    const sign = tx.type === 'income' ? -1 : 1;
    totals[tx.category] = (totals[tx.category] || 0) + sign * tx.amount;
  });

  const sorted = Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) {
    container.innerHTML = '<p class="empty-msg">No expense data.</p>';
    return;
  }
  const max = sorted[0][1];

  container.innerHTML = sorted.map(([cat, amount], i) => {
    const pct   = Math.round((amount / max) * 100);
    const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
    return `
      <div class="category-item">
        <div class="category-item-header">
          <span class="category-item-name">
            <span class="category-dot" style="background:${color}"></span>
            ${cat}
          </span>
          <span class="category-item-amount" style="color:${color}">${fmt(amount)}</span>
        </div>
        <div class="category-bar-track">
          <div class="category-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }).join('');
}

/* ============================================
   Monthly CC Bills Chart
   ============================================ */

function updateCCBillsChart() {
  const container = document.getElementById('ccBillsChart');
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Expand recurring up through the end of last month
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const expanded = expandRecurring(transactions, endOfLastMonth);

  // Sum raw credit card amounts per completed month (no brokerageAmount adjustment)
  const byMonth = {};
  for (const tx of expanded) {
    if (tx.type !== 'expense' || tx.category !== 'Credit') continue;
    const ym = tx.date.slice(0, 7);
    if (ym >= currentYM) continue;
    byMonth[ym] = (byMonth[ym] || 0) + tx.amount;
  }

  const months = Object.keys(byMonth).sort();
  if (!months.length) {
    container.innerHTML = '<p class="empty-msg">No completed months yet.</p>';
    return;
  }

  const max = Math.max(...months.map(m => byMonth[m]));
  const color = 'var(--expense)';

  container.innerHTML = months.map(ym => {
    const [y, mo] = ym.split('-');
    const label = new Date(parseInt(y), parseInt(mo) - 1, 1)
      .toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const amount = byMonth[ym];
    const pct = max ? Math.round((amount / max) * 100) : 0;
    return `
      <div class="category-item">
        <div class="category-item-header">
          <span class="category-item-name">
            <span class="category-dot" style="background:${color}"></span>
            ${label}
          </span>
          <span class="category-item-amount" style="color:${color}">${fmt(amount)}</span>
        </div>
        <div class="category-bar-track">
          <div class="category-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }).join('');
}

/* ============================================
   Flows Chart
   ============================================ */

function updateFlowsChart(txs) {
  const container = document.getElementById('flowsChart');

  let inflows = 0, outflows = 0, investment = 0;
  for (const tx of txs) {
    if (tx.category === 'Investment') {
      investment += tx.type === 'income' ? -tx.amount : tx.amount;
    } else if (tx.type === 'income') {
      inflows += tx.amount;
    } else {
      outflows += tx.amount - (tx.brokerageAmount || 0);
      investment -= (tx.brokerageAmount || 0);
    }
  }

  if (!inflows && !outflows && !investment) {
    container.innerHTML = '<p class="empty-msg">No data.</p>';
    return;
  }

  const max = Math.max(inflows, outflows, Math.abs(investment));
  const rows = [
    { label: 'Inflows',    value: inflows,    barValue: inflows,              color: 'var(--income)',  prefix: '+' },
    { label: 'Outflows',   value: outflows,   barValue: outflows,             color: 'var(--expense)', prefix: '-' },
    { label: 'Investment', value: investment, barValue: Math.abs(investment), color: investment >= 0 ? 'var(--income)' : 'var(--expense)', prefix: '' },
  ];

  container.innerHTML = rows.map(r => `
    <div class="category-item">
      <div class="category-item-header">
        <span class="category-item-name">
          <span class="category-dot" style="background:${r.color}"></span>
          ${r.label}
        </span>
        <span class="category-item-amount" style="color:${r.color}">${r.prefix}${fmt(r.value)}</span>
      </div>
      <div class="category-bar-track">
        <div class="category-bar-fill" style="width:${max ? Math.round((r.barValue / max) * 100) : 0}%;background:${r.color}"></div>
      </div>
    </div>`).join('');
}

/* ============================================
   Transaction Table
   ============================================ */

function updateTable(txs) {
  const tbody = document.getElementById('txTableBody');

  const period = document.getElementById('periodFilter').value;
  const range  = getPeriodRange(period);
  const placeholders = getCreditCardPlaceholders(range);

  const allRows = [
    ...txs.map(tx => ({ ...tx, isPlaceholder: false })),
    ...placeholders,
  ].sort((a, b) => a.date.localeCompare(b.date));

  if (!allRows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No transactions found.</td></tr>';
    return;
  }

  tbody.innerHTML = allRows.map(row => {
    if (row.isPlaceholder) {
      return `
    <tr class="cc-placeholder-row">
      <td class="tx-date">${fmtDate(row.date)}</td>
      <td><span class="tx-desc">${escHtml(row.cardName)}</span><span class="cc-placeholder-label">Credit</span></td>
      <td class="cc-placeholder-amount">pending</td>
      <td></td>
    </tr>`;
    }
    return `
    <tr>
      <td class="tx-date">${fmtDate(row.date)}</td>
      <td>
        <span class="tx-desc">${escHtml(row.description)}</span>
        ${row.recurring ? `<span class="badge badge-recurring" title="${escHtml(row.recurring)}">↻</span>` : ''}
        ${row.note ? `<span class="tx-note">${escHtml(row.note)}</span>` : ''}
      </td>
      <td class="tx-amount ${row.type}">${row.type === 'income' ? '+' : '-'}${fmt(row.amount)}</td>
      <td class="tx-actions">
        <button class="icon-btn" title="Edit" onclick="${row._sourceId ? `openEdit('${row._sourceId}','${row.date}')` : `openEdit('${row.id}')`}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="icon-btn delete" title="Delete" onclick="openDelete('${row._sourceId || row.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6M14 11v6"></path>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
          </svg>
        </button>
      </td>
    </tr>`;
  }).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================
   Recurring Table
   ============================================ */

const FREQ_LABELS = { weekly: 'Weekly', bimonthly: 'Bimonthly', monthly: 'Monthly', yearly: 'Yearly' };

function updateRecurringTable() {
  const tbody = document.getElementById('recurringTableBody');
  const recurring = transactions.filter(tx => tx.recurring);

  if (!recurring.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No recurring transactions.</td></tr>';
    return;
  }

  const editIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
  const deleteIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>`;

  tbody.innerHTML = [...recurring]
    .sort((a, b) => a.description.localeCompare(b.description))
    .map(tx => `
    <tr>
      <td>
        <span class="tx-desc">${escHtml(tx.description)}</span>
        ${tx.note ? `<span class="tx-note">${escHtml(tx.note)}</span>` : ''}
      </td>
      <td><span class="badge badge-${tx.type}">${tx.type === 'income' ? 'Income' : 'Expense'}</span></td>
      <td class="tx-amount ${tx.type}">${tx.type === 'income' ? '+' : '-'}${fmt(tx.amount)}</td>
      <td>${FREQ_LABELS[tx.recurring] || tx.recurring}</td>
      <td class="tx-actions">
        <button class="icon-btn" title="Edit" onclick="openEdit('${tx.id}')">${editIcon}</button>
        <button class="icon-btn delete" title="Delete" onclick="openDelete('${tx.id}')">${deleteIcon}</button>
      </td>
    </tr>`).join('');
}

/* ============================================
   Category Filter Population
   ============================================ */


/* ============================================
   Render All
   ============================================ */

function render() {
  const period  = document.getElementById('periodFilter').value;
  const type    = document.getElementById('typeFilter').value;
  const search  = document.getElementById('searchInput').value.trim().toLowerCase();
  const range   = getPeriodRange(period);
  const cutoff  = range ? range.end : new Date(new Date().getFullYear() + 2, 11, 31);

  const expanded  = expandRecurring(transactions, cutoff);
  const periodTxs = filterByPeriod(expanded, period);

  const hideRecurring = document.getElementById('toggleRecurring').classList.contains('active');

  let tableTxs = periodTxs;
  if (hideRecurring)  tableTxs = tableTxs.filter(tx => !tx._sourceId);
  if (type !== 'all') tableTxs = tableTxs.filter(tx => tx.type === type);
  if (search) tableTxs = tableTxs.filter(tx =>
    tx.description.toLowerCase().includes(search) ||
    tx.category.toLowerCase().includes(search) ||
    (tx.note && tx.note.toLowerCase().includes(search))
  );

  updateSummary(periodTxs);
  updateTable(tableTxs);
  updateRecurringTable();
  updateCashFlowTable(expanded);
  updateCategoryBreakdown(periodTxs);
  updateFlowsChart(periodTxs);
  updateCCBillsChart();
}

/* ============================================
   Modal
   ============================================ */

function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  resetForm();
  editingId           = null;
  editingSourceId     = null;
  editingSpecificDate = null;
}

function resetForm() {
  ccMode = false;
  document.getElementById('txForm').reset();
  document.getElementById('editId').value = '';
  document.getElementById('txDate').value = today();
  setType('income');
  document.getElementById('modalTitle').textContent = 'Transaction';
  document.getElementById('submitBtn').textContent  = 'Transaction';
  updateCategoryOptions('income');
  // Restore any CC-mode layout overrides
  document.getElementById('typeGroup').hidden        = false;
  document.getElementById('descriptionGroup').hidden = false;
  document.getElementById('categoryGroup').hidden    = false;
  document.getElementById('cardPickerRow').style.order = '';
  document.getElementById('brokerageRow').hidden  = true;
  document.getElementById('recurringGroup').hidden = false;
  updateRecurringEndVisibility();
}

function setCCModeLayout(on) {
  ccMode = on;
  document.getElementById('typeGroup').hidden        = on;
  document.getElementById('descriptionGroup').hidden = on;
  document.getElementById('categoryGroup').hidden    = on;
  const cardRow = document.getElementById('cardPickerRow');
  cardRow.hidden      = !on;
  cardRow.style.order = on ? '-1' : '';
  if (on) {
    // Auto-select first card and populate description + date
    const cardSel = document.getElementById('txCard');
    if (cardSel.options.length > 1) {
      cardSel.value = cardSel.options[1].value;
      const card = CREDIT_CARDS.find(c => c.name === cardSel.value);
      if (card) {
        document.getElementById('txDate').value        = nextDueDate(card.day);
        document.getElementById('txDescription').value = card.name;
      }
    }
  }
}

function openCCModal() {
  resetForm();
  setType('expense');
  const catSel = document.getElementById('txCategory');
  catSel.innerHTML = '<option value="Credit">Credit</option>';
  catSel.value = 'Credit';
  setCCModeLayout(true);
  document.getElementById('modalTitle').textContent = 'Add CC Payment';
  document.getElementById('submitBtn').textContent  = 'Add CC Payment';
  openModal();
}

function setType(type) {
  document.getElementById('txType').value = type;
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  updateCategoryOptions(type);
}

function updateRecurringEndVisibility() {
  const hasRecurring = !!document.getElementById('txRecurring').value;
  document.getElementById('recurringEndRow').hidden = !hasRecurring;
  if (!hasRecurring) document.getElementById('txRecurringEnd').value = '';
}

function updateCardPickerVisibility() {
  const isCC = document.getElementById('txCategory').value === 'Credit';
  document.getElementById('cardPickerRow').hidden = !isCC;
  if (!isCC) document.getElementById('txCard').value = '';
}

function updateCategoryOptions(type) {
  const sel  = document.getElementById('txCategory');
  const cats = CATEGORIES[type] || [];
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
  updateCardPickerVisibility();
}

window.openEdit = function(id, specificDate) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;

  if (specificDate && tx.recurring) {
    // Editing one occurrence only — create an override, do not touch the source
    editingId           = null;
    editingSourceId     = id;
    editingSpecificDate = specificDate;

    if (tx.category === 'Credit') {
      resetForm();
      setType('expense');
      const catSel = document.getElementById('txCategory');
      catSel.innerHTML = '<option value="Credit">Credit</option>';
      catSel.value = 'Credit';
      setCCModeLayout(true);
      document.getElementById('txCard').value        = tx.card || '';
      document.getElementById('txDescription').value = tx.description;
      document.getElementById('txAmount').value      = tx.amount;
      document.getElementById('txDate').value        = specificDate;
      document.getElementById('txNote').value        = tx.note || '';
      document.getElementById('txBrokerage').value   = tx.brokerageAmount || '';
      document.getElementById('brokerageRow').hidden = tx.card !== 'Robinhood';
    } else {
      setType(tx.type);
      document.getElementById('txDescription').value = tx.description;
      document.getElementById('txAmount').value      = tx.amount;
      document.getElementById('txDate').value        = specificDate;
      document.getElementById('txNote').value        = tx.note || '';
      const catSel = document.getElementById('txCategory');
      const opt = [...catSel.options].find(o => o.value === tx.category);
      if (opt) catSel.value = tx.category;
      updateCardPickerVisibility();
    }
    // Hide repeat field — this occurrence will be non-recurring
    document.getElementById('txRecurring').value    = '';
    document.getElementById('recurringGroup').hidden = true;
    updateRecurringEndVisibility();
    document.getElementById('modalTitle').textContent = 'Edit This Occurrence';
    document.getElementById('submitBtn').textContent  = 'Save Occurrence';
    openModal();
    return;
  }

  editingId = id;
  document.getElementById('editId').value = id;

  if (tx.category === 'Credit') {
    resetForm();
    setType('expense');
    const catSel = document.getElementById('txCategory');
    catSel.innerHTML = '<option value="Credit">Credit</option>';
    catSel.value = 'Credit';
    setCCModeLayout(true);
    // Override auto-selected card/date/description with saved values
    document.getElementById('txCard').value        = tx.card || '';
    document.getElementById('txDescription').value = tx.description;
    document.getElementById('txAmount').value      = tx.amount;
    document.getElementById('txDate').value        = tx.date;
    document.getElementById('txNote').value         = tx.note || '';
    document.getElementById('txRecurring').value    = tx.recurring || '';
    document.getElementById('txRecurringEnd').value = tx.recurringEnd || '';
    document.getElementById('txBrokerage').value    = tx.brokerageAmount || '';
    document.getElementById('brokerageRow').hidden  = tx.card !== 'Robinhood';
    updateRecurringEndVisibility();
    document.getElementById('modalTitle').textContent = 'Edit CC Payment';
    document.getElementById('submitBtn').textContent  = 'Save Changes';
  } else {
    setType(tx.type);
    document.getElementById('txDescription').value = tx.description;
    document.getElementById('txAmount').value      = tx.amount;
    document.getElementById('txDate').value        = tx.date;
    document.getElementById('txNote').value         = tx.note || '';
    document.getElementById('txRecurring').value    = tx.recurring || '';
    document.getElementById('txRecurringEnd').value = tx.recurringEnd || '';
    updateRecurringEndVisibility();
    const catSel = document.getElementById('txCategory');
    const opt = [...catSel.options].find(o => o.value === tx.category);
    if (opt) catSel.value = tx.category;
    updateCardPickerVisibility();
    document.getElementById('modalTitle').textContent = 'Edit Transaction';
    document.getElementById('submitBtn').textContent  = 'Save Changes';
  }

  openModal();
};

window.openDelete = function(id) {
  pendingDeleteId = id;
  document.getElementById('deleteOverlay').classList.add('open');
};

/* ============================================
   Invest Modal
   ============================================ */

function openInvestModal() {
  const todayStr = today();
  const balanceRows = _cashFlowRows.filter(r => !r.isPlaceholder && r.date >= todayStr);
  if (!balanceRows.length) return;

  // Compute floor from future transaction rows (excluding the synthetic "today" row)
  // so a low current balance doesn't mask a future safe withdrawal window.
  const futureRows = balanceRows.filter(r => !r.isCurrent);
  const floorRows  = futureRows.length ? futureRows : balanceRows;
  const minRow     = floorRows.reduce((min, r) => r.balance < min.balance ? r : min, floorRows[0]);
  const floor      = minRow.balance;
  const investable = floor - 100;

  if (investable <= 0) {
    document.getElementById('investContent').innerHTML = `
      <p class="invest-note" style="margin-top:12px">No investment opportunity — balance is projected to stay at or below $100 in this period.</p>
    `;
    document.getElementById('investOverlay').classList.add('open');
    return;
  }

  // Earliest date (from today forward, sorted chronologically) where balance >= floor,
  // meaning a withdrawal of `investable` can be made without the future balance dropping below $100.
  const sorted      = [...balanceRows].sort((a, b) => a.date.localeCompare(b.date));
  const earliestRow = sorted.find(r => r.balance >= floor);
  const earliestStr = earliestRow ? earliestRow.date : sorted[0].date;
  const dateLabel   = earliestStr === todayStr ? 'Available now' : `Available from ${fmtDate(earliestStr)}`;

  const pendingAfter = _cashFlowRows.filter(r => r.isPlaceholder && r.date > minRow.date);
  const pendingHtml  = pendingAfter.length ? `
    <div class="invest-pending">
      <p class="invest-pending-title">Pending payments after floor date</p>
      ${pendingAfter.map(p => `
        <div class="invest-pending-item">
          <span>${fmtDate(p.date)}</span>
          <span class="invest-pending-card">${escHtml(p.cardName)}</span>
        </div>`).join('')}
    </div>` : '';

  const noteText = `Investable while keeping a $100 floor. Balance reaches its projected minimum of ${fmt(floor)} on ${fmtDate(minRow.date)}.`;

  document.getElementById('investContent').innerHTML = `
    <div class="invest-amount">${fmt(investable)}</div>
    <p class="invest-date">${dateLabel}</p>
    <p class="invest-note">${noteText}</p>
    ${pendingHtml}
  `;

  document.getElementById('investOverlay').classList.add('open');
}

/* ============================================
   Current Balance Editing
   ============================================ */

function openEditBalance() {
  document.getElementById('currentBalanceDisplay').hidden = true;
  document.getElementById('editBalanceBtn').hidden        = true;
  document.getElementById('currentBalanceForm').hidden    = false;
  document.getElementById('currentBalanceInput').value   = computedCurrentBalance;
  document.getElementById('currentBalanceInput').select();
}

function confirmEditBalance() {
  const val = parseFloat(document.getElementById('currentBalanceInput').value);
  if (!isNaN(val)) {
    // Store as opening balance so that computed (opening + pastNets) equals what the user typed.
    // opening = val − pastNets  →  computed = val − pastNets + pastNets = val
    const pastNets = computedCurrentBalance - currentBalance;
    saveBalance(val - pastNets);
  }
  closeEditBalance();
  render();
}

function closeEditBalance() {
  document.getElementById('currentBalanceDisplay').hidden = false;
  document.getElementById('editBalanceBtn').hidden        = false;
  document.getElementById('currentBalanceForm').hidden    = true;
}

/* ============================================
   Form Submit
   ============================================ */

document.getElementById('txForm').addEventListener('submit', e => {
  e.preventDefault();

  const recurring    = document.getElementById('txRecurring').value || null;
  const recurringEnd = (recurring && document.getElementById('txRecurringEnd').value) || null;
  const card         = document.getElementById('txCard').value || null;
  const brokerageRaw = parseFloat(document.getElementById('txBrokerage').value);
  const brokerageAmount = (card === 'Robinhood' && brokerageRaw > 0) ? brokerageRaw : null;
  const tx = {
    id:           editingId || uid(),
    type:         document.getElementById('txType').value,
    description:  document.getElementById('txDescription').value.trim(),
    amount:       parseFloat(document.getElementById('txAmount').value),
    category:     document.getElementById('txCategory').value,
    date:         document.getElementById('txDate').value,
    note:         document.getElementById('txNote').value.trim(),
    recurring,
    recurringEnd,
    card,
    brokerageAmount,
  };

  if (!tx.description || isNaN(tx.amount)) return;

  if (editingSourceId) {
    // Single-occurrence override: exclude that date from the recurring series,
    // then insert a standalone (non-recurring) transaction for the edited data.
    const src = transactions.find(t => t.id === editingSourceId);
    if (src) src.excludeDates = [...(src.excludeDates || []), editingSpecificDate];
    transactions.push({ ...tx, id: uid(), recurring: null, recurringEnd: null });
    editingSourceId     = null;
    editingSpecificDate = null;
  } else if (editingId) {
    const idx = transactions.findIndex(t => t.id === editingId);
    if (idx !== -1) transactions[idx] = tx;
  } else {
    transactions.push(tx);
  }

  saveTransactions();
  closeModal();
  render();
});

/* ============================================
   Event Listeners
   ============================================ */

document.getElementById('openModalBtn').addEventListener('click', () => {
  resetForm();
  openModal();
});

document.getElementById('openCCModalBtn').addEventListener('click', openCCModal);

document.getElementById('closeModalBtn').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);

document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// Type toggle buttons
document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => setType(btn.dataset.type));
});

// Delete confirmation
document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
  if (pendingDeleteId) {
    transactions = transactions.filter(t => t.id !== pendingDeleteId);
    saveTransactions();
    pendingDeleteId = null;
    document.getElementById('deleteOverlay').classList.remove('open');
    render();
  }
});

document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
  pendingDeleteId = null;
  document.getElementById('deleteOverlay').classList.remove('open');
});

document.getElementById('deleteOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) {
    pendingDeleteId = null;
    document.getElementById('deleteOverlay').classList.remove('open');
  }
});

document.getElementById('investBtn').addEventListener('click', openInvestModal);
document.getElementById('closeInvestBtn').addEventListener('click', () => {
  document.getElementById('investOverlay').classList.remove('open');
});
document.getElementById('investOverlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) {
    document.getElementById('investOverlay').classList.remove('open');
  }
});

// Opening balance editing
document.getElementById('editBalanceBtn').addEventListener('click', openEditBalance);
document.getElementById('saveBalanceBtn').addEventListener('click', confirmEditBalance);
document.getElementById('cancelBalanceBtn').addEventListener('click', closeEditBalance);
document.getElementById('currentBalanceInput').addEventListener('keydown', e => {
  if (e.key === 'Enter')  confirmEditBalance();
  if (e.key === 'Escape') closeEditBalance();
});

// Recurring end date
document.getElementById('txRecurring').addEventListener('change', updateRecurringEndVisibility);

// Credit card picker
document.getElementById('txCategory').addEventListener('change', updateCardPickerVisibility);
document.getElementById('txCard').addEventListener('change', () => {
  const cardName = document.getElementById('txCard').value;
  const card = CREDIT_CARDS.find(c => c.name === cardName);
  if (card) {
    document.getElementById('txDate').value = nextDueDate(card.day);
    if (ccMode) document.getElementById('txDescription').value = card.name;
  }
  document.getElementById('brokerageRow').hidden = cardName !== 'Robinhood';
  if (cardName !== 'Robinhood') document.getElementById('txBrokerage').value = '';
});

// Filters
['periodFilter', 'typeFilter', 'searchInput'].forEach(id => {
  document.getElementById(id).addEventListener('input', render);
});

document.getElementById('toggleRecurring').addEventListener('click', () => {
  document.getElementById('toggleRecurring').classList.toggle('active');
  render();
});

document.getElementById('transactionsToggle').addEventListener('click', e => {
  if (e.target.closest('#toggleRecurring') || e.target.closest('input') || e.target.closest('select')) return;
  document.getElementById('transactionsSection').classList.toggle('collapsed');
});

document.getElementById('recurringToggle').addEventListener('click', () => {
  document.getElementById('recurringSection').classList.toggle('collapsed');
});

document.getElementById('periodFilter').addEventListener('input', () => {
  document.getElementById('customDateRange').hidden =
    document.getElementById('periodFilter').value !== 'custom';
});

['customStart', 'customEnd'].forEach(id => {
  document.getElementById(id).addEventListener('input', render);
});

// Keyboard close
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    pendingDeleteId = null;
    document.getElementById('deleteOverlay').classList.remove('open');
  }
});


/* ============================================
   Export / Import
   ============================================ */

function exportData() {
  const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), balance: currentBalance, transactions }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `cashflow-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data.transactions)) throw new Error();
      transactions = data.transactions;
      saveTransactions();
      if (typeof data.balance === 'number') saveBalance(data.balance);
      render();
    } catch {
      alert('Import failed: the selected file is not a valid CashFlow backup.');
    }
  };
  reader.readAsText(file);
}

document.getElementById('exportBtn').addEventListener('click', exportData);

document.getElementById('importInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) importData(file);
  e.target.value = '';
});

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importInput').click();
});

/* ============================================
   Init
   ============================================ */

document.getElementById('txDate').value = today();

// One-time migration: old model stored the actual current balance directly.
// New model stores an opening balance; displayed = opening + past tx nets.
// Adjust: new opening = old actual − pastNets, so the displayed value is unchanged.
const BALANCE_MIGRATED_KEY = 'cashflow_balance_migrated_v2';
if (!localStorage.getItem(BALANCE_MIGRATED_KEY)) {
  const migExpanded = expandRecurring(transactions, new Date());
  const migToday    = today();
  let migPastNets   = 0;
  for (const tx of migExpanded) {
    if (tx.date > migToday) continue;
    const net = tx.amount - (tx.brokerageAmount || 0);
    if (tx.type === 'income') migPastNets += net;
    else                      migPastNets -= net;
  }
  currentBalance -= migPastNets;
  try { localStorage.setItem(BALANCE_KEY, String(currentBalance)); } catch {}
  try { localStorage.setItem(BALANCE_MIGRATED_KEY, '1'); } catch {}
}

// Populate credit card picker
const cardSel = document.getElementById('txCard');
CREDIT_CARDS.forEach(c => {
  const opt = document.createElement('option');
  opt.value = c.name;
  opt.textContent = `${c.name} — due ${c.day}`;
  cardSel.appendChild(opt);
});


render();
