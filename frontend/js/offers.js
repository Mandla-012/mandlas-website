// Price offers. Buyers can offer less, sellers accept / decline / counter,
// and sellers can send a special price to everyone who saved an item.
(() => {
    'use strict';
    const App = window.App;
    const { el, icon, button, api, toast, money, fmtDate, muted, showError } = App;

    const STATUS = { open: 'Open', accepted: 'Accepted', declined: 'Declined', expired: 'Expired', cancelled: 'Withdrawn', used: 'Bought' };
    const minOffer = (list) => Math.max(1, Math.ceil(list / 2));

    function numberField(labelText, value, min, max) {
        const g = el('div', 'input-group');
        const l = el('label', '', labelText);
        const f = el('div', 'input-field');
        const i = document.createElement('input');
        i.type = 'number'; i.min = String(min); i.max = String(max); i.step = '1'; i.inputMode = 'numeric'; i.value = value || '';
        f.append(el('span', 'prefix', 'R'), i);
        l.htmlFor = i.id = 'num' + Math.random().toString(36).slice(2, 7);
        g.append(l, f);
        return { group: g, input: i };
    }

    // ---------- buyer: make an offer from the product window ----------
    function makeOfferDialog(p, after) {
        const m = App.modal({ title: 'Make an offer' });
        m.body.append(el('p', 'muted', `Asking price ${money(p.price)}. Offers must be at least ${money(minOffer(p.price))} (half the price).`));
        const f = numberField('Your offer', '', minOffer(p.price), p.price - 1);
        const noteG = el('div', 'input-group');
        const note = document.createElement('input'); note.maxLength = 200; note.placeholder = 'Optional message, e.g. I can collect today';
        const nf = el('div', 'input-field'); nf.append(note);
        noteG.append(el('label', '', 'Message (optional)'), nf);
        const err = el('div', 'error-msg'); err.setAttribute('role', 'alert');
        const send = button('Send offer', 'btn btn-primary btn-wide', async () => {
            const price = Number(f.input.value);
            if (!price) return showError(err, 'Enter your offer.');
            send.disabled = true;
            const r = await api('/api/offers', { method: 'POST', body: { productId: p.id, price, note: note.value } });
            send.disabled = false;
            if (!r.ok) return showError(err, r.data.message || 'Could not send your offer.');
            toast('Offer sent. The seller has 3 days to answer.');
            m.close();
            App.refreshBadges();
            after();
        });
        m.body.append(f.group, noteG, err, send);
        setTimeout(() => f.input.focus(), 80);
    }

    // ---------- the offers block inside the product window ----------
    App.hooks.productDetail.push(async (ctx) => {
        if (ctx.isOwner || ctx.p.quantity <= 0) return;
        const slot = ctx.slots.offer;
        const show = async () => {
            slot.replaceChildren();
            let mine = null;
            if (App.getUser()) {
                const r = await api('/api/offers?productId=' + ctx.p.id);
                if (r.ok) mine = r.data.offers.find((o) => o.role === 'buyer' && (o.status === 'open' || o.status === 'accepted'));
            }
            const box = el('div', 'offer-box');
            if (!mine) {
                box.append(button('Make an offer', 'btn btn-wide', () => App.requireLogin(() => makeOfferDialog(ctx.p, show), 'Log in to make an offer.'), 'fa-solid fa-hand-holding-dollar'));
            } else if (mine.status === 'accepted') {
                box.append(el('p', 'offer-line good', `Offer accepted at ${money(mine.price)} (was ${money(mine.listPrice)}). Reserved for you until ${fmtDate(mine.expiresAt)}.`));
                box.append(button(`Buy at ${money(mine.price)}`, 'btn btn-primary btn-wide', () => { App.cart.add(ctx.p, { offer: { id: mine.id, price: mine.price } }); App.openCart(); }, 'fa-solid fa-bag-shopping'));
            } else if (mine.canRespond) {
                box.append(el('p', 'offer-line', `The seller sent you ${money(mine.price)}. Answer it in your Inbox.`));
                const go = button('Answer the offer', 'btn btn-primary btn-wide', () => App.navigate('#/inbox/offers'));
                box.append(go);
            } else {
                box.append(el('p', 'offer-line', `Your offer of ${money(mine.price)} is waiting for the seller (until ${fmtDate(mine.expiresAt)}).`));
                box.append(button('Withdraw offer', 'btn btn-wide', async () => {
                    const r = await api(`/api/offers/${mine.id}/cancel`, { method: 'POST' });
                    if (!r.ok) return toast(r.data.message || 'Could not withdraw it.', true);
                    toast('Offer withdrawn.');
                    show();
                }));
            }
            slot.append(box);
        };
        show();
    });

    // ---------- seller: send a special price to people who saved the item ----------
    async function broadcastDialog(p) {
        const m = App.modal({ title: 'Offer to people who saved this' });
        m.body.append(muted('Checking who saved this item...'));
        const a = await api('/api/offers/audience/' + p.id);
        m.body.replaceChildren();
        if (!a.ok) return m.body.append(muted(a.data.message || 'Could not check.'));
        m.body.append(el('p', '', `${a.data.saved} ${a.data.saved === 1 ? 'person has' : 'people have'} saved "${p.title}" to their favourites. ${a.data.reachable} of them accept offers.`));
        if (a.data.waitMs > 0) {
            m.body.append(el('p', 'notice warn', `You already sent a special offer for this item. You can send another in about ${Math.ceil(a.data.waitMs / 3600000)} hour(s).`));
            return;
        }
        if (!a.data.reachable) return m.body.append(muted('Nobody can receive an offer right now.'));
        m.body.append(el('p', 'muted', `Current price ${money(p.price)}. The special price must be at least ${money(minOffer(p.price))}. Each person gets 3 days to accept, and can counter.`));
        const f = numberField('Special price', Math.floor(p.price * 0.9), minOffer(p.price), p.price - 1);
        const noteG = el('div', 'input-group');
        const note = document.createElement('input'); note.maxLength = 200; note.placeholder = 'Optional message, e.g. Thanks for saving this - special price for 3 days';
        const nf = el('div', 'input-field'); nf.append(note);
        noteG.append(el('label', '', 'Message (optional)'), nf);
        const err = el('div', 'error-msg'); err.setAttribute('role', 'alert');
        const send = button(`Send to ${a.data.reachable} ${a.data.reachable === 1 ? 'person' : 'people'}`, 'btn btn-primary btn-wide', async () => {
            const price = Number(f.input.value);
            if (!price) return showError(err, 'Enter the special price.');
            send.disabled = true;
            const r = await api('/api/offers/broadcast', { method: 'POST', body: { productId: p.id, price, note: note.value } });
            send.disabled = false;
            if (!r.ok) return showError(err, r.data.message || 'Could not send the offer.');
            toast(`Offer sent to ${r.data.sent} ${r.data.sent === 1 ? 'person' : 'people'}.`);
            m.close();
        });
        m.body.append(f.group, noteG, err, send);
    }
    App.offers = { broadcastDialog };

    // ---------- Inbox -> Offers ----------
    function offerCard(o, reload) {
        const c = el('article', 'offer-card');
        const top = el('div', 'order-top');
        const title = el('a', 'offer-title', o.product.title);
        title.href = '#';
        title.addEventListener('click', (e) => { e.preventDefault(); App.openProduct(o.product.id); });
        top.append(title, el('span', 'badge-status ' + o.status, STATUS[o.status] || o.status));
        c.append(top);
        c.append(el('p', 'order-who', o.role === 'buyer' ? `Seller: ${o.sellerName}` : `Buyer: ${o.buyerName}`));
        if (o.source === 'seller_broadcast') c.append(el('p', 'tag-line', 'Special price sent to people who saved this item'));
        const price = el('div', 'offer-price');
        price.append(el('strong', '', money(o.price)), el('small', 'muted', ` (asking ${money(o.listPrice)})`));
        c.append(price);

        const hist = el('ul', 'offer-history');
        o.history.forEach((h) => hist.append(el('li', '', `${h.by === 'buyer' ? 'Buyer' : 'Seller'} ${h.price ? money(h.price) : ''}${h.note ? ' — ' + h.note : ''}`)));
        c.append(hist);

        const row = el('div', 'order-actions');
        if (o.canRespond) {
            const act = async (action, price) => {
                const r = await api(`/api/offers/${o.id}/respond`, { method: 'POST', body: { action, price } });
                if (!r.ok) { toast(r.data.message || 'Could not answer the offer.', true); return; }
                toast(action === 'accept' ? 'Offer accepted.' : action === 'decline' ? 'Offer declined.' : 'Counter-offer sent.');
                App.refreshBadges();
                reload();
            };
            row.append(button('Accept ' + money(o.price), 'btn btn-primary', () => act('accept')), button('Decline', 'btn btn-danger', () => act('decline')));
            c.append(row);
            const counter = el('div', 'counter-row');
            const f = numberField('Counter with your price', '', minOffer(o.listPrice), o.listPrice);
            const go = button('Send counter', 'btn', () => { const v = Number(f.input.value); if (!v) return toast('Enter a price.', true); act('counter', v); });
            counter.append(f.group, go);
            c.append(counter);
        } else if (o.status === 'open') {
            c.append(el('p', 'muted small', `Waiting for the ${o.turn} to answer. Expires ${fmtDate(o.expiresAt)}.`));
            if (o.role === 'buyer') { row.append(button('Withdraw', 'btn', async () => { const r = await api(`/api/offers/${o.id}/cancel`, { method: 'POST' }); if (!r.ok) toast(r.data.message, true); reload(); })); c.append(row); }
        } else if (o.status === 'accepted') {
            if (o.role === 'buyer') {
                c.append(el('p', 'offer-line good', `Accepted! The price is reserved for you until ${fmtDate(o.expiresAt)}.`));
                row.append(button(`Buy at ${money(o.price)}`, 'btn btn-primary', async () => {
                    const pr = await api('/api/products/' + o.product.id);
                    if (!pr.ok) return toast('That item is no longer available.', true);
                    App.cart.add(pr.data.product, { offer: { id: o.id, price: o.price } });
                    App.openCart();
                }, 'fa-solid fa-bag-shopping'));
                c.append(row);
            } else c.append(el('p', 'muted small', `Accepted. The buyer has until ${fmtDate(o.expiresAt)} to buy at ${money(o.price)}.`));
        }
        return c;
    }

    App.registerInboxTab({
        id: 'offers', label: 'Offers', order: 30,
        async build() {
            const { ok, data } = await api('/api/offers');
            if (!ok) return [muted(data.message || 'Could not load your offers.')];
            if (!data.offers.length) return [muted('No offers yet. Make an offer on an item you like, or save items to your favourites to receive special prices from sellers.')];
            const reload = () => App.renderInboxTab();
            const needs = data.offers.filter((o) => o.canRespond);
            const rest = data.offers.filter((o) => !o.canRespond);
            const out = [];
            if (needs.length) { out.push(el('h3', 'group-title', `Needs your answer (${needs.length})`)); needs.forEach((o) => out.push(offerCard(o, reload))); }
            if (rest.length) { out.push(el('h3', 'group-title', 'Everything else')); rest.forEach((o) => out.push(offerCard(o, reload))); }
            return out;
        }
    });
})();
