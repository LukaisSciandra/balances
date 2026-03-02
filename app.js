'use strict';

/* ============================================
   Constants & Config
   ============================================ */

const CATEGORIES = {
  income: [
    'Salary',
    'Freelance',
    'Business',
    'Investment',
    'Gift',
    'Refund',
    'Other Income',
  ],
  expense: [
    'Housing',
    'Food & Dining',
    'Transport',
    'Healthcare',
    'Shopping',
    'Entertainment',
    'Education',
    'Utilities',
    'Subscriptions',
    'Travel',
    'Other Expense',
  ],
};

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
    return raw ? JSON.parse(raw) : getDefaultTransactions();
  } catch {
    return [];
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
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
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function today() {
  return new Date().toISOString().slice(0, 10);
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
  const category = document.getElementById('categoryFilter').value;
  const search   = document.getElementById('searchInput').value.trim().toLowerCase();

  let txs = filterByPeriod(transactions, period);

  if (type !== 'all')     txs = txs.filter(tx => tx.type === type);
  if (category !== 'all') txs = txs.filter(tx => tx.category === category);
  if (search)             txs = txs.filter(tx =>
    tx.description.toLowerCase().includes(search) ||
    tx.category.toLowerCase().includes(search) ||
    (tx.note && tx.note.toLowerCase().includes(search))
  );

  return txs.sort((a, b) => b.date.localeCompare(a.date));
}

/* ============================================
   Summary
   ============================================ */

function updateSummary() {}

/* ============================================
   Cash Flow by Date
   ============================================ */

function updateCashFlowTable() {
  const period = document.getElementById('periodFilter').value;
  const range  = getPeriodRange(period);
  const tbody  = document.getElementById('cashflowDateBody');

  // Reflect current opening balance in the header display
  const displayEl = document.getElementById('currentBalanceDisplay');
  displayEl.textContent = fmt(currentBalance);
  displayEl.className   = 'current-balance-value' + (currentBalance < 0 ? ' expense' : '');

  // Walk all transactions in chronological order to compute running balance
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

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

  if (!rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No transactions found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="tx-date">${fmtDate(r.date)}</td>
      <td class="text-right tx-amount income">${r.inflow  ? '+' + fmt(r.inflow)  : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td class="text-right tx-amount expense">${r.outflow ? '-' + fmt(r.outflow) : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td class="text-right tx-amount ${r.balance >= 0 ? 'income' : 'expense'}">${fmt(r.balance)}</td>
    </tr>`).join('');
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
   Chart (Canvas)
   ============================================ */

function updateChart(txs) {
  const canvas  = document.getElementById('flowChart');
  const ctx     = canvas.getContext('2d');
  const dpr     = window.devicePixelRatio || 1;
  const rect    = canvas.parentElement.getBoundingClientRect();
  const W       = rect.width;
  const H       = rect.height || 220;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, W, H);

  // Build monthly buckets for the past 6 months
  const buckets = buildMonthlyBuckets(txs, 6);
  if (!buckets.length) return;

  const padL = 56, padR = 16, padT = 16, padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const allAmounts = buckets.flatMap(b => [b.income, b.expense]);
  const maxVal     = Math.max(...allAmounts, 1);
  const barGroupW  = chartW / buckets.length;
  const barW       = Math.min(barGroupW * 0.3, 24);

  // Y axis grid
  const gridLines = 4;
  ctx.strokeStyle = 'rgba(46,49,72,0.8)';
  ctx.lineWidth   = 1;
  ctx.fillStyle   = 'rgba(139,143,168,0.8)';
  ctx.font        = `11px -apple-system, sans-serif`;
  ctx.textAlign   = 'right';

  for (let i = 0; i <= gridLines; i++) {
    const val = (maxVal * i) / gridLines;
    const y   = padT + chartH - (val / maxVal) * chartH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillText(val >= 1000 ? `$${(val / 1000).toFixed(1)}k` : `$${Math.round(val)}`, padL - 6, y + 4);
  }

  // Bars
  buckets.forEach((b, i) => {
    const cx = padL + barGroupW * i + barGroupW / 2;

    // Income bar
    const ih = (b.income / maxVal) * chartH;
    ctx.fillStyle = 'rgba(34,197,94,0.85)';
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(cx - barW - 2, padT + chartH - ih, barW, ih, [3, 3, 0, 0])
      : ctx.rect(cx - barW - 2, padT + chartH - ih, barW, ih);
    ctx.fill();

    // Expense bar
    const eh = (b.expense / maxVal) * chartH;
    ctx.fillStyle = 'rgba(244,63,94,0.85)';
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(cx + 2, padT + chartH - eh, barW, eh, [3, 3, 0, 0])
      : ctx.rect(cx + 2, padT + chartH - eh, barW, eh);
    ctx.fill();

    // Month label
    ctx.fillStyle = 'rgba(139,143,168,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, cx, H - padB + 16);
  });

  // Legend
  const legendY = H - padB + 30;
  ctx.font      = '11px -apple-system, sans-serif';
  ctx.textAlign = 'left';

  ctx.fillStyle = 'rgba(34,197,94,0.85)';
  ctx.fillRect(padL, legendY - 9, 10, 10);
  ctx.fillStyle = 'rgba(139,143,168,0.9)';
  ctx.fillText('Income', padL + 14, legendY);

  ctx.fillStyle = 'rgba(244,63,94,0.85)';
  ctx.fillRect(padL + 70, legendY - 9, 10, 10);
  ctx.fillStyle = 'rgba(139,143,168,0.9)';
  ctx.fillText('Expenses', padL + 84, legendY);
}

function buildMonthlyBuckets(txs, count) {
  const buckets = [];
  const now     = new Date();

  for (let i = count - 1; i >= 0; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year  = d.getFullYear();
    const month = d.getMonth();
    const label = d.toLocaleDateString('en-US', { month: 'short' });

    const monthTxs = transactions.filter(tx => {
      const td = new Date(tx.date + 'T00:00:00');
      return td.getFullYear() === year && td.getMonth() === month;
    });

    buckets.push({
      label,
      income:  monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      expense: monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    });
  }
  return buckets;
}

/* ============================================
   Transaction Table
   ============================================ */

function updateTable(txs) {
  const tbody = document.getElementById('txTableBody');

  if (!txs.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No transactions found.</td></tr>';
    return;
  }

  tbody.innerHTML = txs.map(tx => `
    <tr>
      <td class="tx-date">${fmtDate(tx.date)}</td>
      <td>
        <span class="tx-desc">${escHtml(tx.description)}</span>
        ${tx.note ? `<span class="tx-note">${escHtml(tx.note)}</span>` : ''}
      </td>
      <td><span class="badge badge-category">${escHtml(tx.category)}</span></td>
      <td><span class="badge badge-${tx.type}">${tx.type}</span></td>
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
   Category Filter Population
   ============================================ */

function populateCategoryFilter() {
  const sel = document.getElementById('categoryFilter');
  const current = sel.value;
  const allCats = [...new Set(transactions.map(t => t.category))].sort();
  sel.innerHTML = '<option value="all">All Categories</option>' +
    allCats.map(c => `<option value="${escHtml(c)}"${c === current ? ' selected' : ''}>${escHtml(c)}</option>`).join('');
}

/* ============================================
   Render All
   ============================================ */

function render() {
  const txs = getFilteredTransactions();
  updateSummary(filterByPeriod(transactions, document.getElementById('periodFilter').value));
  updateTable(txs);
  updateCashFlowTable();
  updateCategoryBreakdown(filterByPeriod(transactions, document.getElementById('periodFilter').value));
  updateChart(transactions);
  populateCategoryFilter();
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

function updateCategoryOptions(type) {
  const sel  = document.getElementById('txCategory');
  const cats = CATEGORIES[type] || [];
  sel.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
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

  // Set category after options are updated
  const catSel = document.getElementById('txCategory');
  const opt = [...catSel.options].find(o => o.value === tx.category);
  if (opt) catSel.value = tx.category;

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

  const tx = {
    id:          editingId || uid(),
    type:        document.getElementById('txType').value,
    description: document.getElementById('txDescription').value.trim(),
    amount:      parseFloat(document.getElementById('txAmount').value),
    category:    document.getElementById('txCategory').value,
    date:        document.getElementById('txDate').value,
    note:        document.getElementById('txNote').value.trim(),
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

// Filters
['periodFilter', 'typeFilter', 'categoryFilter', 'searchInput'].forEach(id => {
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

// Redraw chart on resize
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => updateChart(transactions), 150);
});

/* ============================================
   Init
   ============================================ */

document.getElementById('txDate').value = today();
render();
