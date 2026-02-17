/* =========================================================
   QuickBill v4 — app.js
   Premium SPA: IndexedDB, 6 templates, freemium watermark,
   collapsible sections, tab transitions, export/import
   ========================================================= */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const DB_NAME = 'QuickBillDB';
const DB_VERSION = 1;
let db = null;

/* ---- State ---- */
const state = {
    docType: 'invoice',
    template: 'modern',
    status: 'draft',
    accentColor: '#6c63ff',
    currency: '$',
    senderName: '', senderEmail: '', senderPhone: '', senderWebsite: '', senderAddress: '',
    clientName: '', clientEmail: '', clientAddress: '',
    invoiceNumber: '', invoiceDate: '', dueDate: '',
    items: [{ desc: '', qty: 1, rate: 0 }],
    taxRate: 0, discountRate: 0,
    notes: '',
    logo: null, signature: null,
    paymentBankName: '', paymentAccountName: '', paymentAccountNumber: '',
    paymentRouting: '', paymentUpi: '', showPayment: true,
    nextInvoiceNum: 1, nextEstimateNum: 1,
    editingInvoiceId: null,
};

/* ---- IndexedDB Helpers ---- */
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains('invoices')) {
                const s = d.createObjectStore('invoices', { keyPath: 'id', autoIncrement: true });
                s.createIndex('status', 'status');
                s.createIndex('type', 'type');
                s.createIndex('clientName', 'clientName');
            }
            if (!d.objectStoreNames.contains('clients')) d.createObjectStore('clients', { keyPath: 'id', autoIncrement: true });
            if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
        };
        req.onsuccess = (e) => { db = e.target.result; resolve(db); };
        req.onerror = (e) => reject(e.target.error);
    });
}
function dbPut(store, val) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const s = tx.objectStore(store);
        const r = s.put(val);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}
function dbGet(store, key) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const r = tx.objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}
function dbGetAll(store) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const r = tx.objectStore(store).getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}
function dbDelete(store, key) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const r = tx.objectStore(store).delete(key);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
    });
}

/* ---- Settings ---- */
async function saveSettings() {
    const s = {
        key: 'appSettings',
        senderName: state.senderName, senderEmail: state.senderEmail,
        senderPhone: state.senderPhone, senderWebsite: state.senderWebsite,
        senderAddress: state.senderAddress,
        accentColor: state.accentColor, template: state.template,
        currency: state.currency,
        paymentBankName: state.paymentBankName, paymentAccountName: state.paymentAccountName,
        paymentAccountNumber: state.paymentAccountNumber, paymentRouting: state.paymentRouting,
        paymentUpi: state.paymentUpi, showPayment: state.showPayment,
        nextInvoiceNum: state.nextInvoiceNum, nextEstimateNum: state.nextEstimateNum,
        logo: state.logo,
    };
    await dbPut('settings', s);
}
async function loadSettings() {
    const s = await dbGet('settings', 'appSettings');
    if (s) {
        Object.keys(s).forEach(k => { if (k !== 'key' && state.hasOwnProperty(k)) state[k] = s[k]; });
    }
}
let settingsTimeout;
function debounceSaveSettings() {
    clearTimeout(settingsTimeout);
    settingsTimeout = setTimeout(() => saveSettings(), 2000);
}

/* ---- Migration ---- */
async function migrateFromLocalStorage() {
    try {
        const old = localStorage.getItem('quickbill_data');
        if (!old) return;
        const d = JSON.parse(old);
        if (d.senderName) state.senderName = d.senderName;
        if (d.senderEmail) state.senderEmail = d.senderEmail;
        if (d.senderPhone) state.senderPhone = d.senderPhone;
        if (d.senderAddress) state.senderAddress = d.senderAddress;
        if (d.accentColor) state.accentColor = d.accentColor;
        if (d.template) state.template = d.template;
        if (d.logo) state.logo = d.logo;
        await saveSettings();
        localStorage.removeItem('quickbill_data');
    } catch (e) { console.warn('Migration skipped:', e); }
}

/* ---- Toast ---- */
function toast(msg, type = 'success') {
    const existing = document.querySelectorAll('.toast');
    existing.forEach(e => e.remove());
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${type === 'success' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' : type === 'error' ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'}${msg}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

/* ---- Modal Confirm ---- */
function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = $('#deleteConfirmModal');
        const titleEl = $('#deleteModalTitle');
        const msgEl = $('#deleteModalMessage');
        const btnConfirm = $('#btnConfirmDelete');
        const btnCancel = $('#btnCancelDelete');
        const btnClose = $('#btnCloseDeleteModal');

        titleEl.textContent = title;
        msgEl.textContent = message;
        modal.style.display = 'flex';

        function close(result) {
            modal.style.display = 'none';
            cleanup();
            resolve(result);
        }

        function handleConfirm() { close(true); }
        function handleCancel() { close(false); }
        function handleOverlayClick(e) { if (e.target === modal) handleCancel(); }

        function cleanup() {
            btnConfirm.removeEventListener('click', handleConfirm);
            btnCancel.removeEventListener('click', handleCancel);
            btnClose.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleOverlayClick);
        }

        btnConfirm.addEventListener('click', handleConfirm);
        btnCancel.addEventListener('click', handleCancel);
        btnClose.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleOverlayClick);
    });
}

