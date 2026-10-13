// Core of the website: shared tools, login, cart, routing, home, stores, selling and the product window.
// Other files (offers.js, checkout.js, settings.js ...) plug into the window.App object created here.
(() => {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const App = (window.App = { hooks: { productDetail: [] }, inboxTabs: [], views: {} });

    let user = null;
    let myStore; // undefined = not loaded yet, null = no store
    let categories = [];
    let brands = [];
    let filters = { category: '', brand: '', q: '' };
    let page = 1;
    let pages = 1;
    let loadSeq = 0;
    let currentView = 'home';
    let inboxTab = 'store';
    let pendingAction = null; // runs after a successful login / sign-up
    let favIds = new Set();
    let sellImages = [];
    const productCache = new Map(); // short-lived copy of the home list so Back is instant
    let authOverlay = null;
    let authOk = false;
    let cartOverlay = null;
    let productOverlay = null;

    const VIEWS = ['home', 'explore', 'store', 'sell', 'inbox', 'settings', 'wallet', 'admin'];
    const NEEDS_LOGIN = ['sell', 'inbox', 'settings', 'wallet', 'admin'];
    const CONDITION = { new: 'New', 'like-new': 'Like new', good: 'Good', fair: 'Fair' };

    // ==========================================
    // TOOLS
    // ==========================================
    const money = (n) => {
        const v = Number(n) || 0;
        return 'R' + v.toLocaleString('en-ZA', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
    };
    const fmtDate = (d, withTime = true) =>
        new Date(d).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text; // textContent keeps user content XSS-safe
        return node;
    }
    function icon(classes) {
        const i = el('i', classes);
        i.setAttribute('aria-hidden', 'true');
        return i;
    }
    const muted = (t) => el('p', 'muted', t);
    function button(label, cls = 'btn', onClick, iconClass) {
        const b = el('button', cls);
        b.type = 'button';
        if (iconClass) b.append(icon(iconClass), document.createTextNode(' '));
        b.append(document.createTextNode(label));
        if (onClick) b.addEventListener('click', onClick);
        return b;
    }

    const imgUrl = (id, n = 0) => `/api/products/${id}/images/${n}`;
    const thumbUrl = (id) => `/api/products/${id}/thumb`;
    const categoryName = (id) => (categories.find((c) => c.id === id) || { name: id }).name;

    async function api(path, options = {}) {
        try {
            const res = await fetch(path, {
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                method: options.method || 'GET',
                body: options.body ? JSON.stringify(options.body) : undefined
            });
            let data = {};
            try { data = await res.json(); } catch { /* empty body */ }
            return { ok: res.ok, status: res.status, data };
        } catch {
            return { ok: false, status: 0, data: { message: 'Network error. Check your connection and try again.' } };
        }
    }

    let toastTimer;
    function toast(message, isError = false) {
        const t = $('toast');
        t.textContent = message;
        t.classList.toggle('error', isError);
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
    }
    function showError(node, message) {
        node.textContent = message;
        node.classList.add('show');
    }
    function clearErrors(scope = document) {
        scope.querySelectorAll('.error-msg').forEach((n) => { n.textContent = ''; n.classList.remove('show'); });
        const w = $('confirmFieldWrapper');
        if (w) w.classList.remove('input-error-border');
    }

    // ---------- pop-ups are part of the browser history ----------
    // Product window, cart, sheets and the photo viewer each add one history step, so the phone's
    // Back button (or swipe) closes the top pop-up first, exactly like a normal app.
    const overlayStack = [];
    let overlayCounter = 0;
    let pendingBack = 0; // history steps we asked the browser to go back that have not finished yet
    const afterPop = []; // history steps to add once those finish (so quick taps cannot get out of order)

    function syncScroll() {
        document.body.classList.toggle('no-scroll', overlayStack.length > 0);
    }
    function finishOverlay(o) {
        if (o.done) return;
        o.done = true;
        const i = overlayStack.indexOf(o);
        if (i >= 0) overlayStack.splice(i, 1);
        try { o.closeNow(); } catch (e) { console.error(e); }
        syncScroll();
        o.waiters.splice(0).forEach((resolve) => resolve());
    }
    function openOverlay(closeNow) {
        const o = { id: ++overlayCounter, closeNow, done: false, pushed: false, wantClose: false, waiters: [] };
        overlayStack.push(o);
        const push = () => {
            if (o.done) return;
            o.pushed = true;
            history.pushState({ ov: o.id }, '', location.href);
        };
        if (pendingBack > 0) afterPop.push(push); else push();
        // Asks for this pop-up to close. The promise resolves when it is really gone.
        o.dismiss = () => new Promise((resolve) => {
            if (o.done) return resolve();
            o.waiters.push(resolve);
            const top = overlayStack[overlayStack.length - 1];
            if (!o.pushed) finishOverlay(o); // it never got a history step, so just close it
            else if (top === o && history.state && history.state.ov === o.id) { pendingBack++; history.back(); }
            else o.wantClose = true; // something is open on top of it, so it closes right after that one
        });
        syncScroll();
        return o;
    }
    // Closes every pop-up and returns to the page underneath (used before changing page)
    function closeAllOverlays() {
        const pushed = overlayStack.filter((o) => o.pushed);
        overlayStack.filter((o) => !o.pushed).forEach(finishOverlay);
        if (!pushed.length) return Promise.resolve();
        return new Promise((resolve) => {
            const snapshot = overlayStack.slice(); // only the pop-ups that exist right now
            // safety net if the browser never answers; cancelled as soon as the pop-ups are really gone
            const timer = setTimeout(() => {
                snapshot.forEach(finishOverlay);
                pendingBack = 0;
                afterPop.splice(0).forEach((f) => f());
            }, 1500);
            pushed[0].waiters.push(() => { clearTimeout(timer); resolve(); });
            pendingBack++;
            history.go(-pushed.length);
        });
    }
    window.addEventListener('popstate', (e) => {
        if (pendingBack > 0) pendingBack--;
        const cur = e.state && e.state.ov;
        const pushed = overlayStack.filter((o) => o.pushed);
        const k = pushed.findIndex((o) => o.id === cur);
        pushed.slice(k + 1).reverse().forEach(finishOverlay);
        // a pop-up that was waiting for the one above it to close
        const top = [...overlayStack].reverse().find((o) => o.pushed);
        if (top && top.wantClose && history.state && history.state.ov === top.id) { top.wantClose = false; pendingBack++; history.back(); }
        if (pendingBack === 0) afterPop.splice(0).forEach((f) => f());
        if ((location.hash || '#/home') !== currentKey) poppedNav = true; // a real Back to another page
    });

    // Pop-up windows: bottom sheets on phones, centred cards on computers
    function modal({ title = '', wide = false } = {}) {
        const wrap = el('div', 'modal');
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        if (title) wrap.setAttribute('aria-label', title);
        const box = el('div', 'sheet' + (wide ? ' wide' : ''));
        const x = el('button', 'icon-btn modal-close');
        x.type = 'button';
        x.setAttribute('aria-label', 'Close');
        x.append(icon('fa-solid fa-xmark'));
        const body = el('div', 'sheet-body');
        box.append(x);
        if (title) box.append(el('h2', 'sheet-title', title));
        box.append(body);
        wrap.append(box);
        document.body.append(wrap);
        const m = { el: wrap, body };
        const o = openOverlay(() => { wrap.remove(); if (m.onClose) m.onClose(); });
        m.close = () => o.dismiss(); // returns a promise
        x.addEventListener('click', m.close);
        wrap.addEventListener('click', (e) => { if (e.target === wrap) m.close(); });
        return m;
    }

    // ---------- profile pictures ----------
    function avatarEl(info, id, name, size = 36) {
        const wrap = el('span', 'avatar');
        wrap.style.setProperty('--size', size + 'px');
        if (info && info.has) {
            const im = document.createElement('img');
            im.src = `/api/users/${id}/avatar?v=${info.v}`;
            im.alt = '';
            im.decoding = 'async';
            wrap.append(im);
        } else {
            wrap.append(el('span', 'avatar-initial', (name || '?').trim().charAt(0).toUpperCase()));
        }
        if (info && info.verified) {
            const b = el('span', 'verified-badge');
            b.title = 'Verified profile photo';
            b.append(icon('fa-solid fa-circle-check'));
            wrap.append(b);
        }
        return wrap;
    }

    // ==========================================
    // LOGIN / SIGN UP
    // ==========================================
    function setUser(u) {
        user = u;
        renderUserUI();
    }

    function renderUserUI() {
        $('accountBtn').hidden = !!user;
        $('profileWrap').hidden = !user;
        if (user) {
            $('profileBtn').replaceChildren(avatarEl(user.avatar, user.id, user.fullName, 34));
            $('menuName').textContent = user.fullName;
            $('menuEmail').textContent = user.email;
            $('menuAdmin').hidden = !user.isAdmin;
        } else {
            $('profileMenu').hidden = true;
        }
    }

    function openAuth(view) {
        showAuthView(view);
        $('authModal').hidden = false;
        if (!authOverlay || authOverlay.done) {
            authOverlay = openOverlay(() => {
                $('authModal').hidden = true;
                if (!authOk) pendingAction = null; // closing the login box cancels whatever they were trying to do
            });
        }
        setTimeout(() => (view === 'signup' ? $('fullName') : $('loginEmail')).focus(), 60);
    }
    function showAuthView(view) {
        $('signup-panel').hidden = view !== 'signup';
        $('login-panel').hidden = view !== 'login';
        clearErrors($('authModal'));
    }
    function closeAuth() {
        return authOverlay && !authOverlay.done ? authOverlay.dismiss() : Promise.resolve();
    }

    // Runs fn now if logged in, otherwise after the person logs in
    function requireLogin(fn, message = 'Log in to continue.') {
        if (user) return fn();
        pendingAction = fn;
        openAuth('login');
        toast(message);
    }

    async function onAuthSuccess(newUser) {
        setUser(newUser);
        myStore = undefined;
        authOk = true;
        await closeAuth(); // wait until it is gone before opening anything else
        authOk = false;
        toast(`Welcome, ${user.fullName.split(' ')[0]}!`);
        await loadFavourites();
        refreshBadges();
        const action = pendingAction;
        pendingAction = null;
        if (action) await action();
    }

    async function submitAuth(form, endpoint, body, errorBox) {
        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        const { ok, data } = await api(endpoint, { method: 'POST', body });
        submit.disabled = false;
        if (!ok) return showError(errorBox, data.message || 'Something went wrong. Try again.');
        form.reset();
        await onAuthSuccess(data.user);
    }

    $('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        clearErrors($('authModal'));
        const form = e.currentTarget;
        const fd = new FormData(form);
        submitAuth(form, '/api/login', { email: fd.get('email'), password: fd.get('password'), rememberMe: fd.get('rememberMe') === 'on' }, $('loginError'));
    });
    $('registrationForm').addEventListener('submit', (e) => {
        e.preventDefault();
        clearErrors($('authModal'));
        const form = e.currentTarget;
        const fd = new FormData(form);
        const password = $('signupPassword').value;
        if (password.length < 8) return showError($('signupError'), 'Password must be at least 8 characters.');
        if (password !== $('confirmPassword').value) {
            showError($('passwordError'), 'Passwords do not match.');
            $('confirmFieldWrapper').classList.add('input-error-border');
            return;
        }
        submitAuth(form, '/api/register', { fullName: fd.get('fullName'), email: fd.get('email'), password, rememberMe: fd.get('rememberMe') === 'on' }, $('signupError'));
    });

    async function logout() {
        await api('/api/logout', { method: 'POST' });
        setUser(null);
        myStore = undefined;
        favIds.clear();
        updateFavUI();
        setBadge(0);
        await closeAllOverlays();
        toast('You are logged out.');
        if (NEEDS_LOGIN.includes(currentView)) location.hash = '#/home';
        else route();
    }

    // profile menu
    $('profileBtn').addEventListener('click', (e) => { e.stopPropagation(); $('profileMenu').hidden = !$('profileMenu').hidden; });
    document.addEventListener('click', (e) => { if (!e.target.closest('#profileWrap')) $('profileMenu').hidden = true; });
    $('profileMenu').addEventListener('click', (e) => { if (e.target.closest('a')) $('profileMenu').hidden = true; });

    // ==========================================
    // CART (kept in this browser; one line per product)
    // ==========================================
    let cart = loadCart();
    const cartListeners = [];
    function loadCart() {
        try {
            const raw = JSON.parse(localStorage.getItem('cart2') || '[]');
            return Array.isArray(raw) ? raw.filter((i) => i && typeof i.id === 'string' && typeof i.title === 'string' && Number.isInteger(i.qty) && i.qty > 0 && typeof i.price === 'number') : [];
        } catch { return []; }
    }
    function saveCart() {
        try { localStorage.setItem('cart2', JSON.stringify(cart)); } catch { /* storage blocked */ }
        cartListeners.forEach((f) => f());
    }
    const cartApi = {
        get: () => cart,
        onChange: (f) => cartListeners.push(f),
        clear() { cart = []; saveCart(); renderCart(); },
        removeIds(ids) { cart = cart.filter((i) => !ids.includes(i.id)); saveCart(); renderCart(); },
        // p = product from the API; opts.offer = { id, price } to buy at an accepted offer price
        add(p, opts = {}) {
            const line = cart.find((i) => i.id === p.id);
            if (opts.offer) {
                cart = cart.filter((i) => i.id !== p.id);
                cart.push({ id: p.id, title: p.title, price: opts.offer.price, listPrice: p.price, image: p.imageCount ? thumbUrl(p.id) : '', max: 1, qty: 1, offerId: opts.offer.id, storeId: p.store.id, storeName: p.store.name });
                toast('Added at your offer price');
            } else if (line) {
                if (line.offerId) return toast('Already in your cart at your offer price.');
                if (line.qty >= p.quantity) return toast('That is all the stock available.', true);
                line.qty++;
                line.max = p.quantity;
                toast('Added to cart');
            } else {
                cart.push({ id: p.id, title: p.title, price: p.price, image: p.imageCount ? thumbUrl(p.id) : '', max: p.quantity, qty: 1, storeId: p.store.id, storeName: p.store.name });
                toast('Added to cart');
            }
            saveCart();
            renderCart();
        }
    };
    App.cart = cartApi;

    function iconButton(iconClass, act, id, label) {
        const b = el('button', 'icon-btn');
        b.type = 'button';
        b.dataset.act = act;
        b.dataset.id = id;
        b.setAttribute('aria-label', label);
        b.append(icon('fa-solid ' + iconClass));
        return b;
    }

    function renderCart() {
        const count = cart.reduce((s, i) => s + i.qty, 0);
        const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
        $('cartCount').textContent = count;
        $('cartTotal').textContent = money(total);
        $('checkoutBtn').disabled = cart.length === 0;
        const box = $('cartItems');
        box.replaceChildren();
        if (!cart.length) return box.append(muted('Your cart is empty. Add something from the shop.'));
        cart.forEach((i) => {
            const row = el('div', 'cart-row');
            if (i.image) {
                const t = document.createElement('img');
                t.className = 'thumb';
                t.src = i.image;
                t.alt = '';
                row.append(t);
            }
            const info = el('div', 'cart-info');
            info.append(el('strong', '', i.title), el('small', '', i.offerId ? `${money(i.price)} (your offer, was ${money(i.listPrice)})` : money(i.price) + ' each'));
            const controls = el('div', 'qty');
            if (i.offerId) controls.append(iconButton('fa-trash', 'remove', i.id, 'Remove ' + i.title));
            else controls.append(iconButton('fa-minus', 'dec', i.id, 'Decrease quantity'), el('span', '', String(i.qty)), iconButton('fa-plus', 'inc', i.id, 'Increase quantity'), iconButton('fa-trash', 'remove', i.id, 'Remove ' + i.title));
            row.append(info, controls);
            box.append(row);
        });
    }
    $('cartItems').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]');
        if (!b) return;
        const line = cart.find((i) => i.id === b.dataset.id);
        if (!line) return;
        if (b.dataset.act === 'inc') line.qty = Math.min(line.max || 20, line.qty + 1);
        if (b.dataset.act === 'dec') line.qty -= 1;
        if (b.dataset.act === 'remove' || line.qty < 1) cart = cart.filter((i) => i.id !== line.id);
        saveCart();
        renderCart();
    });
    function openCart() {
        $('cartDrawer').classList.add('open');
        $('cartDrawer').setAttribute('aria-hidden', 'false');
        $('cartBackdrop').hidden = false;
        if (!cartOverlay || cartOverlay.done) {
            cartOverlay = openOverlay(() => {
                $('cartDrawer').classList.remove('open');
                $('cartDrawer').setAttribute('aria-hidden', 'true');
                $('cartBackdrop').hidden = true;
            });
        }
    }
    function closeCart() {
        return cartOverlay && !cartOverlay.done ? cartOverlay.dismiss() : Promise.resolve();
    }
    App.openCart = openCart;
    App.closeCart = closeCart;
    $('checkoutBtn').addEventListener('click', () => {
        if (!cart.length) return;
        requireLogin(() => (App.checkout ? App.checkout.open() : toast('Checkout is not available.', true)), 'Log in or create an account to place your order.');
    });

    // ==========================================
    // META: categories + brands + red dots
    // ==========================================
    async function refreshMeta() {
        productCache.clear(); // something may have changed (new listing, sale, ...)
        const [c, b] = await Promise.all([api('/api/categories'), api('/api/brands')]);
        if (c.ok) categories = c.data.categories;
        if (b.ok) brands = b.data.brands;
        App.categories = categories;
        fillCategorySelect();
        if (currentView === 'home') { renderBrands(); renderCategories(); }
    }
    function fillCategorySelect() {
        const sel = $('pCategory');
        const keep = sel.value;
        sel.replaceChildren();
        categories.forEach((c) => { const o = el('option', '', c.name); o.value = c.id; sel.append(o); });
        if (keep) sel.value = keep;
    }
    function setBadge(n) {
        const b = $('inboxBadge');
        b.textContent = n > 9 ? '9+' : String(n);
        b.hidden = !n;
    }
    let lastBadgeAt = 0;
    async function refreshBadges(throttle = false) {
        if (!user) return setBadge(0);
        if (throttle && Date.now() - lastBadgeAt < 8000) return;
        lastBadgeAt = Date.now();
        const { ok, data } = await api('/api/notifications');
        if (ok) setBadge((data.offers || 0) + (data.orders || 0));
    }
    setInterval(() => { if (!document.hidden && user) refreshBadges(); }, 60000);

    // ==========================================
    // ROUTING  (#/home  #/explore  #/store/ID  #/sell  #/inbox/TAB  #/settings  #/wallet  #/admin)
    // ==========================================
    // Remembers where you were on each page, so Back lands on the same spot
    const scrollMemory = {};
    let currentKey = '';
    let poppedNav = false;
    let inAppNav = false;
    let scrollTick = false;
    window.addEventListener('scroll', () => {
        if (scrollTick || !currentKey) return;
        scrollTick = true;
        requestAnimationFrame(() => { scrollTick = false; scrollMemory[currentKey] = window.scrollY; });
    }, { passive: true });
    function restoreScroll(y) {
        let tries = 0;
        const tick = () => {
            if (document.documentElement.scrollHeight >= y + window.innerHeight - 4 || tries++ > 25) return window.scrollTo(0, y);
            setTimeout(tick, 60);
        };
        tick();
    }
    const BACK_VIEWS = ['store', 'settings', 'wallet', 'admin'];
    $('backBtn').addEventListener('click', () => { if (inAppNav) history.back(); else location.hash = '#/home'; });

    function route() {
        overlayStack.slice().forEach(finishOverlay); // changing page closes every pop-up
        const parts = location.hash.replace(/^#\/?/, '').split('/');
        let view = VIEWS.includes(parts[0]) ? parts[0] : 'home';

        if (NEEDS_LOGIN.includes(view) && !user) {
            const target = '#/' + parts.join('/');
            history.replaceState(null, '', '#/home');
            view = 'home';
            pendingAction = () => { location.hash = target; };
            openAuth('login');
            toast('Log in to continue.');
        }
        const key = location.hash || '#/home';
        const restoreY = poppedNav ? scrollMemory[key] || 0 : 0;
        poppedNav = false;
        currentKey = key;
        currentView = view;
        $('backBtn').hidden = !BACK_VIEWS.includes(view);
        VIEWS.forEach((v) => { $('view-' + v).hidden = v !== view; });
        const tabFor = view === 'store' ? 'explore' : view;
        document.querySelectorAll('#mainTabs a').forEach((a) => {
            const on = a.dataset.route === tabFor;
            a.classList.toggle('active', on);
            if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
        if (restoreY) restoreScroll(restoreY); else window.scrollTo(0, 0);

        if (view === 'home') renderHome();
        else if (view === 'explore') loadStores();
        else if (view === 'store') loadStorePage(parts[1]);
        else if (view === 'sell') renderSell();
        else if (view === 'inbox') { if (parts[1]) inboxTab = parts[1]; renderInbox(); }
        else if (App.views[view]) App.views[view](parts[1]);
        refreshBadges(true);
    }
    window.addEventListener('hashchange', () => { inAppNav = true; route(); });

    // ==========================================
    // PRODUCT CARDS
    // ==========================================
    function productCard(p, opts = {}) {
        const card = el('article', 'product');
        card.dataset.id = p.id;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `${p.title}, ${money(p.price)}`);
        const imgBox = el('div', 'product-img');
        if (p.imageCount > 0) {
            const im = document.createElement('img');
            im.src = thumbUrl(p.id);
            im.alt = p.title;
            im.loading = 'lazy';
            im.decoding = 'async';
            imgBox.append(im);
        } else {
            imgBox.append(icon('fa-solid fa-image'));
        }
        const sold = p.quantity <= 0;
        if (sold) card.classList.add('is-sold');
        if (opts.showStatus || sold) imgBox.append(el('span', 'status-tag ' + (sold ? 'sold' : 'available'), sold ? 'Sold' : 'Available'));
        if (!opts.manage) {
            const on = favIds.has(p.id);
            const fav = el('button', 'fav-btn' + (on ? ' on' : ''));
            fav.type = 'button';
            fav.dataset.fav = p.id;
            fav.setAttribute('aria-pressed', String(on));
            fav.setAttribute('aria-label', 'Favourite: ' + p.title);
            fav.append(icon((on ? 'fa-solid' : 'fa-regular') + ' fa-heart'));
            imgBox.append(fav);
        } else {
            const del = el('button', 'icon-btn delete-btn');
            del.type = 'button';
            del.dataset.del = p.id;
            del.setAttribute('aria-label', 'Delete ' + p.title);
            del.append(icon('fa-solid fa-trash'));
            imgBox.append(del);
        }
        card.append(imgBox, el('div', 'price', money(p.price)), el('h3', '', p.title));
        if (p.store.name && !opts.manage) card.append(el('p', 'seller muted', 'by ' + p.store.name));
        return card;
    }
    function bindProductGrid(grid) {
        grid.addEventListener('click', (e) => {
            const fav = e.target.closest('[data-fav]');
            if (fav) return toggleFav(fav.dataset.fav);
            const del = e.target.closest('[data-del]');
            if (del) return deleteListing(del.dataset.del);
            if (e.target.closest('[data-skip]')) return;
            const card = e.target.closest('.product');
            if (card) openProduct(card.dataset.id);
        });
        grid.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const card = e.target.closest('.product');
            if (card && e.target === card) { e.preventDefault(); openProduct(card.dataset.id); }
        });
    }

    // ==========================================
    // PRODUCT WINDOW (swipe gallery, tap to zoom, delivery, offers ...)
    // ==========================================
    function buildGallery(p) {
        const urls = Array.from({ length: p.imageCount }, (_, i) => imgUrl(p.id, i));
        const wrap = el('div', 'gallery');
        if (!urls.length) { wrap.append(el('div', 'g-empty', 'No photos')); return wrap; }
        const track = el('div', 'g-track');
        urls.forEach((u, i) => {
            const slide = el('div', 'g-slide');
            const im = document.createElement('img');
            im.src = u;
            im.alt = `${p.title}, photo ${i + 1} of ${urls.length}`;
            im.decoding = 'async';
            im.draggable = false;
            if (i > 0) im.loading = 'lazy';
            slide.append(im);
            slide.addEventListener('click', () => window.Lightbox && window.Lightbox.open(urls, i, p.title));
            track.append(slide);
        });
        wrap.append(track);
        const hint = el('span', 'zoom-hint');
        hint.append(icon('fa-solid fa-magnifying-glass-plus'), document.createTextNode(' Tap to zoom'));
        wrap.append(hint);
        if (urls.length > 1) {
            const dots = el('div', 'g-dots');
            urls.forEach(() => dots.append(el('span', 'g-dot')));
            wrap.append(dots);
            const setDot = () => {
                const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
                dots.querySelectorAll('.g-dot').forEach((d, k) => d.classList.toggle('on', k === i));
            };
            track.addEventListener('scroll', setDot, { passive: true });
            setDot();
            const go = (dir) => track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
            const prev = button('', 'g-arrow prev', () => go(-1), 'fa-solid fa-chevron-left');
            const next = button('', 'g-arrow next', () => go(1), 'fa-solid fa-chevron-right');
            prev.setAttribute('aria-label', 'Previous photo');
            next.setAttribute('aria-label', 'Next photo');
            wrap.append(prev, next);
            dots.firstChild.classList.add('on');
        }
        return wrap;
    }

    async function openProduct(id) {
        const { ok, data } = await api('/api/products/' + encodeURIComponent(id));
        if (!ok) return toast('That listing is no longer available.', true);
        const { product: p, delivery, seller } = data;
        const box = $('productDetail');
        box.replaceChildren();
        const isOwner = !!(user && p.owner === user.id);

        const info = el('div', 'detail-info');
        info.append(el('h2', '', p.title), el('div', 'detail-price', money(p.price)));

        const sellerRow = el('a', 'seller-row');
        sellerRow.href = '#/store/' + p.store.id;
        sellerRow.addEventListener('click', (e) => { e.preventDefault(); App.navigate('#/store/' + p.store.id); });
        const sellerText = el('span', 'seller-text');
        sellerText.append(el('small', 'muted', 'Sold by'), el('strong', '', p.store.name || 'Store'), el('small', 'muted', seller.name + (seller.avatar.verified ? ' · verified photo' : '')));
        sellerRow.append(avatarEl(seller.avatar, seller.id, seller.name, 42), sellerText);
        info.append(sellerRow);

        const meta = el('dl', 'meta');
        const row = (k, v) => meta.append(el('dt', '', k), el('dd', '', v));
        row('Condition', CONDITION[p.condition] || p.condition);
        row('Type', categoryName(p.category));
        if (p.brand) row('Brand', p.brand);
        row('Availability', p.quantity > 0 ? `Available (${p.quantity} in stock)` : 'Sold');
        info.append(meta);
        if (p.description) info.append(el('p', 'desc', p.description));

        const slots = { delivery: el('div', 'slot'), offer: el('div', 'slot') };
        info.append(slots.delivery);

        const add = button(p.quantity > 0 ? 'Add to cart' : 'Sold out', 'btn btn-primary btn-wide', () => cartApi.add(p), 'fa-solid fa-cart-plus');
        add.disabled = p.quantity <= 0 || isOwner;
        info.append(add, slots.offer);

        if (!isOwner) {
            const favBtn = button('Favourite', 'btn btn-wide', () => toggleFav(p.id), 'fa-regular fa-heart');
            favBtn.dataset.fav = p.id;
            paintHeart(favBtn, favIds.has(p.id));
            info.append(favBtn);

            const msg = el('div', 'msg-box');
            const ta = document.createElement('textarea');
            ta.rows = 2;
            ta.maxLength = 1000;
            ta.placeholder = 'Ask the seller a question...';
            ta.setAttribute('aria-label', 'Message to the seller');
            const send = button('Message seller', 'btn btn-wide', async () => {
                const body = ta.value.trim();
                if (!body) return toast('Write a message first.', true);
                if (!user) return requireLogin(() => openProduct(p.id), 'Log in to message the seller.');
                send.disabled = true;
                const r = await api('/api/messages', { method: 'POST', body: { productId: p.id, body } });
                send.disabled = false;
                if (!r.ok) return toast(r.data.message || 'Could not send your message.', true);
                ta.value = '';
                toast('Message sent. Replies show up in your Inbox.');
            });
            msg.append(ta, send);
            info.append(msg);
        } else {
            info.append(muted('This is your listing.'));
        }

        const ctx = { p, delivery, seller, isOwner, slots, info, user, close: () => closeProductModal(), reopen: () => openProduct(p.id) };
        App.hooks.productDetail.forEach((h) => { try { h(ctx); } catch (e) { console.error(e); } });

        box.append(el('div', 'detail').appendChild(buildGallery(p)).parentNode);
        box.firstChild.append(info);
        showProductModal();
        $('productModal').scrollTop = 0;
    }
    function showProductModal() {
        $('productModal').hidden = false;
        if (!productOverlay || productOverlay.done) productOverlay = openOverlay(() => { $('productModal').hidden = true; });
    }
    function closeProductModal() {
        return productOverlay && !productOverlay.done ? productOverlay.dismiss() : Promise.resolve();
    }
    App.openProduct = openProduct;

    async function deleteListing(id) {
        if (!confirm('Delete this listing? This cannot be undone.')) return;
        const { ok, data } = await api('/api/products/' + id, { method: 'DELETE' });
        if (!ok) return toast(data.message || 'Could not delete the listing.', true);
        toast('Listing deleted.');
        refreshMeta();
        if (currentView === 'inbox') renderInboxTab();
    }

    // ==========================================
    // FAVOURITES
    // ==========================================
    function paintHeart(btn, on) {
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', String(on));
        const i = btn.querySelector('i');
        if (i) i.className = (on ? 'fa-solid' : 'fa-regular') + ' fa-heart';
    }
    function updateFavUI() {
        $('favCount').textContent = favIds.size;
        $('favCount').hidden = favIds.size === 0;
        document.querySelectorAll('[data-fav]').forEach((b) => paintHeart(b, favIds.has(b.dataset.fav)));
    }
    async function loadFavourites() {
        if (!user) favIds.clear();
        else {
            const { ok, data } = await api('/api/favourites');
            if (ok) favIds = new Set(data.products.map((p) => p.id));
        }
        updateFavUI();
    }
    async function setFav(id, on) {
        if (!user) return requireLogin(() => setFav(id, true), 'Log in to save favourites.');
        if (favIds.has(id) === on) return;
        if (on) favIds.add(id); else favIds.delete(id);
        updateFavUI();
        const r = on
            ? await api('/api/favourites', { method: 'POST', body: { productId: id } })
            : await api('/api/favourites/' + encodeURIComponent(id), { method: 'DELETE' });
        if (!r.ok) {
            if (on) favIds.delete(id); else favIds.add(id);
            updateFavUI();
            return toast(r.data.message || 'Could not update your favourites.', true);
        }
        toast(on ? 'Saved to favourites' : 'Removed from favourites');
        if (!on && currentView === 'inbox' && inboxTab === 'favourites') renderInboxTab();
    }
    const toggleFav = (id) => setFav(id, !favIds.has(id));
    $('favBtn').addEventListener('click', () => requireLogin(() => { inboxTab = 'favourites'; if (location.hash === '#/inbox/favourites') renderInbox(); else location.hash = '#/inbox/favourites'; }, 'Log in to see your favourites.'));

    // ==========================================
    // HOME
    // ==========================================
    function renderHome() {
        renderFilterUI();
        loadProducts(true);
    }
    function renderBrands() {
        $('brandsSection').hidden = brands.length === 0;
        const row = $('brandRow');
        row.replaceChildren();
        brands.forEach((b) => {
            const chip = el('button', 'chip' + (filters.brand.toLowerCase() === b.name.toLowerCase() ? ' active' : ''), b.name);
            chip.type = 'button';
            chip.dataset.brand = b.name;
            row.append(chip);
        });
    }
    function renderTechStrip() {
        const row = $('techRow');
        row.replaceChildren();
        const chipFor = (id, label, iconClass, count) => {
            const chip = el('button', 'tech-chip' + (filters.category === id ? ' active' : ''));
            chip.type = 'button';
            chip.dataset.tech = id;
            const ic = el('span', 'cat-icon');
            ic.append(icon('fa-solid ' + iconClass));
            chip.append(ic, el('strong', '', label), el('small', '', count === 1 ? '1 item' : `${count} items`));
            row.append(chip);
        };
        chipFor('', 'All tech', 'fa-border-all', categories.reduce((s, c) => s + c.count, 0));
        categories.forEach((c) => chipFor(c.id, c.name, c.icon, c.count));
    }
    function renderCategories() {
        renderTechStrip();
        const grid = $('categoryGrid');
        grid.replaceChildren();
        categories.forEach((c) => {
            const card = el('button', 'cat-card' + (filters.category === c.id ? ' active' : ''));
            card.type = 'button';
            card.dataset.cat = c.id;
            const ic = el('span', 'cat-icon');
            ic.append(icon('fa-solid ' + c.icon));
            card.append(ic, el('strong', '', c.name), el('small', '', c.count === 1 ? '1 item' : `${c.count} items`));
            grid.append(card);
        });
    }
    function renderFilterUI() {
        const pills = $('filterPills');
        pills.replaceChildren();
        const add = (label, key) => {
            const p = el('button', 'pill', label + ' ');
            p.type = 'button';
            p.dataset.clear = key;
            p.append(icon('fa-solid fa-xmark'));
            pills.append(p);
        };
        if (filters.category) add(categoryName(filters.category), 'category');
        if (filters.brand) add(filters.brand, 'brand');
        if (filters.q) add('Search: ' + filters.q, 'q');
        if (pills.children.length > 1) add('Clear all', 'all');
        renderBrands();
        renderCategories();
    }
    function applyFilters() {
        if (currentView !== 'home') location.hash = '#/home';
        else { renderFilterUI(); loadProducts(true); }
    }
    async function loadProducts(reset) {
        const grid = $('productGrid');
        const seq = ++loadSeq;
        if (reset) { page = 1; grid.replaceChildren(muted('Loading...')); $('loadMore').hidden = true; } else page++;
        const params = new URLSearchParams({ page, limit: 24 });
        if (filters.category) params.set('category', filters.category);
        if (filters.brand) params.set('brand', filters.brand);
        if (filters.q) params.set('search', filters.q);
        const key = params.toString();
        const hit = productCache.get(key);
        let res;
        if (reset && hit && Date.now() - hit.at < 30000) res = { ok: true, data: hit.data };
        else { res = await api('/api/products?' + params); if (res.ok && reset) productCache.set(key, { at: Date.now(), data: res.data }); }
        const { ok, data } = res;
        if (seq !== loadSeq) return;
        if (reset) grid.replaceChildren();
        if (!ok) return grid.append(muted(data.message || 'Could not load products. Refresh and try again.'));
        pages = data.pages;
        const frag = document.createDocumentFragment();
        data.products.forEach((p) => frag.append(productCard(p)));
        grid.append(frag);
        if (reset && !data.products.length) {
            grid.append(muted(filters.category || filters.brand || filters.q ? 'No listings match your filters.' : 'No listings yet. Open a store from the Sell tab and add the first one.'));
        }
        $('loadMore').hidden = page >= pages;
    }

    $('brandRow').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-brand]');
        if (!chip) return;
        filters.brand = filters.brand.toLowerCase() === chip.dataset.brand.toLowerCase() ? '' : chip.dataset.brand;
        applyFilters();
    });
    $('techRow').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-tech]');
        if (!chip) return;
        const id = chip.dataset.tech;
        filters.category = id && filters.category === id ? '' : id;
        applyFilters();
    });
    $('categoryGrid').addEventListener('click', (e) => {
        const card = e.target.closest('[data-cat]');
        if (!card) return;
        filters.category = filters.category === card.dataset.cat ? '' : card.dataset.cat;
        applyFilters();
        $('forYou').scrollIntoView({ behavior: 'smooth' });
    });
    $('filterPills').addEventListener('click', (e) => {
        const pill = e.target.closest('[data-clear]');
        if (!pill) return;
        if (pill.dataset.clear === 'all') { filters = { category: '', brand: '', q: '' }; $('searchInput').value = ''; }
        else { filters[pill.dataset.clear] = ''; if (pill.dataset.clear === 'q') $('searchInput').value = ''; }
        applyFilters();
    });
    $('loadMore').addEventListener('click', () => loadProducts(false));
    let searchTimer;
    $('searchInput').addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { filters.q = $('searchInput').value.trim(); applyFilters(); }, 350);
    });

    // ==========================================
    // EXPLORE + STORE PAGE
    // ==========================================
    async function loadStores() {
        const grid = $('storeGrid');
        grid.replaceChildren(muted('Loading stores...'));
        const { ok, data } = await api('/api/stores');
        grid.replaceChildren();
        if (!ok) return grid.append(muted(data.message || 'Could not load stores.'));
        if (!data.stores.length) return grid.append(muted('No stores yet. Be the first: open yours from the Sell tab.'));
        data.stores.forEach((s) => {
            const card = el('a', 'store-card');
            card.href = '#/store/' + s.id;
            const ic = el('span', 'cat-icon');
            ic.append(icon('fa-solid fa-store'));
            card.append(ic, el('h3', '', s.name), el('p', '', s.description || 'No description yet.'), el('small', 'muted', s.items === 1 ? '1 item' : `${s.items} items`));
            grid.append(card);
        });
    }

    async function loadStorePage(id) {
        const head = $('storeHeader');
        const grid = $('storeProducts');
        head.replaceChildren();
        grid.replaceChildren(muted('Loading...'));
        const s = await api('/api/stores/' + encodeURIComponent(id || ''));
        if (!s.ok) return grid.replaceChildren(muted(s.data.message || 'Store not found.'));
        const store = s.data.store;
        const h = el('div', 'store-head');
        if (store.owner) h.append(avatarEl(store.owner.avatar, '', store.owner.name, 56));
        const t = el('div', 'store-head-text');
        t.append(el('h2', '', store.name), el('p', '', store.description || ''), el('small', 'muted', `${store.items === 1 ? '1 item' : store.items + ' items'} for sale${store.owner ? ' · by ' + store.owner.name : ''}${store.owner && store.owner.avatar.verified ? ' · verified photo' : ''}`));
        h.append(t);
        head.append(h);
        const dl = el('div', 'delivery-summary');
        dl.append(el('strong', '', 'Delivery: '), document.createTextNode(store.delivery.map((d) => `${d.label} (${d.price ? money(d.price) : 'free'})`).join(' · ')));
        head.append(dl);
        const p = await api('/api/products?store=' + encodeURIComponent(store.id) + '&limit=48');
        grid.replaceChildren();
        if (!p.ok) return grid.append(muted("Could not load this store's items."));
        if (!p.data.products.length) return grid.append(muted('This store has no items yet.'));
        p.data.products.forEach((x) => grid.append(productCard(x)));
    }

    // ==========================================
    // SELL
    // ==========================================
    async function loadMyStore(force) {
        if (myStore !== undefined && !force) return myStore;
        const { ok, data } = await api('/api/store/me');
        myStore = ok ? data.store : undefined;
        return myStore === undefined ? null : myStore;
    }
    App.loadMyStore = loadMyStore;

    async function renderSell() {
        $('sellStoreBox').hidden = true;
        $('sellProductBox').hidden = true;
        const store = await loadMyStore();
        if (currentView !== 'sell') return;
        if (!store) $('sellStoreBox').hidden = false;
        else { $('sellAs').textContent = 'Listing in ' + store.name; $('sellProductBox').hidden = false; }
    }
    $('storeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors($('sellStoreBox'));
        const form = e.currentTarget;
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        const { ok, data } = await api('/api/store', { method: 'POST', body: { name: $('storeName').value, description: $('storeDesc').value } });
        btn.disabled = false;
        if (!ok) return showError($('storeError'), data.message || 'Could not create your store.');
        myStore = data.store;
        form.reset();
        toast('Your store is open! Add your first item, then set up delivery under Inbox → My store.');
        renderSell();
    });

    // Shrinks a photo in the browser so uploads stay small and fast
    function imageToJpeg(source, maxSide, quality, square) {
        return new Promise((resolve, reject) => {
            const url = source instanceof Blob ? URL.createObjectURL(source) : source;
            const img = new Image();
            img.onload = () => {
                let sx = 0, sy = 0, sw = img.width, sh = img.height;
                if (square) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
                const scale = Math.min(1, maxSide / Math.max(sw, sh));
                const c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(sw * scale));
                c.height = Math.max(1, Math.round(sh * scale));
                c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
                if (source instanceof Blob) URL.revokeObjectURL(url);
                let out = '';
                for (const q of [quality, quality - 0.15, quality - 0.3, 0.3]) {
                    out = c.toDataURL('image/jpeg', q);
                    if (out.length * 0.75 < 120 * 1024 || maxSide <= 520) break;
                }
                resolve(out);
            };
            img.onerror = () => { if (source instanceof Blob) URL.revokeObjectURL(url); reject(new Error('unreadable')); };
            img.src = url;
        });
    }
    App.imageToJpeg = imageToJpeg;

    function renderPreviews() {
        const box = $('imagePreview');
        box.replaceChildren();
        sellImages.forEach((src, idx) => {
            const wrap = el('div', 'preview');
            const im = document.createElement('img');
            im.src = src;
            im.alt = 'Photo ' + (idx + 1);
            const rm = el('button');
            rm.type = 'button';
            rm.setAttribute('aria-label', 'Remove photo ' + (idx + 1));
            rm.append(icon('fa-solid fa-xmark'));
            rm.addEventListener('click', () => { sellImages.splice(idx, 1); renderPreviews(); });
            wrap.append(im, rm);
            box.append(wrap);
        });
    }
    $('pImages').addEventListener('change', async (e) => {
        const files = [...e.target.files];
        e.target.value = '';
        for (const f of files) {
            if (sellImages.length >= 4) { toast('You can add up to 4 photos.', true); break; }
            if (!f.type.startsWith('image/')) continue;
            try { sellImages.push(await imageToJpeg(f, 1000, 0.8, false)); } catch { toast(`Could not read "${f.name}". Try a JPG or PNG.`, true); }
        }
        renderPreviews();
    });
    $('productForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors($('sellProductBox'));
        if (!sellImages.length) return showError($('productError'), 'Add at least one photo.');
        const form = e.currentTarget;
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        let thumb;
        try { thumb = await imageToJpeg(sellImages[0], 420, 0.72, false); } catch { thumb = undefined; }
        const { ok, data } = await api('/api/products', {
            method: 'POST',
            body: {
                title: $('pTitle').value, description: $('pDesc').value, price: Number($('pPrice').value), quantity: Number($('pQty').value),
                category: $('pCategory').value, condition: $('pCondition').value, brand: $('pBrand').value, images: sellImages, thumb
            }
        });
        btn.disabled = false;
        if (!ok) return showError($('productError'), data.message || 'Could not publish your listing.');
        form.reset();
        $('pQty').value = 1;
        sellImages = [];
        renderPreviews();
        toast('Your listing is live!');
        refreshMeta();
        location.hash = '#/store/' + myStore.id;
    });

    // ==========================================
    // INBOX (tabs are registered by core and by the feature files)
    // ==========================================
    function registerInboxTab(tab) { App.inboxTabs.push(tab); App.inboxTabs.sort((a, b) => a.order - b.order); }
    App.registerInboxTab = registerInboxTab;

    async function renderInbox() {
        const bar = $('inboxTabs');
        if (!App.inboxTabs.some((t) => t.id === inboxTab)) inboxTab = App.inboxTabs[0].id;
        bar.replaceChildren();
        App.inboxTabs.forEach((t) => {
            const b = el('button', t.id === inboxTab ? 'active' : '', t.label);
            b.type = 'button';
            b.dataset.tab = t.id;
            bar.append(b);
        });
        renderInboxTab();
    }
    async function renderInboxTab() {
        if (!user) return;
        const box = $('inboxContent');
        const tab = inboxTab;
        box.replaceChildren(muted('Loading...'));
        const def = App.inboxTabs.find((t) => t.id === tab);
        let nodes;
        try { nodes = await def.build(); } catch (e) { console.error(e); nodes = [muted('Something went wrong loading this page.')]; }
        if (inboxTab !== tab || currentView !== 'inbox') return;
        box.replaceChildren(...nodes);
    }
    App.renderInboxTab = renderInboxTab;
    $('inboxTabs').addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab]');
        if (!b) return;
        history.replaceState(null, '', '#/inbox/' + b.dataset.tab);
        inboxTab = b.dataset.tab;
        renderInbox();
    });

    registerInboxTab({
        id: 'favourites', label: 'Favourites', order: 20,
        async build() {
            const { ok, data } = await api('/api/favourites');
            if (!ok) return [muted(data.message || 'Could not load your favourites.')];
            favIds = new Set(data.products.map((p) => p.id));
            updateFavUI();
            if (!data.products.length) return [muted('No favourites yet. Tap the heart on a product to save it here.')];
            const grid = el('div', 'grid');
            bindProductGrid(grid);
            data.products.forEach((p) => grid.append(productCard(p, { showStatus: true })));
            return [grid];
        }
    });

    registerInboxTab({
        id: 'messages', label: 'Messages', order: 40,
        async build() {
            const { ok, data } = await api('/api/messages');
            if (!ok) return [muted(data.message || 'Could not load your messages.')];
            if (!data.messages.length) return [muted('No messages yet. When someone writes to you about a listing, it shows up here.')];
            const threads = new Map();
            [...data.messages].reverse().forEach((m) => {
                const other = m.from.id === user.id ? m.to : m.from;
                const key = (m.product ? m.product.id : 'gone') + ':' + other.id;
                if (!threads.has(key)) threads.set(key, { product: m.product, other, msgs: [] });
                threads.get(key).msgs.push(m);
            });
            return [...threads.values()]
                .sort((a, b) => new Date(b.msgs[b.msgs.length - 1].createdAt) - new Date(a.msgs[a.msgs.length - 1].createdAt))
                .map((t) => {
                    const card = el('div', 'thread');
                    const head = el('div', 'thread-head');
                    head.append(el('strong', '', t.product ? t.product.title : 'Removed listing'), el('small', '', 'with ' + t.other.name));
                    const bubbles = el('div', 'bubbles');
                    t.msgs.forEach((m) => bubbles.append(el('div', 'bubble' + (m.from.id === user.id ? ' mine' : ''), m.body)));
                    card.append(head, bubbles);
                    if (t.product) {
                        const form = el('form', 'reply-form');
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.maxLength = 1000;
                        input.placeholder = 'Write a reply...';
                        input.setAttribute('aria-label', 'Reply');
                        const send = el('button', 'btn btn-primary', 'Send');
                        send.type = 'submit';
                        form.append(input, send);
                        form.addEventListener('submit', async (e) => {
                            e.preventDefault();
                            const body = input.value.trim();
                            if (!body) return;
                            send.disabled = true;
                            const r = await api('/api/messages', { method: 'POST', body: { productId: t.product.id, body, to: t.other.id } });
                            send.disabled = false;
                            if (!r.ok) return toast(r.data.message || 'Could not send your reply.', true);
                            renderInboxTab();
                        });
                        card.append(form);
                    }
                    setTimeout(() => { bubbles.scrollTop = bubbles.scrollHeight; }, 0);
                    return card;
                });
        }
    });

    // ==========================================
    // EVENT WIRING (no inline handlers, so the strict CSP stays on)
    // ==========================================
    bindProductGrid($('productGrid'));
    bindProductGrid($('storeProducts'));
    $('cartBtn').addEventListener('click', openCart);
    $('closeCart').addEventListener('click', closeCart);
    $('cartBackdrop').addEventListener('click', closeCart);
    $('accountBtn').addEventListener('click', () => openAuth('login'));
    $('logoutBtn').addEventListener('click', logout);
    $('showLogin').addEventListener('click', () => showAuthView('login'));
    $('showSignup').addEventListener('click', () => showAuthView('signup'));
    $('closeAuth').addEventListener('click', closeAuth);
    $('closeProduct').addEventListener('click', closeProductModal);
    $('authModal').addEventListener('click', (e) => { if (e.target === $('authModal')) closeAuth(); });
    $('productModal').addEventListener('click', (e) => { if (e.target === $('productModal')) closeProductModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (document.querySelector('.lb')) return; // the photo viewer handles its own Escape
        const top = overlayStack[overlayStack.length - 1];
        if (top) return top.dismiss();
        $('profileMenu').hidden = true;
    });

    // ==========================================
    // WHAT THE OTHER FILES CAN USE
    // ==========================================
    Object.assign(App, {
        $, el, icon, muted, button, money, fmtDate, api, toast, showError, clearErrors, modal, avatarEl, imgUrl, thumbUrl, categoryName,
        getUser: () => user, setUser, requireLogin, openAuth, productCard, bindProductGrid, refreshMeta, refreshBadges, route, syncScroll,
        reloadHome: () => loadProducts(true),
        openOverlay, closeAllOverlays,
        // closes any pop-ups first (cleanly, through history), then changes page
        navigate: async (hash) => { await closeAllOverlays(); if (location.hash === hash) route(); else location.hash = hash; },
        getInboxTab: () => inboxTab,
        isCurrentView: (v) => currentView === v,
        cartRender: renderCart
    });

    App.start = async function start() {
        if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
        history.replaceState(null, '', location.href); // forget pop-up steps left over from before a reload
        renderCart();
        const [me] = await Promise.all([api('/api/me'), refreshMeta()]);
        if (me.ok) setUser(me.data.user); else renderUserUI();
        if (user) await loadFavourites();
        route();
    };
})();
