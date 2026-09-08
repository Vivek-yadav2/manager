// ===================================================================
// Keyhold — Tenant Manager
// All data lives in localStorage. No server, no network required.
// ===================================================================

const STORAGE_KEY = 'keyhold_data_v1';
const THEME_KEY = 'keyhold_theme';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
let state = loadState();
let activeTenantId = null;
let editingTenantId = null; // set when tenant-form is in edit mode
let currentFilter = 'all';
let searchTerm = '';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through to seed */ }
  return { properties: [], tenants: [], payments: [] };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast("Couldn't save — storage may be full.");
  }
}

// ---------------------------------------------------------------
// Derived data helpers
// ---------------------------------------------------------------
function getProperty(id) { return state.properties.find(p => p.id === id); }
function getTenant(id) { return state.tenants.find(t => t.id === id); }

function tenantPaymentsThisMonth(tenantId, month = currentMonth()) {
  return state.payments.filter(p => p.tenantId === tenantId && p.month === month);
}

function tenantStatus(tenant) {
  const paid = tenantPaymentsThisMonth(tenant.id);
  if (paid.length > 0) return 'paid';
  const today = new Date();
  const dueDay = Number(tenant.dueDay) || 5;
  return today.getDate() > dueDay ? 'overdue' : 'due';
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMonth(m) {
  if (!m) return '—';
  const d = new Date(m + '-01T00:00:00');
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ---------------------------------------------------------------
// Routing between full-screen views
// ---------------------------------------------------------------
const views = ['dashboard', 'tenants', 'tenant-detail', 'tenant-form', 'payments', 'properties'];

function showView(name) {
  views.forEach(v => {
    document.getElementById('view-' + v).hidden = (v !== name);
  });
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === name);
  });
  const tabbar = document.querySelector('.tabbar');
  tabbar.style.display = (name === 'tenant-detail' || name === 'tenant-form') ? 'none' : 'flex';
  window.scrollTo(0, 0);
  render();
}

document.querySelectorAll('.tab[data-view]').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});
document.querySelectorAll('[data-back]').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.back));
});

// ---------------------------------------------------------------
// Toast
// ---------------------------------------------------------------
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

// ---------------------------------------------------------------
// Rendering — master function keeps everything in sync
// ---------------------------------------------------------------
function render() {
  renderDashboard();
  renderTenantsList();
  renderPropertiesList();
  renderPaymentsList();
  populatePropertySelect();
  if (activeTenantId) renderTenantDetail();
}

function renderDashboard() {
  const month = currentMonth();
  let expected = 0, collected = 0;
  state.tenants.forEach(t => {
    expected += Number(t.rent || 0);
    const paidSum = tenantPaymentsThisMonth(t.id, month).reduce((s, p) => s + Number(p.amount || 0), 0);
    collected += paidSum;
  });
  const pending = Math.max(expected - collected, 0);

  document.getElementById('sum-expected').textContent = money(expected);
  document.getElementById('sum-collected').textContent = money(collected);
  document.getElementById('sum-pending').textContent = money(pending);
  document.getElementById('sum-counts').textContent = `${state.tenants.length} · ${state.properties.length}`;

  const dueList = document.getElementById('dashboard-due-list');
  const empty = document.getElementById('dashboard-empty');
  dueList.innerHTML = '';

  if (state.tenants.length === 0) {
    empty.hidden = false;
    dueList.hidden = true;
    return;
  }
  empty.hidden = true;
  dueList.hidden = false;

  const dueTenants = state.tenants
    .filter(t => tenantStatus(t) !== 'paid')
    .sort((a, b) => (tenantStatus(a) === 'overdue' ? -1 : 1) - (tenantStatus(b) === 'overdue' ? -1 : 1));

  if (dueTenants.length === 0) {
    dueList.innerHTML = '<p class="empty-body" style="padding:20px 0;">Everyone is paid up this month.</p>';
    return;
  }
  dueTenants.forEach(t => dueList.appendChild(tenantRow(t)));
}

function tenantRow(t) {
  const row = document.createElement('div');
  row.className = 'tenant-row';
  const prop = getProperty(t.propertyId);
  const status = tenantStatus(t);
  row.innerHTML = `
    <div class="avatar">${initials(t.name)}</div>
    <div class="tinfo">
      <div class="tname">${escapeHtml(t.name)}</div>
      <div class="tsub">${escapeHtml(prop ? prop.name : 'No property')}${t.unit ? ' · ' + escapeHtml(t.unit) : ''}</div>
    </div>
    <span class="status-pill ${status}">${status === 'paid' ? 'Paid' : status === 'overdue' ? 'Overdue' : 'Due'}</span>
  `;
  row.addEventListener('click', () => openTenantDetail(t.id));
  return row;
}