/* ---- Tab Switching ---- */
function switchTab(tab) {
    const tabs = ['dashboard', 'create', 'clients'];
    tabs.forEach(t => {
        const el = $(`#tab-${t}`);
        if (t === tab) {
            el.style.display = '';
            el.classList.add('tab-content', 'active');
        } else {
            el.style.display = 'none';
            el.classList.remove('active');
        }
    });
    $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    // Show/hide header PDF button
    const pdfBtn = $('#btnDownloadPdf');
    pdfBtn.style.display = tab === 'create' ? 'inline-flex' : 'none';
    // Hero visibility
    const hero = $('.hero-banner');
    if (hero) hero.style.display = tab === 'create' ? '' : 'none';

    if (tab === 'dashboard') refreshDashboard();
    if (tab === 'clients') refreshClients();
}

/* ---- Collapsible Sections ---- */
function setupCollapsible() {
    $$('.section-header[data-collapse]').forEach(btn => {
        const bodyId = btn.dataset.collapse;
        const body = $(`#${bodyId}`);
        if (!body) return;
        btn.setAttribute('aria-expanded', 'true');
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const expanded = btn.getAttribute('aria-expanded') === 'true';
            btn.setAttribute('aria-expanded', !expanded);
            if (expanded) {
                body.classList.add('collapsed');
            } else {
                body.classList.remove('collapsed');
            }
        });
    });
}

/* ---- Accent CSS Custom Properties ---- */
function applyAccentColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        const rn = r / 255, gn = g / 255, bn = b / 255;
        if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        else if (max === gn) h = ((bn - rn) / d + 2) * 60;
        else h = ((rn - gn) / d + 4) * 60;
    }
    document.documentElement.style.setProperty('--accent-h', Math.round(h));
    document.documentElement.style.setProperty('--accent-s', `${Math.round(s * 100)}%`);
    document.documentElement.style.setProperty('--accent-l', `${Math.round(l * 100)}%`);
}

/* ---- Calculations ---- */
function calcTotals() {
    let sub = 0;
    state.items.forEach(i => sub += (i.qty || 0) * (i.rate || 0));
    const disc = sub * (state.discountRate || 0) / 100;
    const afterDisc = sub - disc;
    const tax = afterDisc * (state.taxRate || 0) / 100;
    return { sub, disc, afterDisc, tax, total: afterDisc + tax };
}

/* ---- Render Line Items ---- */
function renderLineItems() {
    const c = $('#lineItems');
    if (!c) return;
    c.innerHTML = `
        <div class="line-item-header">
            <span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span><span></span>
        </div>
        ${state.items.map((item, i) => `
        <div class="line-item-row">
            <input type="text" value="${escHtml(item.desc)}" data-i="${i}" data-f="desc" placeholder="Item description">
            <input type="number" value="${item.qty}" data-i="${i}" data-f="qty" min="0" step="1">
            <input type="number" value="${item.rate}" data-i="${i}" data-f="rate" min="0" step="0.01">
            <div class="line-item-amount">${state.currency}${(item.qty * item.rate).toFixed(2)}</div>
            <button class="btn-remove-item" data-i="${i}" ${state.items.length === 1 ? 'disabled' : ''}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </div>`).join('')}`;

    c.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const idx = +e.target.dataset.i;
            const f = e.target.dataset.f;
            state.items[idx][f] = f === 'desc' ? e.target.value : +e.target.value;
            // Update the amount display in-place without re-rendering (preserves focus)
            const row = e.target.closest('.line-item-row');
            if (row) {
                const amountEl = row.querySelector('.line-item-amount');
                if (amountEl) {
                    amountEl.textContent = `${state.currency}${((state.items[idx].qty || 0) * (state.items[idx].rate || 0)).toFixed(2)}`;
                }
            }
            renderPreview();
        });
    });
    c.querySelectorAll('.btn-remove-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = +btn.dataset.i;
            state.items.splice(idx, 1);
            renderLineItems();
            renderPreview();
        });
    });
}

