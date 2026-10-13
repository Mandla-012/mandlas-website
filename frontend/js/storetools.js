// "My store" inside the Inbox: listings, order tracking, delivery options and a wallet summary.
(() => {
    'use strict';
    const App = window.App;
    const { el, icon, button, api, toast, money, muted, showError, clearErrors, avatarEl } = App;

    let section = 'listings';
    const TYPES = {
        collection: { label: 'Collection (free)', icon: 'fa-person-walking' },
        courier: { label: 'Courier to the door', icon: 'fa-truck' },
        local: { label: 'Local delivery (own driver)', icon: 'fa-motorcycle' },
        locker: { label: 'Pickup point / locker', icon: 'fa-box' }
    };
    App.deliveryTypes = TYPES;

    function listingsSection(container, store) {
        container.replaceChildren(muted('Loading your listings...'));
        api('/api/products?store=' + encodeURIComponent(store.id) + '&limit=48').then(({ ok, data }) => {
            const grid = el('div', 'grid');
            App.bindProductGrid(grid);
            if (!ok) grid.append(muted('Could not load your listings.'));
            else if (!data.products.length) grid.append(muted('No listings yet. Tap "Add a listing" to post your first item.'));
            else data.products.forEach((p) => {
                const card = App.productCard(p, { manage: true });
                if (p.quantity > 0) {
                    const offer = button('Offer to savers', 'btn small-btn', () => App.offers && App.offers.broadcastDialog(p), 'fa-solid fa-tags');
                    offer.dataset.skip = '1';
                    offer.title = 'Send a special price to everyone who saved this item';
                    card.append(offer);
                }
                grid.append(card);
            });
            container.replaceChildren(grid);
        });
    }

    async function deliverySection(container) {
        const { ok, data } = await api('/api/store/delivery');
        const wrap = el('div', 'delivery-manager');
        container.replaceChildren(wrap);
        wrap.append(el('p', 'muted', 'Buyers see these options on your products and choose one at checkout. With none set, buyers can only collect from you.'));

        const list = el('div', 'delivery-list');
        const render = (options) => {
            list.replaceChildren();
            if (!options.length) list.append(muted('No delivery options yet.'));
            options.forEach((o) => {
                const row = el('div', 'delivery-row');
                row.append(icon('fa-solid ' + (TYPES[o.type] ? TYPES[o.type].icon : 'fa-truck')));
                const t = el('div', 'delivery-info');
                t.append(el('strong', '', o.label), el('small', 'muted', `${o.price ? money(o.price) : 'Free'} · ${o.type === 'collection' ? 'arrange a time' : o.minDays === o.maxDays ? o.maxDays + ' days' : o.minDays + '-' + o.maxDays + ' days'}${o.areas ? ' · ' + o.areas : ''}`));
                const del = button('', 'icon-btn', async () => {
                    if (!confirm('Remove this delivery option?')) return;
                    const r = await api('/api/store/delivery/' + o.id, { method: 'DELETE' });
                    if (!r.ok) return toast(r.data.message || 'Could not remove it.', true);
                    render(r.data.options);
                });
                del.setAttribute('aria-label', 'Remove ' + o.label);
                del.append(icon('fa-solid fa-trash'));
                row.append(t, del);
                list.append(row);
            });
        };
        render(ok ? data.options : []);
        wrap.append(list);

        // add form
        const form = el('form', 'container-form delivery-form');
        form.noValidate = true;
        form.append(el('h3', 'form-title', 'Add a delivery option'));
        const field = (label, input) => { const g = el('div', 'input-group'); const l = el('label', '', label); const f = el('div', 'input-field'); f.append(input); g.append(l, f); return g; };
        const type = document.createElement('select');
        Object.entries(TYPES).forEach(([k, v]) => { const o = el('option', '', v.label); o.value = k; type.append(o); });
        const label = document.createElement('input'); label.maxLength = 40; label.placeholder = 'e.g. Courier Guy - 2 to 4 days';
        const price = document.createElement('input'); price.type = 'number'; price.min = '0'; price.max = '2000'; price.step = '1'; price.value = '80'; price.inputMode = 'numeric';
        const minD = document.createElement('input'); minD.type = 'number'; minD.min = '0'; minD.max = '30'; minD.value = '2'; minD.inputMode = 'numeric';
        const maxD = document.createElement('input'); maxD.type = 'number'; maxD.min = '0'; maxD.max = '30'; maxD.value = '4'; maxD.inputMode = 'numeric';
        const areas = document.createElement('input'); areas.maxLength = 120; areas.placeholder = 'Where you deliver, e.g. Free State & Gauteng';
        const row1 = el('div', 'field-row'); row1.append(field('Price (R)', price), field('Delivery time (days)', (() => { const w = el('div', 'range'); w.append(minD, document.createTextNode(' to '), maxD); return w; })()));
        const err = el('div', 'error-msg'); err.setAttribute('role', 'alert');
        form.append(field('Type', type), field('Name', label), row1, field('Where you deliver (optional)', areas), err, button('Add option', 'btn-signup'));
        form.querySelector('.btn-signup').type = 'submit';
        type.addEventListener('change', () => {
            const col = type.value === 'collection';
            price.disabled = col; minD.disabled = col; maxD.disabled = col;
            if (col) { price.value = '0'; minD.value = '0'; maxD.value = '0'; if (!label.value) label.value = 'Collect from me'; }
            else if (price.value === '0') { price.value = '80'; minD.value = '2'; maxD.value = '4'; }
        });
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearErrors(form);
            const r = await api('/api/store/delivery', { method: 'POST', body: { type: type.value, label: label.value, price: Number(price.value), minDays: Number(minD.value), maxDays: Number(maxD.value), areas: areas.value } });
            if (!r.ok) return showError(err, r.data.message || 'Could not add the option.');
            toast('Delivery option added.');
            label.value = ''; areas.value = '';
            render(r.data.options);
        });
        wrap.append(form);
    }

    App.registerInboxTab({
        id: 'store', label: 'My store', order: 10,
        async build() {
            const store = await App.loadMyStore(true);
            if (!store) {
                const cta = el('a', 'btn btn-primary', 'Open your store');
                cta.href = '#/sell';
                return [muted("You don't have a store yet. Open one to start selling your technology."), cta];
            }
            const me = App.getUser();
            const head = el('div', 'store-head');
            head.append(avatarEl(me.avatar, me.id, me.fullName, 56));
            const t = el('div', 'store-head-text');
            t.append(el('h2', '', store.name), el('p', '', store.description || ''));
            head.append(t);

            const actions = el('div', 'pills');
            const add = el('a', 'btn btn-primary', 'Add a listing'); add.href = '#/sell';
            const view = el('a', 'btn', 'View public store'); view.href = '#/store/' + store.id;
            actions.append(add, view);

            const walletCard = el('a', 'wallet-mini');
            walletCard.href = '#/wallet';
            walletCard.append(muted('Loading wallet...'));
            api('/api/wallet').then(({ ok, data }) => {
                if (!ok) return walletCard.replaceChildren(el('strong', '', 'Wallet'));
                walletCard.replaceChildren();
                const a = el('div'); a.append(el('small', 'muted', 'Available'), el('strong', '', money(data.wallet.available)));
                const p = el('div'); p.append(el('small', 'muted', 'On hold (waiting for buyers)'), el('strong', '', money(data.wallet.pending)));
                const go = el('span', 'wallet-go'); go.append(document.createTextNode('Open wallet '), icon('fa-solid fa-chevron-right'));
                walletCard.append(icon('fa-solid fa-wallet'), a, p, go);
            });

            const bar = el('div', 'subtabs small');
            const content = el('div', 'store-section');
            const render = () => {
                bar.replaceChildren();
                [['listings', 'Listings'], ['orders', 'Orders'], ['delivery', 'Delivery']].forEach(([id, label]) => {
                    const b = button(label, id === section ? 'active' : '', () => { section = id; render(); });
                    bar.append(b);
                });
                if (section === 'listings') listingsSection(content, store);
                else if (section === 'orders') App.orderUI.sellerSection(content);
                else deliverySection(content);
            };
            render();
            return [head, actions, walletCard, bar, content];
        }
    });
})();