function renderTenantsList() {
  const list = document.getElementById('tenants-list');
  const empty = document.getElementById('tenants-empty');
  list.innerHTML = '';

  let filtered = state.tenants.filter(t => {
    const status = tenantStatus(t);
    if (currentFilter !== 'all' && status !== currentFilter) return false;
    if (searchTerm) {
      const prop = getProperty(t.propertyId);
      const hay = (t.name + ' ' + (prop ? prop.name : '') + ' ' + (t.unit || '')).toLowerCase();
      if (!hay.includes(searchTerm.toLowerCase())) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  filtered.forEach(t => list.appendChild(tenantRow(t)));
}

function renderPropertiesList() {
  const list = document.getElementById('properties-list');
  const empty = document.getElementById('properties-empty');
  list.innerHTML = '';
  if (state.properties.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  state.properties.forEach(p => {
    const count = state.tenants.filter(t => t.propertyId === p.id).length;
    const row = document.createElement('div');
    row.className = 'property-row';
    row.innerHTML = `
      <div class="pname">${escapeHtml(p.name)}</div>
      ${p.address ? `<div class="paddr">${escapeHtml(p.address)}</div>` : ''}
      <div class="pmeta">${count} tenant${count === 1 ? '' : 's'}</div>
    `;
    list.appendChild(row);
  });
}

function renderPaymentsList() {
  const list = document.getElementById('payments-list');
  const empty = document.getElementById('payments-empty');
  list.innerHTML = '';
  const sorted = [...state.payments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (sorted.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  sorted.forEach(p => {
    const t = getTenant(p.tenantId);
    const row = document.createElement('div');
    row.className = 'payment-row';
    row.innerHTML = `
      <div>
        <div class="pay-main">${escapeHtml(t ? t.name : 'Unknown tenant')}</div>
        <div class="pay-sub">${formatDate(p.date)} · ${escapeHtml(p.method || '')} · ${formatMonth(p.month)}</div>
      </div>
      <div class="pay-amount">${money(p.amount)}</div>
    `;
    list.appendChild(row);
  });
}

function populatePropertySelect() {
  const sel = document.getElementById('f-property');
  const current = sel.value;
  sel.innerHTML = '<option value="">No property assigned</option>' +
    state.properties.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  if (current) sel.value = current;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---------------------------------------------------------------
// Tenant detail
// ---------------------------------------------------------------
function openTenantDetail(id) {
  activeTenantId = id;
  showView('tenant-detail');
}

function renderTenantDetail() {
  const t = getTenant(activeTenantId);
  if (!t) { showView('tenants'); return; }
  const prop = getProperty(t.propertyId);
  const status = tenantStatus(t);

  document.getElementById('detail-avatar').textContent = initials(t.name);
  document.getElementById('detail-name').textContent = t.name;
  document.getElementById('detail-property').textContent =
    (prop ? prop.name : 'No property') + (t.unit ? ' · ' + t.unit : '');
  const pill = document.getElementById('detail-status');
  pill.textContent = status === 'paid' ? 'Paid' : status === 'overdue' ? 'Overdue' : 'Due';
  pill.className = 'status-pill ' + status;

  document.getElementById('detail-phone').textContent = t.phone || '—';
  document.getElementById('detail-email').textContent = t.email || '—';
  document.getElementById('detail-id').textContent = t.idProof || '—';
  document.getElementById('detail-rent').textContent = t.rent ? money(t.rent) + ' / month (due day ' + (t.dueDay || 5) + ')' : '—';
  document.getElementById('detail-deposit').textContent = t.deposit ? money(t.deposit) : '—';
  document.getElementById('detail-lease').textContent =
    (t.leaseStart || t.leaseEnd) ? `${formatDate(t.leaseStart)} → ${formatDate(t.leaseEnd)}` : '—';

  const payList = document.getElementById('detail-payments');
  payList.innerHTML = '';
  const tPayments = state.payments.filter(p => p.tenantId === t.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (tPayments.length === 0) {
    payList.innerHTML = '<p class="empty-body" style="padding:14px 0;">No payments recorded yet.</p>';
  } else {
    tPayments.forEach(p => {
      const row = document.createElement('div');
      row.className = 'payment-row';
      row.innerHTML = `
        <div>
          <div class="pay-main">${formatMonth(p.month)}</div>
          <div class="pay-sub">${formatDate(p.date)} · ${escapeHtml(p.method || '')}</div>
        </div>
        <div class="pay-amount">${money(p.amount)}</div>
      `;
      payList.appendChild(row);
    });
  }

  const noteList = document.getElementById('detail-notes');
  noteList.innerHTML = '';
  const notes = [...(t.notes || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (notes.length === 0) {
    noteList.innerHTML = '<p class="empty-body" style="padding:4px 0 14px;">No notes yet.</p>';
  } else {
    notes.forEach(n => {
      const div = document.createElement('div');
      div.className = 'note-item';
      div.innerHTML = `<span class="note-date">${formatDate(n.date)}</span>${escapeHtml(n.text)}`;
      noteList.appendChild(div);
    });
  }
}

document.getElementById('btn-delete-tenant').addEventListener('click', () => {
  const t = getTenant(activeTenantId);
  if (!t) return;
  openConfirm(`Remove ${t.name}?`, "This deletes the tenant and their payment history. This can't be undone.", () => {
    state.tenants = state.tenants.filter(x => x.id !== t.id);
    state.payments = state.payments.filter(p => p.tenantId !== t.id);
    saveState();
    activeTenantId = null;
    showView('tenants');
    toast('Tenant removed');
  });
});

document.getElementById('btn-edit-tenant').addEventListener('click', () => {
  openTenantForm(activeTenantId);
});

// ---------------------------------------------------------------
// Tenant add / edit form
// ---------------------------------------------------------------
function openTenantForm(id = null) {
  editingTenantId = id;
  const form = document.getElementById('tenant-form');
  form.reset();
  document.getElementById('form-title').textContent = id ? 'Edit tenant' : 'Add tenant';

  if (id) {
    const t = getTenant(id);
    document.getElementById('f-name').value = t.name || '';
    document.getElementById('f-phone').value = t.phone || '';
    document.getElementById('f-email').value = t.email || '';
    document.getElementById('f-idproof').value = t.idProof || '';
    populatePropertySelect();
    document.getElementById('f-property').value = t.propertyId || '';
    document.getElementById('f-unit').value = t.unit || '';
    document.getElementById('f-rent').value = t.rent || '';
    document.getElementById('f-dueday').value = t.dueDay || 5;
    document.getElementById('f-deposit').value = t.deposit || '';
    document.getElementById('f-leasestart').value = t.leaseStart || '';
    document.getElementById('f-leaseend').value = t.leaseEnd || '';
  } else {
    populatePropertySelect();
    document.getElementById('f-dueday').value = 5;
  }
  showView('tenant-form');
}

document.getElementById('btn-add-tenant').addEventListener('click', () => openTenantForm(null));

document.getElementById('btn-save-tenant').addEventListener('click', (e) => {
  e.preventDefault();
  const name = document.getElementById('f-name').value.trim();
  if (!name) {
    toast('Tenant name is required');
    document.getElementById('f-name').focus();
    return;
  }
  const data = {
    name,
    phone: document.getElementById('f-phone').value.trim(),
    email: document.getElementById('f-email').value.trim(),
    idProof: document.getElementById('f-idproof').value.trim(),
    propertyId: document.getElementById('f-property').value || null,
    unit: document.getElementById('f-unit').value.trim(),
    rent: Number(document.getElementById('f-rent').value) || 0,
    dueDay: Number(document.getElementById('f-dueday').value) || 5,
    deposit: Number(document.getElementById('f-deposit').value) || 0,
    leaseStart: document.getElementById('f-leasestart').value,
    leaseEnd: document.getElementById('f-leaseend').value,
  };

  if (editingTenantId) {
    const t = getTenant(editingTenantId);
    Object.assign(t, data);
    toast('Tenant updated');
    activeTenantId = editingTenantId;
    saveState();
    showView('tenant-detail');
  } else {
    const t = { id: uid(), notes: [], ...data };
    state.tenants.push(t);
    saveState();
    toast('Tenant added');
    activeTenantId = t.id;
    showView('tenant-detail');
  }
  editingTenantId = null;
});

// ---------------------------------------------------------------
// Search & filters (tenants list)
// ---------------------------------------------------------------
document.getElementById('tenant-search').addEventListener('input', (e) => {
  searchTerm = e.target.value;
  renderTenantsList();
});
document.querySelectorAll('#tenant-filters .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#tenant-filters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    renderTenantsList();
  });
});

// ---------------------------------------------------------------
// Modals: generic open/close
// ---------------------------------------------------------------
const backdrop = document.getElementById('modal-backdrop');
function openModal(id) {
  document.querySelectorAll('.modal').forEach(m => m.hidden = (m.id !== id));
  backdrop.hidden = false;
}
function closeModal() {
  backdrop.hidden = true;
}
backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

// --- Property modal ---
document.getElementById('btn-add-property').addEventListener('click', () => {
  document.getElementById('mp-name').value = '';
  document.getElementById('mp-address').value = '';
  openModal('modal-property');
});
document.getElementById('mp-cancel').addEventListener('click', closeModal);
document.getElementById('mp-save').addEventListener('click', () => {
  const name = document.getElementById('mp-name').value.trim();
  if (!name) { toast('Property name is required'); return; }
  state.properties.push({ id: uid(), name, address: document.getElementById('mp-address').value.trim() });
  saveState();
  closeModal();
  render();
  toast('Property added');
});

// --- Payment modal ---
document.getElementById('btn-record-payment').addEventListener('click', () => {
  const t = getTenant(activeTenantId);
  document.getElementById('mpay-amount').value = t?.rent || '';
  document.getElementById('mpay-date').value = todayISO();
  document.getElementById('mpay-month').value = currentMonth();
  document.getElementById('mpay-method').value = 'Cash';
  openModal('modal-payment');
});
document.getElementById('mpay-cancel').addEventListener('click', closeModal);
document.getElementById('mpay-save').addEventListener('click', () => {
  const amount = Number(document.getElementById('mpay-amount').value);
  if (!amount || amount <= 0) { toast('Enter a valid amount'); return; }
  state.payments.push({
    id: uid(),
    tenantId: activeTenantId,
    amount,
    date: document.getElementById('mpay-date').value || todayISO(),
    month: document.getElementById('mpay-month').value || currentMonth(),
    method: document.getElementById('mpay-method').value,
  });
  saveState();
  closeModal();
  render();
  toast('Payment recorded');
});

// --- Note modal ---
document.getElementById('btn-add-note').addEventListener('click', () => {
  document.getElementById('mnote-text').value = '';
  openModal('modal-note');
});
document.getElementById('mnote-cancel').addEventListener('click', closeModal);
document.getElementById('mnote-save').addEventListener('click', () => {
  const text = document.getElementById('mnote-text').value.trim();
  if (!text) { toast('Note is empty'); return; }
  const t = getTenant(activeTenantId);
  t.notes = t.notes || [];
  t.notes.push({ id: uid(), text, date: todayISO() });
  saveState();
  closeModal();
  render();
  toast('Note added');
});

// --- Confirm modal ---
let confirmCallback = null;
function openConfirm(title, body, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-body').textContent = body;
  confirmCallback = cb;
  openModal('modal-confirm');
}
document.getElementById('confirm-cancel').addEventListener('click', closeModal);
document.getElementById('confirm-ok').addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  confirmCallback = null;
  closeModal();
});

// ---------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------
document.getElementById('btn-export-csv').addEventListener('click', () => {
  const rows = [['Tenant', 'Property', 'Unit', 'Phone', 'Email', 'Rent', 'Payment Date', 'Payment Month', 'Amount', 'Method']];
  state.tenants.forEach(t => {
    const prop = getProperty(t.propertyId);
    const tPayments = state.payments.filter(p => p.tenantId === t.id);
    if (tPayments.length === 0) {
      rows.push([t.name, prop?.name || '', t.unit || '', t.phone || '', t.email || '', t.rent || 0, '', '', '', '']);
    } else {
      tPayments.forEach(p => {
        rows.push([t.name, prop?.name || '', t.unit || '', t.phone || '', t.email || '', t.rent || 0, p.date, p.month, p.amount, p.method]);
      });
    }
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `keyhold-export-${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('CSV exported');
});

// ---------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}
document.getElementById('btn-theme').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});
applyTheme(localStorage.getItem(THEME_KEY) || 'light');

// ---------------------------------------------------------------
// Service worker (offline support)
// ---------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* ignore in file:// contexts */ });
  });
}

// ---------------------------------------------------------------
// Initial render
// ---------------------------------------------------------------
render();