/* ---- Render Invoice Preview ---- */
function renderPreview() {
    const invoicePage = $('#invoicePage');
    if (!invoicePage) return;
    const t = calcTotals();
    const cur = state.currency;
    const isEstimate = state.docType === 'estimate';
    const docLabel = isEstimate ? 'Estimate' : 'Invoice';
    const statusClass = isEstimate ? 'estimate' : state.status;
    const statusLabel = isEstimate ? 'Estimate' : state.status.charAt(0).toUpperCase() + state.status.slice(1);
    const color = state.accentColor;

    const logoHTML = state.logo ? `<div class="inv-logo"><img src="${state.logo}" alt="Logo" style="max-height:50px;max-width:160px;object-fit:contain;"></div>` : '';

    let headerStyle = '', headerHTML = '';
    switch (state.template) {
        case 'modern':
            headerStyle = `background:${color};`;
            headerHTML = `<div class="inv-title"><h1>${docLabel}</h1><p>${state.senderName || 'Your Business'}</p></div>${logoHTML}`;
            break;
        case 'classic':
            headerStyle = `border-bottom-color:${color};`;
            headerHTML = `<div class="inv-title"><h1 style="color:${color}">${docLabel}</h1><p>${state.senderName || 'Your Business'}</p></div>${logoHTML}`;
            break;
        case 'minimal':
            headerHTML = `<div class="inv-title"><h1>${docLabel}</h1><p>${state.senderName || 'Your Business'}</p></div>${logoHTML}`;
            break;
        case 'bold':
            headerStyle = `background:${color};`;
            headerHTML = `<div class="inv-title"><h1>${docLabel}</h1><p>${state.senderName || 'Your Business'}</p></div>${logoHTML}`;
            break;
        case 'corporate':
            headerHTML = `<div class="inv-title"><h1>${docLabel}</h1><p>${state.senderName || 'Your Business'}</p></div>${logoHTML}`;
            break;
        case 'creative':
            headerHTML = `<div class="inv-title"><h1>${docLabel}</h1><p>${state.senderName || 'Your Business'}</p></div>${logoHTML}`;
            break;
    }

    const badgeHTML = `<div style="padding:0.75rem 1.75rem;"><span class="inv-badge ${statusClass}">${statusLabel}</span></div>`;

    const fmtAddr = (a) => (a || '').split('\n').join('<br>');
    const metaHTML = `<div class="inv-meta">
        <div class="inv-meta-col"><h3>From</h3><p><strong>${escHtml(state.senderName)}</strong><br>${state.senderEmail ? escHtml(state.senderEmail) + '<br>' : ''}${state.senderPhone ? escHtml(state.senderPhone) + '<br>' : ''}${fmtAddr(escHtml(state.senderAddress))}</p></div>
        <div class="inv-meta-col"><h3>Bill To</h3><p><strong>${escHtml(state.clientName) || 'Client Name'}</strong><br>${state.clientEmail ? escHtml(state.clientEmail) + '<br>' : ''}${fmtAddr(escHtml(state.clientAddress))}</p></div>
        <div class="inv-meta-col"><h3>Details</h3><p><strong>${docLabel} #:</strong> ${escHtml(state.invoiceNumber)}<br><strong>Date:</strong> ${formatDate(state.invoiceDate)}<br><strong>${isEstimate ? 'Valid Until' : 'Due Date'}:</strong> ${formatDate(state.dueDate)}</p></div>
    </div>`;

    const itemsHTML = state.items.map(i => `<tr><td>${escHtml(i.desc) || '—'}</td><td>${i.qty}</td><td>${cur}${(i.rate || 0).toFixed(2)}</td><td>${cur}${((i.qty || 0) * (i.rate || 0)).toFixed(2)}</td></tr>`).join('');

    let totalsHTML = `<div class="inv-totals-row"><span>Subtotal</span><span>${cur}${t.sub.toFixed(2)}</span></div>`;
    if (state.discountRate > 0) totalsHTML += `<div class="inv-totals-row"><span>Discount (${state.discountRate}%)</span><span>-${cur}${t.disc.toFixed(2)}</span></div>`;
    if (state.taxRate > 0) totalsHTML += `<div class="inv-totals-row"><span>Tax (${state.taxRate}%)</span><span>${cur}${t.tax.toFixed(2)}</span></div>`;
    totalsHTML += `<div class="inv-totals-row total"><span>Total</span><span>${cur}${t.total.toFixed(2)}</span></div>`;

    let paymentHTML = '';
    if (state.showPayment && (state.paymentBankName || state.paymentAccountNumber || state.paymentUpi)) {
        paymentHTML = `<div class="inv-payment-box"><h4>Payment Details</h4><div class="inv-payment-grid">
            ${state.paymentBankName ? `<span>Bank</span><strong>${escHtml(state.paymentBankName)}</strong>` : ''}
            ${state.paymentAccountName ? `<span>Account</span><strong>${escHtml(state.paymentAccountName)}</strong>` : ''}
            ${state.paymentAccountNumber ? `<span>Account #</span><strong>${escHtml(state.paymentAccountNumber)}</strong>` : ''}
            ${state.paymentRouting ? `<span>Routing/IFSC</span><strong>${escHtml(state.paymentRouting)}</strong>` : ''}
            ${state.paymentUpi ? `<span>UPI/PayPal</span><strong>${escHtml(state.paymentUpi)}</strong>` : ''}
        </div></div>`;
    }

    const notesHTML = state.notes ? `<div class="inv-notes"><h4>Notes</h4><p>${escHtml(state.notes).replace(/\n/g, '<br>')}</p></div>` : '';
    const sigHTML = state.signature ? `<div class="inv-signature"><img src="${state.signature}" alt="Signature"><p>Authorized Signature</p></div>` : '';
    const watermarkHTML = `<div class="inv-watermark">Generated with QuickBill — quickbill.app</div>`;

    invoicePage.className = `invoice-page template-${state.template}`;
    invoicePage.innerHTML = `
        <div class="inv-header" style="${headerStyle}">${headerHTML}</div>
        ${badgeHTML}${metaHTML}
        <table class="inv-table">
            <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
            <tbody>${itemsHTML}</tbody>
        </table>
        <div class="inv-totals">${totalsHTML}</div>
        ${paymentHTML}${notesHTML}${sigHTML}${watermarkHTML}`;
}

/* ---- Helpers ---- */
function escHtml(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function formatDate(d) { if (!d) return '—'; const p = new Date(d); return p.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }

/* ---- Populate Form from State ---- */
function populateForm() {
    if ($('#senderName')) $('#senderName').value = state.senderName;
    if ($('#senderEmail')) $('#senderEmail').value = state.senderEmail;
    if ($('#senderPhone')) $('#senderPhone').value = state.senderPhone;
    if ($('#senderWebsite')) $('#senderWebsite').value = state.senderWebsite;
    if ($('#senderAddress')) $('#senderAddress').value = state.senderAddress;
    if ($('#clientName')) $('#clientName').value = state.clientName;
    if ($('#clientEmail')) $('#clientEmail').value = state.clientEmail;
    if ($('#clientAddress')) $('#clientAddress').value = state.clientAddress;
    if ($('#invoiceNumber')) $('#invoiceNumber').value = state.invoiceNumber;
    if ($('#invoiceDate')) $('#invoiceDate').value = state.invoiceDate;
    if ($('#dueDate')) $('#dueDate').value = state.dueDate;
    if ($('#invoiceCurrency')) $('#invoiceCurrency').value = state.currency;
    if ($('#accentColor')) { $('#accentColor').value = state.accentColor; $('#colorLabel').textContent = state.accentColor; }
    if ($('#taxRate')) $('#taxRate').value = state.taxRate;
    if ($('#discountRate')) $('#discountRate').value = state.discountRate;
    if ($('#invoiceNotes')) $('#invoiceNotes').value = state.notes;
    if ($('#showPaymentDetails')) $('#showPaymentDetails').checked = state.showPayment;
    if ($('#paymentBankName')) $('#paymentBankName').value = state.paymentBankName;
    if ($('#paymentAccountName')) $('#paymentAccountName').value = state.paymentAccountName;
    if ($('#paymentAccountNumber')) $('#paymentAccountNumber').value = state.paymentAccountNumber;
    if ($('#paymentRouting')) $('#paymentRouting').value = state.paymentRouting;
    if ($('#paymentUpi')) $('#paymentUpi').value = state.paymentUpi;
    // Template
    $$('.template-option').forEach(t => t.classList.toggle('active', t.dataset.template === state.template));
    // Status
    $$('.status-btn').forEach(b => b.classList.toggle('active', b.dataset.status === state.status));
    // Doc type
    $$('.doc-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === state.docType));
    updateDocTypeLabels();
    // Logo
    if (state.logo) {
        if ($('#logoPreviewContainer')) { $('#logoPreviewContainer').style.display = ''; $('#logoPreviewImg').src = state.logo; }
        if ($('#btnRemoveLogo')) $('#btnRemoveLogo').style.display = '';
    }
    // Accent
    applyAccentColor(state.accentColor);
    renderLineItems();
    renderPreview();
}

function updateDocTypeLabels() {
    const isEst = state.docType === 'estimate';
    if ($('#detailsTitle')) $('#detailsTitle').textContent = isEst ? 'Estimate Details' : 'Invoice Details';
    if ($('#numberLabel')) $('#numberLabel').textContent = isEst ? 'Estimate #' : 'Invoice #';
    if ($('#dueDateLabel')) $('#dueDateLabel').textContent = isEst ? 'Valid Until' : 'Due Date';
}

/* ---- Save Document ---- */
async function saveCurrentDoc() {
    const t = calcTotals();
    const doc = {
        type: state.docType, template: state.template, status: state.status,
        accentColor: state.accentColor, currency: state.currency,
        senderName: state.senderName, senderEmail: state.senderEmail,
        senderPhone: state.senderPhone, senderWebsite: state.senderWebsite, senderAddress: state.senderAddress,
        clientName: state.clientName, clientEmail: state.clientEmail, clientAddress: state.clientAddress,
        invoiceNumber: state.invoiceNumber, invoiceDate: state.invoiceDate, dueDate: state.dueDate,
        items: [...state.items], taxRate: state.taxRate, discountRate: state.discountRate,
        notes: state.notes, logo: state.logo, signature: state.signature,
        paymentBankName: state.paymentBankName, paymentAccountName: state.paymentAccountName,
        paymentAccountNumber: state.paymentAccountNumber, paymentRouting: state.paymentRouting,
        paymentUpi: state.paymentUpi, showPayment: state.showPayment,
        total: t.total, savedAt: new Date().toISOString(),
    };
    if (state.editingInvoiceId) doc.id = state.editingInvoiceId;
    const id = await dbPut('invoices', doc);
    state.editingInvoiceId = id;
    if ($('#saveClientCheck') && $('#saveClientCheck').checked && state.clientName) {
        await saveClient({ name: state.clientName, email: state.clientEmail, address: state.clientAddress });
    }
    if (state.docType === 'estimate') state.nextEstimateNum++;
    else state.nextInvoiceNum++;
    await saveSettings();
    toast(`${state.docType === 'estimate' ? 'Estimate' : 'Invoice'} saved!`);
    return id;
}

/* ---- Dashboard ---- */
async function refreshDashboard() {
    const allDocs = await dbGetAll('invoices');
    allDocs.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
    const invoices = allDocs.filter(d => d.type !== 'estimate');
    const paid = invoices.filter(d => d.status === 'paid');
    const pending = invoices.filter(d => d.status !== 'paid');
    const revenue = paid.reduce((s, d) => s + (d.total || 0), 0);
    $('#statTotal').textContent = allDocs.length;
    $('#statPaid').textContent = paid.length;
    $('#statPending').textContent = pending.length;
    $('#statRevenue').textContent = `$${revenue.toFixed(2)}`;

    const filter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
    const search = ($('#dashSearch')?.value || '').toLowerCase();
    let filtered = allDocs;
    if (filter === 'invoice') filtered = filtered.filter(d => d.type !== 'estimate');
    else if (filter === 'estimate') filtered = filtered.filter(d => d.type === 'estimate');
    else if (filter === 'paid') filtered = filtered.filter(d => d.status === 'paid');
    else if (filter === 'draft') filtered = filtered.filter(d => d.status === 'draft');
    else if (filter === 'sent') filtered = filtered.filter(d => d.status === 'sent');
    if (search) filtered = filtered.filter(d =>
        (d.invoiceNumber || '').toLowerCase().includes(search) ||
        (d.clientName || '').toLowerCase().includes(search) ||
        (d.clientEmail || '').toLowerCase().includes(search)
    );

    const listEl = $('#invoiceList');
    const emptyEl = $('#emptyState');

    if (filtered.length === 0) {
        if (emptyEl) emptyEl.style.display = '';
        listEl.innerHTML = '';
        listEl.appendChild(emptyEl || createEmptyState());
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    listEl.innerHTML = filtered.map(d => {
        const isEst = d.type === 'estimate';
        const sc = isEst ? 'estimate' : (d.status || 'draft');
        const sl = isEst ? 'Estimate' : (d.status || 'draft').charAt(0).toUpperCase() + (d.status || 'draft').slice(1);
        const dateStr = d.savedAt ? new Date(d.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
        return `<div class="invoice-list-item" data-id="${d.id}">
            <div><div class="inv-number">${escHtml(d.invoiceNumber || '—')}</div><div class="inv-type">${isEst ? 'EST' : 'INV'}</div></div>
            <div class="inv-client">${escHtml(d.clientName || '—')}<small>${escHtml(d.clientEmail || '')}</small></div>
            <div class="inv-amount">${d.currency || '$'}${(d.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div class="inv-date">${dateStr}</div>
            <div><span class="inv-status ${sc}">${sl}</span></div>
            <div class="inv-actions">
                <button class="btn btn-ghost btn-sm btn-edit" data-id="${d.id}" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button class="btn btn-ghost btn-sm btn-dup" data-id="${d.id}" title="Duplicate"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                ${isEst ? `<button class="btn btn-ghost btn-sm btn-convert" data-id="${d.id}" title="Convert to Invoice"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></button>` : ''}
                <button class="btn btn-danger btn-sm btn-del" data-id="${d.id}" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
        </div>`;
    }).join('');

    // Event binding
    listEl.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); editDoc(+b.dataset.id); }));
    listEl.querySelectorAll('.btn-dup').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); duplicateDoc(+b.dataset.id); }));
    listEl.querySelectorAll('.btn-del').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); deleteDoc(+b.dataset.id); }));
    listEl.querySelectorAll('.btn-convert').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); convertToInvoice(+b.dataset.id); }));
}

async function editDoc(id) {
    const d = await dbGet('invoices', id);
    if (!d) return;
    Object.keys(d).forEach(k => { if (state.hasOwnProperty(k)) state[k] = d[k]; });
    state.editingInvoiceId = id;
    state.taxRate = d.taxRate || 0;
    state.discountRate = d.discountRate || 0;
    state.items = d.items && d.items.length ? d.items : [{ desc: '', qty: 1, rate: 0 }];
    populateForm();
    switchTab('create');
}

async function duplicateDoc(id) {
    const d = await dbGet('invoices', id);
    if (!d) return;
    Object.keys(d).forEach(k => { if (state.hasOwnProperty(k)) state[k] = d[k]; });
    state.editingInvoiceId = null;
    state.invoiceDate = new Date().toISOString().slice(0, 10);
    const due = new Date(); due.setDate(due.getDate() + 30);
    state.dueDate = due.toISOString().slice(0, 10);
    if (state.docType === 'estimate') {
        state.invoiceNumber = `EST-${String(state.nextEstimateNum).padStart(3, '0')}`;
    } else {
        state.invoiceNumber = `INV-${String(state.nextInvoiceNum).padStart(3, '0')}`;
    }
    state.status = 'draft';
    state.items = d.items ? JSON.parse(JSON.stringify(d.items)) : [{ desc: '', qty: 1, rate: 0 }];
    populateForm();
    switchTab('create');
    toast('Invoice duplicated! Edit and save as new.', 'info');
}

async function deleteDoc(id) {
    if (!await showConfirm('Delete Document', 'Are you sure you want to delete this document? This action cannot be undone.')) return;
    await dbDelete('invoices', id);
    toast('Deleted');
    refreshDashboard();
}

async function convertToInvoice(id) {
    const d = await dbGet('invoices', id);
    if (!d) return;
    Object.keys(d).forEach(k => { if (state.hasOwnProperty(k)) state[k] = d[k]; });
    state.editingInvoiceId = null;
    state.docType = 'invoice';
    state.invoiceNumber = `INV-${String(state.nextInvoiceNum).padStart(3, '0')}`;
    state.status = 'draft';
    state.items = d.items ? JSON.parse(JSON.stringify(d.items)) : [{ desc: '', qty: 1, rate: 0 }];
    populateForm();
    switchTab('create');
    toast('Converted to invoice! Review and save.', 'info');
}

/* ---- Clients ---- */
async function saveClient(data) {
    const all = await dbGetAll('clients');
    const existing = all.find(c => c.name.toLowerCase() === data.name.toLowerCase());
    if (existing) {
        Object.assign(existing, data);
        await dbPut('clients', existing);
    } else {
        await dbPut('clients', data);
    }
}

async function refreshClients() {
    const all = await dbGetAll('clients');
    const listEl = $('#clientList');
    const emptyEl = $('#emptyClients');
    if (all.length === 0) {
        if (emptyEl) emptyEl.style.display = '';
        listEl.innerHTML = '';
        listEl.appendChild(emptyEl);
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    listEl.innerHTML = all.map(c => {
        const initials = (c.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        return `<div class="client-card" data-id="${c.id}">
            <div class="client-avatar">${initials}</div>
            <div class="client-info"><h4>${escHtml(c.name)}</h4><p>${escHtml(c.email || c.phone || c.address || '')}</p></div>
            <div class="client-actions">
                <button class="btn btn-ghost btn-sm btn-edit-client" data-id="${c.id}" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button class="btn btn-danger btn-sm btn-del-client" data-id="${c.id}" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
        </div>`;
    }).join('');

    listEl.querySelectorAll('.btn-edit-client').forEach(b => b.addEventListener('click', () => openClientModal(+b.dataset.id)));
    listEl.querySelectorAll('.btn-del-client').forEach(b => b.addEventListener('click', async () => {
        if (!await showConfirm('Delete Client', 'Are you sure you want to delete this client?')) return;
        await dbDelete('clients', +b.dataset.id);
        toast('Client deleted');
        refreshClients();
    }));
}

let editingClientId = null;
function openClientModal(id) {
    editingClientId = id || null;
    $('#clientModalTitle').textContent = id ? 'Edit Client' : 'Add Client';
    if (id) {
        dbGet('clients', id).then(c => {
            if (!c) return;
            $('#modalClientName').value = c.name || '';
            $('#modalClientEmail').value = c.email || '';
            $('#modalClientPhone').value = c.phone || '';
            $('#modalClientAddress').value = c.address || '';
        });
    } else {
        $('#modalClientName').value = '';
        $('#modalClientEmail').value = '';
        $('#modalClientPhone').value = '';
        $('#modalClientAddress').value = '';
    }
    $('#clientModal').style.display = '';
}

function closeClientModal() { $('#clientModal').style.display = 'none'; editingClientId = null; }

async function openClientPicker() {
    const all = await dbGetAll('clients');
    const pickerList = $('#pickerList');
    if (all.length === 0) {
        pickerList.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);padding:2rem;">No saved clients yet</p>';
    } else {
        pickerList.innerHTML = all.map(c => {
            const initials = (c.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
            return `<div class="picker-item" data-id="${c.id}">
                <div class="client-avatar">${initials}</div>
                <div><h4>${escHtml(c.name)}</h4><p>${escHtml(c.email || '')}</p></div>
            </div>`;
        }).join('');
        pickerList.querySelectorAll('.picker-item').forEach(item => {
            item.addEventListener('click', async () => {
                const c = await dbGet('clients', +item.dataset.id);
                if (c) {
                    state.clientName = c.name || '';
                    state.clientEmail = c.email || '';
                    state.clientAddress = c.address || '';
                    populateForm();
                }
                $('#clientPickerModal').style.display = 'none';
            });
        });
    }
    $('#clientPickerModal').style.display = '';
}

/* ---- Signature Drawing ---- */
function setupSignature() {
    const canvas = $('#signatureCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false;
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        return {
            x: (touch.clientX - rect.left) * (canvas.width / rect.width),
            y: (touch.clientY - rect.top) * (canvas.height / rect.height)
        };
    };
    const start = (e) => { e.preventDefault(); drawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); };
    const draw = (e) => { if (!drawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke(); };
    const end = () => { drawing = false; state.signature = canvas.toDataURL(); renderPreview(); };
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', end);
}

/* ---- PDF Download ---- */
async function downloadPDF() {
    const page = $('#invoicePage');
    const btn = event?.target?.closest('.btn') || $('#btnDownloadPdfCreate');
    if (btn) { btn.disabled = true; btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10" stroke-dasharray="30" stroke-dashoffset="10"/></svg> Generating...'; }
    try {
        const JsPDFConstructor = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : (window.jsPDF ? window.jsPDF : null);
        if (!JsPDFConstructor) throw new Error('jsPDF library failed to load.');
        if (typeof window.html2canvas === 'undefined') throw new Error('html2canvas library failed to load.');
        const canvas = await window.html2canvas(page, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdf = new JsPDFConstructor('p', 'mm', 'a4');
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const ratio = canvas.width / canvas.height;
        const imgW = pw;
        const imgH = pw / ratio;
        let y = 0;
        while (y < imgH) {
            if (y > 0) pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, -y, imgW, imgH);
            y += ph;
        }
        const num = state.invoiceNumber || 'document';
        pdf.save(`${num}.pdf`);
        toast('PDF downloaded!');
    } catch (err) {
        console.error('PDF Error:', err);
        toast('PDF generation failed: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download PDF';
        }
    }
}

/* ---- Export / Import ---- */
async function exportAllData() {
    try {
        const invoices = await dbGetAll('invoices');
        const clients = await dbGetAll('clients');
        const settings = await dbGet('settings', 'appSettings');
        const data = { version: 4, exportedAt: new Date().toISOString(), invoices, clients, settings };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `quickbill-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast('Backup exported!');
    } catch (e) {
        toast('Export failed: ' + e.message, 'error');
    }
}

async function importData(file) {
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.invoices && !data.clients) throw new Error('Invalid backup file');
        let count = 0;
        if (data.invoices) {
            for (const inv of data.invoices) {
                delete inv.id; // Let autoIncrement assign new IDs
                await dbPut('invoices', inv);
                count++;
            }
        }
        if (data.clients) {
            for (const cl of data.clients) {
                delete cl.id;
                await dbPut('clients', cl);
            }
        }
        if (data.settings) {
            await dbPut('settings', { ...data.settings, key: 'appSettings' });
            await loadSettings();
        }
        toast(`Imported ${count} documents!`);
        refreshDashboard();
    } catch (e) {
        toast('Import failed: ' + e.message, 'error');
    }
}

