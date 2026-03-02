'use strict';

/* ============================================
   Constants & Config
   ============================================ */

const CATEGORIES = {
  income:  ['Rent', 'Salary', 'Venmo', 'Other'],
  expense: ['Rent', 'Credit Card', 'Venmo', 'Investment', 'Other'],
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

let transactions   = loadTransactions();
let currentBalance = loadBalance();
let editingId      = null;
let pendingDeleteId = null;

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
  if (freq === 'weekly')   n.setDate(n.getDate() + 7);
  if (freq === 'biweekly') n.setDate(n.getDate() + 14);
  if (freq === 'monthly')  n.setMonth(n.getMonth() + 1);
  if (freq === 'yearly')   n.setFullYear(n.getFullYear() + 1);
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
    let d = new Date(tx.date + 'T00:00:00');
    while (d <= endDate) {
      result.push({ ...tx, date: dateStr(d), id: tx.id + '_' + dateStr(d) });
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
  if (period === 'thisYear') {
    return {
      start: new Date(y, 0, 1),
      end:   new Date(y, 11, 31),
    };
  }
  return null; // all
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
      const paid = transactions.some(tx =>
        tx.type === 'expense' && tx.category === 'Credit Card' &&
        tx.date === dueDate && (!tx.card || tx.card === card.name)
      );
      if (!paid) {
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

  // Reflect current balance in the header display
  const displayEl = document.getElementById('currentBalanceDisplay');
  displayEl.textContent = fmt(currentBalance);
  displayEl.className   = 'current-balance-value' + (currentBalance < 0 ? ' expense' : '');

  // Walk all expanded transactions in chronological order to compute running balance
  const sorted = [...expanded].sort((a, b) => a.date.localeCompare(b.date));

  let balance = currentBalance;
  const dateMap = new Map();

  for (const tx of sorted) {
    if (tx.type === 'income') balance += tx.amount;
    else                      balance -= tx.amount;

    if (!dateMap.has(tx.date)) {
      dateMap.set(tx.date, { inflow: 0, outflow: 0, balance: 0 });
    }
    const entry = dateMap.get(tx.date);
    if (tx.type === 'income') entry.inflow  += tx.amount;
    else                      entry.outflow += tx.amount;
    entry.balance = balance;
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
  const todayStr = today();
  const todayDate = new Date(todayStr + 'T00:00:00');
  const todayInRange = !range || (todayDate >= range.start && todayDate <= range.end);
  if (todayInRange) {
    rows.push({ date: todayStr, inflow: 0, outflow: 0, balance: currentBalance, isCurrent: true });
  }

  if (!rows.length) {
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

  tbody.innerHTML = rows.map(r => {
    if (r.isCurrent) {
      return `
        <tr class="current-row">
          <td class="tx-date current-row-label">Current</td>
          <td class="text-right"><span style="color:var(--text-muted)">—</span></td>
          <td class="text-right"><span style="color:var(--text-muted)">—</span></td>
          <td class="text-right tx-amount ${r.balance >= 0 ? 'income' : 'expense'}">${fmt(r.balance)}</td>
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
        <td class="text-right tx-amount expense">${r.outflow ? '-' + fmt(r.outflow) : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td class="text-right tx-amount ${r.balance >= 0 ? 'income' : 'expense'}">${fmt(r.balance)}</td>
      </tr>`;
  }).join('');
}

/* ============================================
   Category Breakdown
   ============================================ */

function updateCategoryBreakdown(txs) {
  const container = document.getElementById('categoryBreakdown');
  const expenses  = txs.filter(t => t.type === 'expense');

  if (!expenses.length) {
    container.innerHTML = '<p class="empty-msg">No expense data.</p>';
    return;
  }

  const totals = {};
  expenses.forEach(tx => {
    totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
  });

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max    = sorted[0][1];

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
   Transaction Table
   ============================================ */

function updateTable(txs) {
  const tbody = document.getElementById('txTableBody');
  txs = txs.filter(tx => !tx.recurring);

  if (!txs.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No transactions found.</td></tr>';
    return;
  }

  tbody.innerHTML = txs.map(tx => `
    <tr>
      <td class="tx-date">${fmtDate(tx.date)}</td>
      <td>
        <span class="tx-desc">${escHtml(tx.description)}</span>
        ${tx.recurring ? `<span class="badge badge-recurring" title="${escHtml(tx.recurring)}">↻</span>` : ''}
        ${tx.note ? `<span class="tx-note">${escHtml(tx.note)}</span>` : ''}
      </td>
      <td class="tx-amount ${tx.type}">${tx.type === 'income' ? '+' : '-'}${fmt(tx.amount)}</td>
      <td class="tx-actions">
        <button class="icon-btn" title="Edit" onclick="openEdit('${tx.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="icon-btn delete" title="Delete" onclick="openDelete('${tx.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6M14 11v6"></path>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
          </svg>
        </button>
      </td>
    </tr>`).join('');
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

const FREQ_LABELS = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', yearly: 'Yearly' };

function updateRecurringTable() {
  const tbody = document.getElementById('recurringTableBody');
  const recurring = transactions.filter(tx => tx.recurring);

  if (!recurring.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No recurring transactions.</td></tr>';
    return;
  }

  const editIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
  const deleteIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>`;

  tbody.innerHTML = recurring.map(tx => `
    <tr>
      <td>
        <span class="tx-desc">${escHtml(tx.description)}</span>
        ${tx.note ? `<span class="tx-note">${escHtml(tx.note)}</span>` : ''}
      </td>
      <td><span class="badge badge-${tx.type}">${tx.type === 'income' ? 'Income' : 'Expense'}</span></td>
      <td class="tx-amount ${tx.type}">${tx.type === 'income' ? '+' : '-'}${fmt(tx.amount)}</td>
      <td>${FREQ_LABELS[tx.recurring] || tx.recurring}</td>
      <td class="tx-date">${fmtDate(tx.date)}</td>
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
  const range   = getPeriodRange(period);
  const cutoff  = range ? range.end : new Date(new Date().getFullYear() + 2, 11, 31);

  const expanded  = expandRecurring(transactions, cutoff);
  const periodTxs = filterByPeriod(expanded, period);

  updateSummary(periodTxs);
  updateTable(getFilteredTransactions());
  updateRecurringTable();
  updateCashFlowTable(expanded);
  updateCategoryBreakdown(periodTxs);
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
  editingId = null;
}

function resetForm() {
  document.getElementById('txForm').reset();
  document.getElementById('editId').value = '';
  document.getElementById('txDate').value = today();
  setType('income');
  document.getElementById('modalTitle').textContent = 'Add Transaction';
  document.getElementById('submitBtn').textContent  = 'Add Transaction';
  updateCategoryOptions('income');
}

function setType(type) {
  document.getElementById('txType').value = type;
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  updateCategoryOptions(type);
}

function updateCardPickerVisibility() {
  const isCC = document.getElementById('txCategory').value === 'Credit Card';
  document.getElementById('cardPickerRow').hidden = !isCC;
  if (!isCC) document.getElementById('txCard').value = '';
}

function updateCategoryOptions(type) {
  const sel  = document.getElementById('txCategory');
  const cats = CATEGORIES[type] || [];
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
  updateCardPickerVisibility();
}

window.openEdit = function(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;

  editingId = id;
  document.getElementById('modalTitle').textContent = 'Edit Transaction';
  document.getElementById('submitBtn').textContent  = 'Save Changes';
  document.getElementById('editId').value           = id;
  setType(tx.type);
  document.getElementById('txDescription').value = tx.description;
  document.getElementById('txAmount').value      = tx.amount;
  document.getElementById('txDate').value        = tx.date;
  document.getElementById('txNote').value        = tx.note || '';
  document.getElementById('txRecurring').value   = tx.recurring || '';

  // Set category after options are updated
  const catSel = document.getElementById('txCategory');
  const opt = [...catSel.options].find(o => o.value === tx.category);
  if (opt) catSel.value = tx.category;
  updateCardPickerVisibility();

  openModal();
};

window.openDelete = function(id) {
  pendingDeleteId = id;
  document.getElementById('deleteOverlay').classList.add('open');
};

/* ============================================
   Current Balance Editing
   ============================================ */

function openEditBalance() {
  document.getElementById('currentBalanceDisplay').hidden = true;
  document.getElementById('editBalanceBtn').hidden        = true;
  document.getElementById('currentBalanceForm').hidden    = false;
  document.getElementById('currentBalanceInput').value   = currentBalance;
  document.getElementById('currentBalanceInput').select();
}

function confirmEditBalance() {
  const val = parseFloat(document.getElementById('currentBalanceInput').value);
  if (!isNaN(val)) saveBalance(val);
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

  const recurring = document.getElementById('txRecurring').value || null;
  const card      = document.getElementById('txCard').value || null;
  const tx = {
    id:          editingId || uid(),
    type:        document.getElementById('txType').value,
    description: document.getElementById('txDescription').value.trim(),
    amount:      parseFloat(document.getElementById('txAmount').value),
    category:    document.getElementById('txCategory').value,
    date:        document.getElementById('txDate').value,
    note:        document.getElementById('txNote').value.trim(),
    recurring,
    card,
  };

  if (!tx.description || isNaN(tx.amount) || tx.amount <= 0) return;

  if (editingId) {
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

// Opening balance editing
document.getElementById('editBalanceBtn').addEventListener('click', openEditBalance);
document.getElementById('saveBalanceBtn').addEventListener('click', confirmEditBalance);
document.getElementById('cancelBalanceBtn').addEventListener('click', closeEditBalance);
document.getElementById('currentBalanceInput').addEventListener('keydown', e => {
  if (e.key === 'Enter')  confirmEditBalance();
  if (e.key === 'Escape') closeEditBalance();
});

// Credit card picker
document.getElementById('txCategory').addEventListener('change', updateCardPickerVisibility);
document.getElementById('txCard').addEventListener('change', () => {
  const card = CREDIT_CARDS.find(c => c.name === document.getElementById('txCard').value);
  if (card) document.getElementById('txDate').value = nextDueDate(card.day);
});

// Filters
['periodFilter', 'typeFilter', 'searchInput'].forEach(id => {
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
      document.getElementById('syncBanner').hidden = true;
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

// Populate credit card picker
const cardSel = document.getElementById('txCard');
CREDIT_CARDS.forEach(c => {
  const opt = document.createElement('option');
  opt.value = c.name;
  opt.textContent = `${c.name} — due ${c.day}`;
  cardSel.appendChild(opt);
});

// Show sync banner automatically when running as an installed PWA (standalone mode).
// On iOS, the Home Screen app has a completely separate localStorage from Safari,
// so users must import a backup exported from their browser.
if (window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches) {
  document.getElementById('syncBanner').hidden = false;
}

document.getElementById('syncBannerDismiss').addEventListener('click', () => {
  document.getElementById('syncBanner').hidden = true;
});

document.getElementById('syncBannerImport').addEventListener('click', () => {
  document.getElementById('importInput').click();
});

render();
