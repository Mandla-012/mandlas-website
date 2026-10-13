// Full-screen photo viewer: swipe between photos, pinch or double-tap to zoom, drag to look around.
// Works with a finger on a phone and with mouse wheel / arrow keys on a computer.
(() => {
    'use strict';

    const MAX_ZOOM = 5;
    let root, track, slides, counter, urls, idx, vw, vh, closing, overlay;
    let s = 1, x = 0, y = 0;            // zoom and position of the current photo
    const pointers = new Map();
    let pinch = null, drag = null, swipe = null, lastTap = { t: 0, x: 0, y: 0 };

    const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const current = () => slides[idx].img;

    function limits() {
        if (!vw || !vh) return { mx: 0, my: 0 };
        const im = current();
        const nw = im.naturalWidth || vw, nh = im.naturalHeight || vh;
        const fit = Math.min(vw / nw, vh / nh);
        return { mx: Math.max(0, (nw * fit * s - vw) / 2), my: Math.max(0, (nh * fit * s - vh) / 2) };
    }
    function applyPhoto(animate) {
        const l = limits();
        x = clamp(x, -l.mx, l.mx);
        y = clamp(y, -l.my, l.my);
        const im = current();
        im.style.transition = animate ? 'transform .2s ease' : 'none';
        im.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    }
    function applyTrack(dx, animate) {
        track.style.transition = animate ? 'transform .25s ease' : 'none';
        track.style.transform = `translate3d(${-idx * vw + dx}px, 0, 0)`;
    }
    function resetPhoto(i) {
        const im = slides[i].img;
        im.style.transition = 'none';
        im.style.transform = 'translate3d(0,0,0) scale(1)';
    }
    function go(n, animate = true) {
        const next = clamp(n, 0, urls.length - 1);
        if (next !== idx) { resetPhoto(idx); idx = next; }
        s = 1; x = 0; y = 0;
        applyTrack(0, animate);
        counter.textContent = `${idx + 1} / ${urls.length}`;
        root.classList.toggle('single', urls.length === 1);
    }
    // zoom to a new level while keeping the point (px, py) steady under the finger
    function zoomAt(newScale, px, py, animate) {
        const ns = clamp(newScale, 1, MAX_ZOOM);
        const cx = px - vw / 2, cy = py - vh / 2;
        x = cx - (cx - x) * (ns / s);
        y = cy - (cy - y) * (ns / s);
        s = ns;
        if (s === 1) { x = 0; y = 0; }
        applyPhoto(animate);
        root.classList.toggle('zoomed', s > 1.02);
    }

    function down(e) {
        if (e.target.closest('.lb-btn')) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { root.setPointerCapture(e.pointerId); } catch { /* not supported everywhere */ }
        if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s, x, y };
            swipe = null; drag = null;
        } else if (pointers.size === 1) {
            if (s > 1.02) drag = { sx: e.clientX, sy: e.clientY, x, y };
            else swipe = { sx: e.clientX, sy: e.clientY, t: Date.now(), dx: 0, dy: 0, dir: '' };
            lastMoved = false;
        }
    }
    let lastMoved = false;
    function move(e) {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2 && pinch) {
            const [a, b] = [...pointers.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            const ns = clamp(pinch.s * (dist / pinch.dist), 1, MAX_ZOOM);
            const cx = pinch.mx - vw / 2, cy = pinch.my - vh / 2;
            x = (mx - vw / 2) - (cx - pinch.x) * (ns / pinch.s);
            y = (my - vh / 2) - (cy - pinch.y) * (ns / pinch.s);
            s = ns;
            applyPhoto(false);
            root.classList.toggle('zoomed', s > 1.02);
            lastMoved = true;
        } else if (drag) {
            x = drag.x + (e.clientX - drag.sx);
            y = drag.y + (e.clientY - drag.sy);
            applyPhoto(false);
            if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 8) lastMoved = true;
        } else if (swipe) {
            swipe.dx = e.clientX - swipe.sx;
            swipe.dy = e.clientY - swipe.sy;
            if (!swipe.dir && Math.hypot(swipe.dx, swipe.dy) > 10) swipe.dir = Math.abs(swipe.dx) > Math.abs(swipe.dy) ? 'h' : 'v';
            if (swipe.dir === 'h') {
                // a little resistance at the first and last photo
                const edge = (idx === 0 && swipe.dx > 0) || (idx === urls.length - 1 && swipe.dx < 0);
                applyTrack(edge ? swipe.dx / 3 : swipe.dx, false);
                lastMoved = true;
            } else if (swipe.dir === 'v') {
                current().style.transition = 'none';
                current().style.transform = `translate3d(0, ${swipe.dy}px, 0) scale(1)`;
                root.style.background = `rgba(0,0,0,${clamp(0.95 - Math.abs(swipe.dy) / 600, 0.35, 0.95)})`;
                lastMoved = true;
            }
        }
    }
    function up(e) {
        const had = pointers.has(e.pointerId);
        pointers.delete(e.pointerId);
        if (!had) return;
        if (pinch && pointers.size < 2) {
            pinch = null;
            if (s < 1.05) { s = 1; x = 0; y = 0; applyPhoto(true); root.classList.remove('zoomed'); }
            const rest = [...pointers.values()][0];
            if (rest && s > 1.02) drag = { sx: rest.x, sy: rest.y, x, y };
            return;
        }
        let wasTap = false;
        if (drag) {
            wasTap = !lastMoved; // a finger that did not move while zoomed in is a tap, not a pan
            drag = null;
        } else if (swipe) {
            const { dx, dy, dir, t } = swipe;
            swipe = null;
            const fast = Date.now() - t < 280;
            if (dir === 'h') {
                if (dx < -vw * 0.18 || (fast && dx < -40)) go(idx + 1);
                else if (dx > vw * 0.18 || (fast && dx > 40)) go(idx - 1);
                else applyTrack(0, true);
                return;
            }
            if (dir === 'v') {
                if (Math.abs(dy) > 110) return close();
                resetPhoto(idx);
                current().style.transition = 'transform .2s ease';
                root.style.background = '';
                return;
            }
            wasTap = true;
        } else {
            return;
        }
        if (!wasTap) return;
        // Two quick taps zoom in and out
        const now = Date.now();
        if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
            lastTap.t = 0;
            if (s > 1.02) zoomAt(1, e.clientX, e.clientY, true); else zoomAt(2.6, e.clientX, e.clientY, true);
        } else {
            lastTap = { t: now, x: e.clientX, y: e.clientY };
        }
    }
    function wheel(e) {
        e.preventDefault();
        zoomAt(s * (e.deltaY < 0 ? 1.18 : 0.85), e.clientX, e.clientY, false);
    }
    function key(e) {
        if (!root) return;
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
        else if (e.key === 'ArrowRight') go(idx + 1);
        else if (e.key === 'ArrowLeft') go(idx - 1);
        else if (e.key === '+' || e.key === '=') zoomAt(s * 1.4, vw / 2, vh / 2, true);
        else if (e.key === '-') zoomAt(s / 1.4, vw / 2, vh / 2, true);
    }
    function resize() {
        if (!root) return;
        vw = root.clientWidth; vh = root.clientHeight;
        slides.forEach((sl) => { sl.box.style.width = vw + 'px'; });
        track.style.width = vw * urls.length + 'px';
        applyTrack(0, false);
        applyPhoto(false);
    }

    function open(list, start = 0, title = 'Photos') {
        if (root) close();
        urls = list; idx = clamp(start, 0, list.length - 1); closing = false; s = 1; x = 0; y = 0;
        root = el('div', 'lb');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', title);
        track = el('div', 'lb-track');
        slides = urls.map((u, i) => {
            const box = el('div', 'lb-slide');
            const img = el('img', 'lb-img');
            img.src = u; img.alt = `${title}, photo ${i + 1}`; img.draggable = false; img.decoding = 'async';
            img.addEventListener('load', () => { if (i === idx) applyPhoto(false); });
            box.append(img);
            track.append(box);
            return { box, img };
        });
        const bar = el('div', 'lb-bar');
        counter = el('span', 'lb-count');
        const closeBtn = el('button', 'lb-btn lb-close');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close photo viewer');
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', close);
        bar.append(counter, closeBtn);
        const prev = el('button', 'lb-btn lb-prev'); prev.type = 'button'; prev.textContent = '‹'; prev.setAttribute('aria-label', 'Previous photo');
        const next = el('button', 'lb-btn lb-next'); next.type = 'button'; next.textContent = '›'; next.setAttribute('aria-label', 'Next photo');
        prev.addEventListener('click', () => go(idx - 1));
        next.addEventListener('click', () => go(idx + 1));
        const hint = el('div', 'lb-hint');
        hint.textContent = 'Pinch or double-tap to zoom · swipe for more photos';
        root.append(track, bar, prev, next, hint);
        document.body.append(root);
        document.body.classList.add('no-scroll');
        overlay = window.App && window.App.openOverlay ? window.App.openOverlay(destroy) : null;

        root.addEventListener('pointerdown', down);
        root.addEventListener('pointermove', move);
        root.addEventListener('pointerup', up);
        root.addEventListener('pointercancel', up);
        root.addEventListener('wheel', wheel, { passive: false });
        window.addEventListener('keydown', key, true);
        window.addEventListener('resize', resize);
        resize();
        go(idx, false);
        closeBtn.focus();
        setTimeout(() => { hint.classList.add('fade'); }, 2800);
    }

    // Close through history (so Back and the close button agree)
    function close() {
        if (!root || closing) return;
        if (overlay && !overlay.done) overlay.dismiss(); else destroy();
    }
    function destroy() {
        if (!root || closing) return;
        closing = true;
        window.removeEventListener('keydown', key, true);
        window.removeEventListener('resize', resize);
        root.remove();
        root = null;
        pointers.clear(); pinch = drag = swipe = null;
        if (window.App) window.App.syncScroll();
        else document.body.classList.remove('no-scroll');
    }

    window.Lightbox = { open, close };
})();
