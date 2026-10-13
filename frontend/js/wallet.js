// Wallet (money from your sales) and the payout desk for admins.
(() => {
    'use strict';
    const App = window.App;
    const { $, el, icon, button, api, toast, money, fmtDate, muted, showError } = App;

    const TX = {
        sale_pending: 'Sale: waiting for the buyer to confirm', sale_released: 'Sale released to your wallet', sale_cancelled: 'Sale cancelled',
        purchase: 'Paid for an order', refund: 'Refund', payout_requested: 'Withdrawal to your bank', payout_refund: 'Withdrawal returned to your wallet'
    };
    const PAYOUT = { requested: 'Waiting to be paid', paid: 'Paid', rejected: 'Rejected', cancelled: 'Cancelled' };

    function switchRow(title, desc, checked) {
        const row = el('label', 'switch-row');
        const t = el('span', 'switch-text');
        t.append(el('strong', '', title), el('small', 'muted', desc));
        const i = document.createElement('input');
        i.type = 'checkbox'; i.checked = checked; i.className = 'switch';
        row.append(t, i);
        return { row, input: i };
    }

    async function render() {
        const root = $('walletRoot');
        root.replaceChildren(muted('Loading your wallet...'));
        const { ok, data } = await api('/api/wallet');
        if (!ok) return root.replaceChildren(muted(data.message || 'Could not load your wallet.'));
        const reload = () => render();
        const w = data.wallet;
        root.replaceChildren();

        const balances = el('div', 'balance-row');
        const mk = (label, value, cls, note) => { const c = el('div', 'balance-card ' + cls); c.append(el('small', 'muted', label), el('strong', '', money(value)), el('small', 'muted', note)); return c; };
        balances.append(mk('Available', w.available, 'main', 'Yours to use or withdraw'), mk('On hold', w.pending, '', 'Released when buyers confirm'));
        root.append(balances);

        // ---- what should happen to the money ----
        const choice = el('section', 'wallet-card');
        choice.append(el('h3', '', 'What should happen to your money?'));
        choice.append(el('p', 'muted', 'By default your money stays safely in your wallet and you can spend it at checkout. Or send it to your bank account.'));

        if (!data.bank) {
            const n = el('div', 'notice');
            n.append(icon('fa-solid fa-building-columns'), document.createTextNode(' Add your bank account to withdraw. '));
            const a = el('a', 'link', 'Open Settings'); a.href = '#/settings';
            n.append(a);
            choice.append(n);
        } else {
            const locked = new Date(data.bank.payoutsUnlockAt) > new Date();
            choice.append(el('p', 'bank-line', `Bank account: ${data.bank.bankName} (${data.bank.accountType}) ending ${data.bank.last4}`));
            if (locked) choice.append(el('p', 'notice warn', `For your safety, withdrawals are locked until ${fmtDate(data.bank.payoutsUnlockAt)} because the bank account was changed recently.`));

            const form = el('form', 'withdraw-form');
            const amt = document.createElement('input');
            amt.type = 'number'; amt.min = String(data.minPayout); amt.step = '1'; amt.inputMode = 'numeric'; amt.placeholder = `Amount (min ${money(data.minPayout)})`; amt.max = String(w.available);
            amt.setAttribute('aria-label', 'Amount to withdraw');
            const wrap = el('div', 'input-field'); wrap.append(el('span', 'prefix', 'R'), amt);
            const all = button('All', 'btn small-btn', () => { amt.value = Math.floor(w.available); });
            const err = el('div', 'error-msg'); err.setAttribute('role', 'alert');
            const go = button('Withdraw to my bank', 'btn btn-primary', null, 'fa-solid fa-building-columns');
            go.type = 'submit';
            const row = el('div', 'withdraw-row'); row.append(wrap, all);
            form.append(row, err, go);
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                err.classList.remove('show');
                const v = Number(amt.value);
                if (!v || v < data.minPayout) return showError(err, `The minimum withdrawal is ${money(data.minPayout)}.`);
                if (v > w.available) return showError(err, 'You do not have that much available.');
                const r = await App.verify.secure('POST', '/api/wallet/withdraw', { amount: v }, `Confirm it is you to withdraw ${money(v)} to your bank.`);
                if (r.cancelled) return;
                if (!r.ok) return showError(err, r.data.message || 'Could not request the withdrawal.');
                toast('Withdrawal requested. It is paid to your bank by EFT.');
                reload();
            });
            choice.append(form);

            const auto = switchRow('Send released money to my bank automatically', 'When a buyer confirms an order, the sale amount is sent straight to your bank. Off = it stays in your wallet.', w.autoPayout);
            auto.input.addEventListener('change', async () => {
                const want = auto.input.checked;
                const r = await App.verify.secure('PATCH', '/api/wallet/auto-payout', { enabled: want }, 'Confirm it is you to change how your money is paid out.');
                if (r.cancelled || !r.ok) { auto.input.checked = !want; if (!r.cancelled) toast(r.data.message || 'Could not save that.', true); return; }
                toast(want ? 'Automatic payouts are on.' : 'Money will stay in your wallet.');
            });
            choice.append(auto.row);
        }
        root.append(choice);

        // ---- withdrawals ----
        if (data.payouts.length) {
            const sec = el('section', 'wallet-card');
            sec.append(el('h3', '', 'Withdrawals'));
            data.payouts.forEach((p) => {
                const row = el('div', 'tx-row');
                const l = el('div');
                l.append(el('strong', '', money(p.amount)), el('small', 'muted', ` ${PAYOUT[p.status] || p.status}${p.auto ? ' · automatic' : ''}${p.reference ? ' · ref ' + p.reference : ''}${p.reason ? ' · ' + p.reason : ''}`), el('small', 'muted block', `${p.bank ? p.bank.bankName + ' ••••' + p.bank.last4 + ' · ' : ''}${fmtDate(p.createdAt)}`));
                row.append(l);
                if (p.status === 'requested') row.append(button('Cancel', 'btn small-btn', async () => {
                    const r = await api(`/api/wallet/payouts/${p.id}/cancel`, { method: 'POST' });
                    if (!r.ok) return toast(r.data.message || 'Could not cancel.', true);
                    toast('Withdrawal cancelled. The money is back in your wallet.');
                    reload();
                }));
                sec.append(row);
            });
            root.append(sec);
        }

        // ---- history ----
        const hist = el('section', 'wallet-card');
        hist.append(el('h3', '', 'History'));
        if (!data.transactions.length) hist.append(muted('Nothing yet. Money from your sales and refunds shows up here.'));
        data.transactions.forEach((t) => {
            const row = el('div', 'tx-row');
            const l = el('div');
            l.append(el('strong', '', TX[t.kind] || t.kind), el('small', 'muted block', `${t.note ? t.note + ' · ' : ''}${fmtDate(t.createdAt)}`));
            const amount = t.available || t.pending;
            const r = el('span', 'tx-amount ' + (amount >= 0 ? 'plus' : 'minus'), (amount >= 0 ? '+' : '−') + money(Math.abs(amount)) + (t.available === 0 && t.pending ? ' (on hold)' : ''));
            row.append(l, r);
            hist.append(row);
        });
        root.append(hist);
    }
    App.views.wallet = render;

    // ---------- payout desk for admins (#/admin) ----------
    async function renderAdmin() {
        const root = $('adminRoot');
        root.replaceChildren(muted('Loading payouts...'));
        const { ok, data } = await api('/api/admin/payouts?status=requested');
        if (!ok) return root.replaceChildren(muted(data.message || 'You do not have access to this page.'));
        root.replaceChildren();
        if (!data.payouts.length) return root.append(muted('No withdrawals are waiting.'));
        data.payouts.forEach((p) => {
            const c = el('article', 'order-card2');
            c.append(el('strong', '', `${money(p.amount)} — ${p.user ? p.user.name : 'Unknown'}`), el('small', 'muted block', `${p.user ? p.user.email : ''} · requested ${fmtDate(p.createdAt)}${p.auto ? ' · automatic' : ''}`));
            c.append(el('pre', 'bank-details', `${p.bank.accountHolder}\n${p.bank.bankName} · ${p.bank.accountType}\nAccount: ${p.bank.accountNumber}\nBranch code: ${p.bank.branchCode}`));
            const row = el('div', 'order-actions');
            row.append(
                button('Mark as paid', 'btn btn-primary', async () => {
                    const ref = prompt('Payment reference (optional):', '');
                    if (ref === null) return;
                    const r = await api(`/api/admin/payouts/${p.id}/paid`, { method: 'POST', body: { reference: ref } });
                    toast(r.ok ? 'Marked as paid.' : r.data.message, !r.ok);
                    renderAdmin();
                }),
                button('Reject & refund', 'btn btn-danger', async () => {
                    const reason = prompt('Reason (shown to the seller):', '');
                    if (reason === null) return;
                    const r = await api(`/api/admin/payouts/${p.id}/reject`, { method: 'POST', body: { reason } });
                    toast(r.ok ? 'Rejected. The money went back to the wallet.' : r.data.message, !r.ok);
                    renderAdmin();
                })
            );
            c.append(row);
            root.append(c);
        });
    }
    App.views.admin = renderAdmin;
})();