/* ---- Clear Form ---- */
function clearForm() {
    state.clientName = ''; state.clientEmail = ''; state.clientAddress = '';
    state.items = [{ desc: '', qty: 1, rate: 0 }];
    state.taxRate = 0; state.discountRate = 0; state.notes = '';
    state.signature = null; state.editingInvoiceId = null;
    state.status = 'draft';
    // Reset invoice number
    if (state.docType === 'estimate') {
        state.invoiceNumber = `EST-${String(state.nextEstimateNum).padStart(3, '0')}`;
    } else {
        state.invoiceNumber = `INV-${String(state.nextInvoiceNum).padStart(3, '0')}`;
    }
    // Clear signature canvas
    const canvas = $('#signatureCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    populateForm();
    toast('Form cleared', 'info');
}

/* ---- Init ---- */
async function init() {
    await openDB();
    await migrateFromLocalStorage();

    // Check if this is a first visit (no saved settings)
    const existingSettings = await dbGet('settings', 'appSettings');
    const isFirstVisit = !existingSettings;

    await loadSettings();

    state.invoiceDate = new Date().toISOString().slice(0, 10);
    const due = new Date(); due.setDate(due.getDate() + 30);
    state.dueDate = due.toISOString().slice(0, 10);
    state.invoiceNumber = `INV-${String(state.nextInvoiceNum).padStart(3, '0')}`;

    // Populate sample data on first visit for a polished first impression
    if (isFirstVisit) {
        state.senderName = 'Luminos Design Studio';
        state.senderEmail = 'hello@luminosstudio.com';
        state.senderPhone = '+1 (415) 555-0142';
        state.senderWebsite = 'luminosstudio.com';
        state.senderAddress = '742 Crescent Ave, Suite 300\nSan Francisco, CA 94102';
        state.clientName = 'Meridian Technologies';
        state.clientEmail = 'accounts@meridiantech.io';
        state.clientAddress = '1200 Innovation Drive\nAustin, TX 73301';
        state.items = [
            { desc: 'Brand Identity & Logo Design', qty: 1, rate: 2500 },
            { desc: 'Website Design & Development', qty: 1, rate: 4800 },
            { desc: 'Social Media Kit (5 platforms)', qty: 1, rate: 1200 },
        ];
        state.taxRate = 8.5;
        state.notes = 'Thank you for your business! Payment is due within 30 days. A 2% late fee applies after the due date.';
        state.paymentBankName = 'First National Bank';
        state.paymentAccountName = 'Luminos Design Studio LLC';
        state.paymentAccountNumber = '8294-0057-3321';
        state.paymentRouting = '021000089';
        state.paymentUpi = 'pay@luminosstudio.com';
    }

    populateForm();
    setupCollapsible();
    setupSignature();
    bindEvents();
}

function bindEvents() {
    // Tabs
    $$('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    // Doc type
    $$('.doc-type-btn').forEach(b => b.addEventListener('click', () => {
        state.docType = b.dataset.type;
        $$('.doc-type-btn').forEach(x => x.classList.toggle('active', x.dataset.type === state.docType));
        if (state.docType === 'estimate') {
            state.invoiceNumber = `EST-${String(state.nextEstimateNum).padStart(3, '0')}`;
        } else {
            state.invoiceNumber = `INV-${String(state.nextInvoiceNum).padStart(3, '0')}`;
        }
        updateDocTypeLabels();
        if ($('#invoiceNumber')) $('#invoiceNumber').value = state.invoiceNumber;
        renderPreview();
    }));

    // Template
    $$('.template-option').forEach(t => t.addEventListener('click', () => {
        state.template = t.dataset.template;
        $$('.template-option').forEach(x => x.classList.toggle('active', x.dataset.template === state.template));
        renderPreview(); debounceSaveSettings();
    }));

    // Status
    $$('.status-btn').forEach(b => b.addEventListener('click', () => {
        state.status = b.dataset.status;
        $$('.status-btn').forEach(x => x.classList.toggle('active', x.dataset.status === state.status));
        renderPreview();
    }));

    // Accent color
    if ($('#accentColor')) {
        $('#accentColor').addEventListener('input', (e) => {
            state.accentColor = e.target.value;
            $('#colorLabel').textContent = e.target.value;
            applyAccentColor(e.target.value);
            renderPreview(); debounceSaveSettings();
        });
    }

    // Logo
    if ($('#btnLogoUpload')) $('#btnLogoUpload').addEventListener('click', () => $('#logoUpload').click());
    if ($('#logoUpload')) {
        $('#logoUpload').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                state.logo = ev.target.result;
                if ($('#logoPreviewContainer')) { $('#logoPreviewContainer').style.display = ''; $('#logoPreviewImg').src = state.logo; }
                if ($('#btnRemoveLogo')) $('#btnRemoveLogo').style.display = '';
                renderPreview(); debounceSaveSettings();
            };
            reader.readAsDataURL(file);
        });
    }
    if ($('#btnRemoveLogo')) {
        $('#btnRemoveLogo').addEventListener('click', () => {
            state.logo = null;
            if ($('#logoPreviewContainer')) $('#logoPreviewContainer').style.display = 'none';
            if ($('#btnRemoveLogo')) $('#btnRemoveLogo').style.display = 'none';
            renderPreview(); debounceSaveSettings();
        });
    }

    // Form inputs → state
    const inputMap = {
        senderName: 'senderName', senderEmail: 'senderEmail', senderPhone: 'senderPhone',
        senderWebsite: 'senderWebsite', senderAddress: 'senderAddress',
        clientName: 'clientName', clientEmail: 'clientEmail', clientAddress: 'clientAddress',
        invoiceNumber: 'invoiceNumber', invoiceDate: 'invoiceDate', dueDate: 'dueDate',
        invoiceNotes: 'notes',
        paymentBankName: 'paymentBankName', paymentAccountName: 'paymentAccountName',
        paymentAccountNumber: 'paymentAccountNumber', paymentRouting: 'paymentRouting', paymentUpi: 'paymentUpi',
    };
    Object.entries(inputMap).forEach(([id, key]) => {
        const el = $(`#${id}`);
        if (el) {
            el.addEventListener('input', () => {
                state[key] = el.value;
                renderPreview();
                if (['senderName', 'senderEmail', 'senderPhone', 'senderWebsite', 'senderAddress', 'paymentBankName', 'paymentAccountName', 'paymentAccountNumber', 'paymentRouting', 'paymentUpi'].includes(key)) {
                    debounceSaveSettings();
                }
            });
        }
    });

    // Currency
    if ($('#invoiceCurrency')) {
        $('#invoiceCurrency').addEventListener('change', (e) => {
            state.currency = e.target.value;
            renderPreview(); debounceSaveSettings();
        });
    }

    // Tax & Discount
    if ($('#taxRate')) $('#taxRate').addEventListener('input', (e) => { state.taxRate = +e.target.value; renderPreview(); });
    if ($('#discountRate')) $('#discountRate').addEventListener('input', (e) => { state.discountRate = +e.target.value; renderPreview(); });

    // Payment toggle
    if ($('#showPaymentDetails')) {
        $('#showPaymentDetails').addEventListener('change', (e) => {
            state.showPayment = e.target.checked;
            const fields = $('#paymentDetailsFields');
            if (fields) fields.style.display = e.target.checked ? '' : 'none';
            renderPreview(); debounceSaveSettings();
        });
    }

    // Add line item
    if ($('#btnAddItem')) $('#btnAddItem').addEventListener('click', () => {
        state.items.push({ desc: '', qty: 1, rate: 0 });
        renderLineItems(); renderPreview();
    });

    // Actions
    if ($('#btnSaveInvoice')) $('#btnSaveInvoice').addEventListener('click', saveCurrentDoc);
    if ($('#btnDownloadPdfCreate')) $('#btnDownloadPdfCreate').addEventListener('click', downloadPDF);
    if ($('#btnDownloadPdf')) $('#btnDownloadPdf').addEventListener('click', downloadPDF);
    if ($('#btnClearAll')) $('#btnClearAll').addEventListener('click', clearForm);
    if ($('#btnPrint')) $('#btnPrint').addEventListener('click', () => window.print());

    // Signature
    if ($('#btnClearSignature')) {
        $('#btnClearSignature').addEventListener('click', () => {
            const c = $('#signatureCanvas');
            if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
            state.signature = null; renderPreview();
        });
    }
    if ($('#signatureUpload')) {
        $('#signatureUpload').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => { state.signature = ev.target.result; renderPreview(); };
            reader.readAsDataURL(file);
        });
    }

    // Dashboard buttons
    if ($('#btnNewFromDash')) $('#btnNewFromDash').addEventListener('click', () => { clearFormSilent(); state.docType = 'invoice'; updateDocTypeLabels(); populateForm(); switchTab('create'); });
    if ($('#btnNewEstimate')) $('#btnNewEstimate').addEventListener('click', () => {
        clearFormSilent();
        state.docType = 'estimate';
        state.invoiceNumber = `EST-${String(state.nextEstimateNum).padStart(3, '0')}`;
        updateDocTypeLabels(); populateForm(); switchTab('create');
    });
    if ($('#btnEmptyCreate')) $('#btnEmptyCreate').addEventListener('click', () => { switchTab('create'); });

    // Filter tabs
    $$('.filter-btn').forEach(b => b.addEventListener('click', () => {
        $$('.filter-btn').forEach(x => x.classList.toggle('active', x === b));
        refreshDashboard();
    }));
    if ($('#dashSearch')) $('#dashSearch').addEventListener('input', () => refreshDashboard());

    // Client buttons
    if ($('#btnAddClient')) $('#btnAddClient').addEventListener('click', () => openClientModal());
    if ($('#btnEmptyAddClient')) $('#btnEmptyAddClient').addEventListener('click', () => openClientModal());
    if ($('#btnCloseClientModal')) $('#btnCloseClientModal').addEventListener('click', closeClientModal);
    if ($('#btnCancelClient')) $('#btnCancelClient').addEventListener('click', closeClientModal);
    if ($('#btnSaveClient')) {
        $('#btnSaveClient').addEventListener('click', async () => {
            const name = $('#modalClientName').value.trim();
            if (!name) { toast('Client name is required', 'error'); return; }
            const data = {
                name, email: $('#modalClientEmail').value.trim(),
                phone: $('#modalClientPhone').value.trim(), address: $('#modalClientAddress').value.trim()
            };
            if (editingClientId) data.id = editingClientId;
            await dbPut('clients', data);
            closeClientModal();
            toast(editingClientId ? 'Client updated!' : 'Client added!');
            refreshClients();
        });
    }

    // Client picker
    if ($('#btnPickClient')) $('#btnPickClient').addEventListener('click', openClientPicker);
    if ($('#btnClosePickerModal')) $('#btnClosePickerModal').addEventListener('click', () => { $('#clientPickerModal').style.display = 'none'; });

    // Export / Import
    if ($('#btnExportData')) $('#btnExportData').addEventListener('click', exportAllData);
    if ($('#btnImportData')) $('#btnImportData').addEventListener('click', () => $('#importFileInput').click());
    if ($('#importFileInput')) $('#importFileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) importData(file);
        e.target.value = '';
    });

    // Close modals on overlay click
    ['clientModal', 'clientPickerModal'].forEach(id => {
        const modal = $(`#${id}`);
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });
        }
    });
}

function clearFormSilent() {
    state.clientName = ''; state.clientEmail = ''; state.clientAddress = '';
    state.items = [{ desc: '', qty: 1, rate: 0 }];
    state.taxRate = 0; state.discountRate = 0; state.notes = '';
    state.signature = null; state.editingInvoiceId = null; state.status = 'draft';
    state.invoiceDate = new Date().toISOString().slice(0, 10);
    const due = new Date(); due.setDate(due.getDate() + 30);
    state.dueDate = due.toISOString().slice(0, 10);
    state.invoiceNumber = `INV-${String(state.nextInvoiceNum).padStart(3, '0')}`;
}

init().catch(err => console.error('Init failed:', err));
