// Delivery options shown on a product, and the checkout window (delivery choice, address, payment).
(() => {
    'use strict';
    const App = window.App;
    const { el, icon, button, api, toast, money, muted, showError } = App;

    const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
    const dayText = (d) => (d.type === 'collection' ? 'arrange a time with the seller' : d.minDays === d.maxDays ? `${d.maxDays} day${d.maxDays === 1 ? '' : 's'}` : `${d.minDays}-${d.maxDays} days`);
    const typeIcon = (t) => 'fa-solid ' + ((App.deliveryTypes && App.deliveryTypes[t] && App.deliveryTypes[t].icon) || 'fa-truck');

    // ---------- "Delivery" block in the product window ----------
    App.hooks.productDetail.push((ctx) => {
        const box = el('div', 'delivery-block');
        box.append(el('h3', 'mini-title', 'Delivery options'));
        ctx.delivery.forEach((d) => {
            const row = el('div', 'delivery-row');
            row.append(icon(typeIcon(d.type)));
            const t = el('div', 'delivery-info');
            t.append(el('strong', '', d.label), el('small', 'muted', `${d.price ? money(d.price) : 'Free'} · ${dayText(d)}${d.areas ? ' · ' + d.areas : ''}`));
            row.append(t);
            box.append(row);
        });
        ctx.slots.delivery.append(box);
    });

    // ---------- checkout ----------
    function input(type, value = '', attrs = {}) {
        const i = document.createElement('input');
        i.type = type; i.value = value;
        Object.entries(attrs).forEach(([k, v]) => i.setAttribute(k, v));
        return i;
    }
    function field(label, control) {
        const g = el('div', 'input-group');
        const l = el('label', '', label);
        const f = el('div', 'input-field');
        f.append(control);
        l.htmlFor = control.id = 'co' + Math.random().toString(36).slice(2, 8);
        g.append(l, f);
        return g;
    }

    async function open() {
        const cart = App.cart.get();
        if (!cart.length) return;
        const m = App.modal({ title: 'Checkout', wide: true });
        m.body.append(muted('Loading checkout...'));

        const storeIds = [...new Set(cart.map((i) => i.storeId))];
        const [storeRes, walletRes, setRes] = await Promise.all([
            Promise.all(storeIds.map((id) => api('/api/stores/' + encodeURIComponent(id)))),
            api('/api/wallet'),
            api('/api/settings')
        ]);
        m.body.replaceChildren();
        if (storeRes.some((r) => !r.ok)) return m.body.append(muted('A store in your cart could not be loaded. Remove its items from the cart and try again.'));

        const groups = storeIds.map((id, k) => ({ id, store: storeRes[k].data.store, items: cart.filter((i) => i.storeId === id), chosen: storeRes[k].data.store.delivery[0].id }));
        const walletBalance = walletRes.ok ? walletRes.data.wallet.available : 0;
        const prefill = setRes.ok ? setRes.data : null;
        const user = App.getUser();

        // ---- one section per store ----
        const optionOf = (g) => g.store.delivery.find((d) => d.id === g.chosen);
        groups.forEach((g, gi) => {
            const sec = el('section', 'co-store');
            sec.append(el('h3', '', g.store.name));
            const ul = el('ul', 'order-items');
            g.items.forEach((i) => ul.append(el('li', '', `${i.qty} × ${i.title} — ${money(i.price * i.qty)}${i.offerId ? ' (your offer)' : ''}`)));
            sec.append(ul, el('h4', 'mini-title', 'How do you want to get it?'));
            g.store.delivery.forEach((d) => {
                const lab = el('label', 'radio-card');
                const r = input('radio', d.id, { name: 'del-' + gi });
                r.checked = d.id === g.chosen;
                r.addEventListener('change', () => { g.chosen = d.id; update(); });
                const body = el('span', 'radio-body');
                body.append(icon(typeIcon(d.type)), document.createTextNode(' '), el('strong', '', d.label), el('small', 'muted', ` ${d.price ? money(d.price) : 'Free'} · ${dayText(d)}`));
                lab.append(r, body);
                sec.append(lab);
            });
            m.body.append(sec);
        });

        // ---- address (only when something is delivered) ----
        const addr = el('section', 'co-store');
        addr.append(el('h3', '', 'Delivery address'));
        const a = prefill ? prefill.contact.address : {};
        const f = {
            fullName: input('text', user.fullName, { maxlength: 80, autocomplete: 'name' }),
            phone: input('tel', prefill ? prefill.contact.phone : '', { maxlength: 20, autocomplete: 'tel', inputmode: 'tel', placeholder: '082 123 4567' }),
            street: input('text', a.street || '', { maxlength: 80, autocomplete: 'address-line1' }),
            city: input('text', a.city || '', { maxlength: 40, autocomplete: 'address-level2' }),
            postalCode: input('text', a.postalCode || '', { maxlength: 4, inputmode: 'numeric', autocomplete: 'postal-code' })
        };
        const prov = document.createElement('select');
        prov.append(Object.assign(el('option', '', 'Choose province'), { value: '' }));
        (prefill ? prefill.provinces : PROVINCES).forEach((p) => { const o = el('option', '', p); o.value = p; prov.append(o); });
        prov.value = a.province || '';
        const r1 = el('div', 'field-row'); r1.append(field('Full name', f.fullName), field('Phone', f.phone));
        const r2 = el('div', 'field-row'); r2.append(field('City / town', f.city), field('Postal code', f.postalCode));
        addr.append(r1, field('Street address', f.street), r2, field('Province', prov));
        m.body.append(addr);

        // ---- payment ----
        const pay = el('section', 'co-store');
        pay.append(el('h3', '', 'Payment'));
        const mkPay = (value, title, sub) => {
            const lab = el('label', 'radio-card');
            const r = input('radio', value, { name: 'payment' });
            const b = el('span', 'radio-body');
            b.append(el('strong', '', title), el('small', 'muted', ' ' + sub));
            lab.append(r, b);
            pay.append(lab);
            return { lab, r };
        };
        const walletOpt = mkPay('wallet', 'My wallet', `balance ${money(walletBalance)}`);
        const testOpt = mkPay('test', 'Card / EFT (test mode)', 'no real money is charged yet');
        testOpt.r.checked = true;
        pay.append(el('p', 'muted small', 'Your seller is paid only after you confirm you received the item (or 7 days after delivery).'));
        m.body.append(pay);

        // ---- totals + button ----
        const sum = el('div', 'co-summary');
        const err = el('div', 'error-msg');
        err.setAttribute('role', 'alert');
        const place = button('Place order', 'btn btn-primary btn-wide');
        m.body.append(sum, err, place);

        function totals() {
            const items = groups.reduce((s, g) => s + g.items.reduce((x, i) => x + i.price * i.qty, 0), 0);
            const delivery = groups.reduce((s, g) => s + optionOf(g).price, 0);
            return { items, delivery, total: items + delivery };
        }
        function update() {
            const t = totals();
            const needsAddress = groups.some((g) => optionOf(g).type !== 'collection');
            addr.hidden = !needsAddress;
            sum.replaceChildren();
            const line = (l, v, strong) => { const r = el('div', 'sum-line' + (strong ? ' strong' : '')); r.append(el('span', '', l), el('span', '', v)); sum.append(r); };
            line('Items', money(t.items));
            line('Delivery', t.delivery ? money(t.delivery) : 'Free');
            line('Total', money(t.total), true);
            const enough = walletBalance >= t.total;
            walletOpt.r.disabled = !enough;
            walletOpt.lab.classList.toggle('disabled', !enough);
            if (!enough && walletOpt.r.checked) testOpt.r.checked = true;
        }
        update();

        place.addEventListener('click', async () => {
            err.classList.remove('show');
            const needsAddress = groups.some((g) => optionOf(g).type !== 'collection');
            const address = needsAddress ? { fullName: f.fullName.value, phone: f.phone.value, street: f.street.value, city: f.city.value, province: prov.value, postalCode: f.postalCode.value } : undefined;
            if (needsAddress && Object.values(address).some((v) => !String(v).trim())) return showError(err, 'Fill in the full delivery address.');
            const payment = walletOpt.r.checked ? 'wallet' : 'test';
            place.disabled = true;
            place.textContent = 'Placing your order...';
            const r = await api('/api/orders', {
                method: 'POST',
                body: {
                    items: cart.map((i) => ({ id: i.id, qty: i.qty, ...(i.offerId ? { offerId: i.offerId } : {}) })),
                    delivery: Object.fromEntries(groups.map((g) => [g.id, g.chosen])),
                    address, payment
                }
            });
            place.disabled = false;
            place.textContent = 'Place order';
            if (!r.ok) return showError(err, r.data.message || 'Could not place your order.');
            App.cart.clear();
            toast(`Order placed! ${r.data.orders.length > 1 ? r.data.orders.length + ' orders' : 'Order #' + r.data.orders[0].shortId} · ${money(r.data.total)}`);
            App.refreshMeta();
            App.refreshBadges();
            App.navigate('#/inbox/orders');
        });
    }

    App.checkout = { open };
})();
