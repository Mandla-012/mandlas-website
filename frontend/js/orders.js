// Order tracking for both sides: the seller's tracker (inside My store) and the buyer's "My orders".
(() => {
    'use strict';
    const App = window.App;
    const { el, icon, button, api, toast, money, fmtDate, muted } = App;

    const SHIP_STEPS = ['Placed', 'Confirmed', 'Shipped', 'Delivered', 'Completed'];
    const COLLECT_STEPS = ['Placed', 'Confirmed', 'Ready for collection', 'Collected', 'Completed'];
    const isCollection = (o) => !!(o.delivery && o.delivery.isCollection);
    const STATUS_TEXT = { placed: 'New', confirmed: 'Confirmed', shipped: 'On its way', delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled', pending: 'Pending', paid: 'Paid' };

    function days(d) {
        if (!d) return '';
        if (d.isCollection) return 'arrange a time with the seller';
        return d.minDays === d.maxDays ? `${d.maxDays} day${d.maxDays === 1 ? '' : 's'}` : `${d.minDays}-${d.maxDays} days`;
    }

    function steps(o) {
        const names = isCollection(o) ? COLLECT_STEPS : SHIP_STEPS;
        const ol = el('ol', 'steps');
        names.forEach((n, i) => {
            const li = el('li', i + 1 < o.step ? 'done' : i + 1 === o.step ? 'now' : '');
            li.append(el('span', 'dot'), el('span', 'step-name', n));
            ol.append(li);
        });
        return ol;
    }

    function actionLabel(role, action, o) {
        const col = isCollection(o);
        if (role === 'seller') {
            if (action === 'confirm') return 'Accept order';
            if (action === 'ship') return col ? 'Ready for collection' : 'Mark as shipped';
            if (action === 'deliver') return col ? 'Mark as collected' : 'Mark as delivered';
            if (action === 'cancel') return 'Cancel & refund buyer';
        } else {
            if (action === 'receive') return 'I received it';
            if (action === 'cancel') return 'Cancel order';
        }
        return action;
    }

    async function runAction(o, role, action, onChange) {
        if (action === 'cancel' && !confirm(role === 'seller' ? 'Cancel this order? The buyer will be refunded to their wallet.' : 'Cancel this order? You will be refunded to your wallet.')) return;
        if (action === 'receive' && !confirm('Confirm you received everything? This releases the money to the seller.')) return;
        const r = await api(`/api/orders/${o.id}/action`, { method: 'POST', body: { action } });
        if (!r.ok) { toast(r.data.message || 'Could not update the order.', true); onChange(); return; }
        toast(action === 'receive' ? 'Thanks! The seller has been paid.' : 'Order updated.');
        App.refreshBadges();
        onChange();
    }

    function card(o, role, onChange) {
        const c = el('article', 'order-card2');
        const head = el('div', 'order-top');
        const left = el('div');
        left.append(el('strong', '', `#${o.shortId}`), el('small', 'muted', ' · ' + fmtDate(o.createdAt)));
        head.append(left, el('span', 'badge-status ' + o.status, STATUS_TEXT[o.status] || o.status));
        c.append(head);

        c.append(el('p', 'order-who', role === 'seller' ? `Buyer: ${o.buyerName}` : `From: ${o.store.name || 'Store'}`));
        const ul = el('ul', 'order-items');
        o.items.forEach((i) => ul.append(el('li', '', `${i.qty} × ${i.name} — ${money(i.price)}${i.offer ? ' (offer price)' : ''}`)));
        c.append(ul);

        if (o.delivery) {
            const d = el('div', 'order-delivery');
            d.append(icon('fa-solid ' + (o.delivery.isCollection ? 'fa-person-walking' : 'fa-truck')), document.createTextNode(` ${o.delivery.label} · ${days(o.delivery)}${o.deliveryFee ? ' · ' + money(o.deliveryFee) : ''}`));
            c.append(d);
        }
        if (o.address) {
            const a = o.address;
            c.append(el('address', 'order-address', `${a.fullName}, ${a.phone}\n${a.street}, ${a.city}, ${a.province} ${a.postalCode}`));
        }

        const money1 = el('div', 'order-money');
        if (role === 'seller') {
            money1.append(el('span', '', `Customer paid ${money(o.total)}`), el('strong', '', `You receive ${money(o.net != null ? o.net : o.total)}`));
            const note = o.status === 'completed' ? 'Released to your wallet.' : o.status === 'cancelled' ? 'Buyer refunded.' : 'Held safely until the buyer confirms receipt (or 7 days after delivery).';
            c.append(money1, el('p', 'muted small', note));
        } else {
            money1.append(el('span', '', `Items ${money(o.subtotal)} + delivery ${money(o.deliveryFee)}`), el('strong', '', `Total ${money(o.total)}`));
            c.append(money1);
            if (o.status === 'delivered' && o.autoCompleteAt) c.append(el('p', 'muted small', `If you do nothing, this completes automatically on ${fmtDate(o.autoCompleteAt, false)}.`));
        }

        if (o.status === 'cancelled') {
            const last = [...o.history].reverse().find((h) => h.status === 'cancelled');
            c.append(el('p', 'cancel-note', 'Cancelled' + (last && last.note ? ': ' + last.note : '') + '. The money was returned to the buyer\u2019s wallet.'));
        } else {
            c.append(steps(o));
        }

        if (o.actions && o.actions.length) {
            const row = el('div', 'order-actions');
            o.actions.forEach((a) => {
                const danger = a === 'cancel';
                row.append(button(actionLabel(role, a, o), danger ? 'btn btn-danger' : 'btn btn-primary', () => runAction(o, role, a, onChange)));
            });
            c.append(row);
        }
        return c;
    }

    // The seller's tracker: what still needs doing, and everything finished
    function sellerSection(container) {
        let scope = 'pending';
        const bar = el('div', 'subtabs small');
        const chips = el('div', 'chips');
        const list = el('div', 'orders-list');
        container.replaceChildren(bar, chips, list);

        const tab = (id, label) => {
            const b = button(label, id === scope ? 'active' : '', () => { scope = id; load(); });
            b.dataset.scope = id;
            return b;
        };
        async function load() {
            bar.replaceChildren(tab('pending', 'Pending'), tab('history', 'History'));
            list.replaceChildren(muted('Loading orders...'));
            const { ok, data } = await api('/api/store/orders?scope=' + scope);
            if (!ok) return list.replaceChildren(muted(data.message || 'Could not load your orders.'));
            const s = data.summary;
            chips.replaceChildren(
                el('span', 'chip-stat', `To do: ${s.pendingCount}`),
                el('span', 'chip-stat', `On hold: ${money(s.pendingMoney)}`),
                el('span', 'chip-stat', `Completed: ${s.completedCount}`),
                el('span', 'chip-stat good', `Earned: ${money(s.earned)}`)
            );
            list.replaceChildren();
            if (!data.orders.length) return list.append(muted(scope === 'pending' ? 'No pending orders. New orders appear here the moment someone buys.' : 'No finished orders yet.'));
            data.orders.forEach((o) => list.append(card(o, 'seller', load)));
        }
        load();
    }

    App.orderUI = { card, sellerSection };

    App.registerInboxTab({
        id: 'orders', label: 'My orders', order: 50,
        async build() {
            const { ok, data } = await api('/api/orders');
            if (!ok) return [muted(data.message || 'Could not load your orders.')];
            if (!data.orders.length) return [muted("You haven't bought anything yet. Orders you place appear here with live tracking.")];
            const list = el('div', 'orders-list');
            const reload = () => App.renderInboxTab();
            data.orders.forEach((o) => list.append(card(o, 'buyer', reload)));
            return [list];
        }
    });
})();
