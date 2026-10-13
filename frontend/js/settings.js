// Settings. Every change asks for your password and Face ID first (App.verify.secure).
(() => {
    'use strict';
    const App = window.App;
    const { $, el, icon, button, api, toast, fmtDate, muted, showError, avatarEl } = App;

    const ACTIVITY = {
        identity_verified: 'Identity verified (password + Face ID)', identity_verified_dev_skip: 'Identity verified (password only, development mode)',
        identity_check_wrong_password: 'Wrong password during an identity check', face_id_failed: 'Face ID check failed',
        face_id_device_added: 'Face ID device added', face_id_device_removed: 'Face ID device removed',
        profile_changed: 'Profile changed', contact_changed: 'Contact details changed', bank_account_changed: 'Bank account changed',
        notifications_changed: 'Notification settings changed', privacy_changed: 'Privacy settings changed', password_changed: 'Password changed',
        verified_photo_set: 'Verified profile photo set', photo_changed: 'Profile photo changed (not verified)',
        withdrawal_requested: 'Withdrawal requested', auto_payout_on: 'Automatic payouts turned on', auto_payout_off: 'Automatic payouts turned off'
    };

    function card(title, iconClass, desc) {
        const c = el('section', 'settings-card');
        const h = el('h3');
        h.append(icon(iconClass), document.createTextNode(' ' + title));
        c.append(h);
        if (desc) c.append(el('p', 'muted small', desc));
        return c;
    }
    function inputEl(type, value = '', attrs = {}) {
        const i = document.createElement('input');
        i.type = type; i.value = value == null ? '' : value;
        Object.entries(attrs).forEach(([k, v]) => i.setAttribute(k, v));
        return i;
    }
    function field(label, control, hint) {
        const g = el('div', 'input-group');
        const l = el('label', '', label);
        const f = el('div', 'input-field');
        f.append(control);
        l.htmlFor = control.id = 's' + Math.random().toString(36).slice(2, 8);
        g.append(l, f);
        if (hint) g.append(el('small', 'muted field-hint', hint));
        return g;
    }
    function switchRow(title, desc, checked) {
        const row = el('label', 'switch-row');
        const t = el('span', 'switch-text');
        t.append(el('strong', '', title), el('small', 'muted', desc));
        const i = document.createElement('input');
        i.type = 'checkbox'; i.checked = checked; i.className = 'switch';
        row.append(t, i);
        return { row, input: i };
    }
    function errBox() {
        const e = el('div', 'error-msg');
        e.setAttribute('role', 'alert');
        return e;
    }
    async function refreshUser() {
        const me = await api('/api/me');
        if (me.ok) App.setUser(me.data.user);
    }

    // Verified photo = taken live in the app, right after the Face ID check
    async function livePhotoDialog(reload) {
        const m = App.modal({ title: 'Take a live photo' });
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.isSecureContext) {
            m.body.append(el('p', 'notice warn', 'The camera needs a secure connection (https:// or localhost). Open the site through https to take a verified photo.'));
            return;
        }
        m.body.append(el('p', 'muted', 'Look at the camera in good light. A photo taken live here earns the Verified tick, because it cannot be an old or downloaded picture.'));
        const video = document.createElement('video');
        video.autoplay = true; video.muted = true; video.setAttribute('playsinline', '');
        video.className = 'selfie-video';
        const preview = document.createElement('img');
        preview.className = 'selfie-preview'; preview.hidden = true; preview.alt = 'Your photo';
        const err = errBox();
        const snap = button('Take photo', 'btn btn-primary btn-wide', null, 'fa-solid fa-camera');
        const again = button('Retake', 'btn', null);
        const use = button('Use this photo', 'btn btn-primary', null, 'fa-solid fa-check');
        const row = el('div', 'order-actions'); row.append(again, use); row.hidden = true;
        m.body.append(video, preview, err, snap, row);

        let stream, photo;
        const stop = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
        m.onClose = stop;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
            video.srcObject = stream;
        } catch {
            snap.disabled = true;
            return showError(err, 'Could not open the camera. Allow camera access in your browser and try again.');
        }
        snap.addEventListener('click', () => {
            const size = Math.min(video.videoWidth, video.videoHeight);
            if (!size) return showError(err, 'The camera is still starting. Try again in a second.');
            const c = document.createElement('canvas');
            c.width = c.height = 256;
            c.getContext('2d').drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, 256, 256);
            photo = c.toDataURL('image/jpeg', 0.85);
            preview.src = photo; preview.hidden = false; video.hidden = true; snap.hidden = true; row.hidden = false;
        });
        again.addEventListener('click', () => { preview.hidden = true; video.hidden = false; snap.hidden = false; row.hidden = true; });
        use.addEventListener('click', async () => {
            use.disabled = true;
            const r = await App.verify.secure('PUT', '/api/settings/avatar', { image: photo, live: true }, 'Confirm it is you to set your verified profile photo.');
            use.disabled = false;
            if (r.cancelled) return;
            if (!r.ok) return showError(err, r.data.message || 'Could not save the photo.');
            toast('Your verified profile photo is set.');
            m.close();
            await refreshUser();
            reload();
        });
    }

    async function render() {
        const root = $('settingsRoot');
        root.replaceChildren(muted('Loading your settings...'));
        const { ok, data } = await api('/api/settings');
        if (!ok) return root.replaceChildren(muted(data.message || 'Could not load your settings.'));
        const reload = () => render();
        const user = App.getUser();
        root.replaceChildren();

        // ---- header with the profile picture ----
        const head = el('section', 'settings-card profile-head');
        head.append(avatarEl(data.avatar, user.id, user.fullName, 92));
        const ht = el('div', 'profile-text');
        ht.append(el('h2', '', data.profile.fullName), el('small', 'muted', data.contact.email));
        const chip = el('span', 'verify-chip ' + (data.avatar.verified ? 'yes' : 'no'));
        chip.append(icon('fa-solid ' + (data.avatar.verified ? 'fa-circle-check' : 'fa-circle-exclamation')), document.createTextNode(data.avatar.verified ? ` Verified photo · ${fmtDate(data.avatar.verifiedAt, false)}` : ' Photo not verified'));
        ht.append(chip);
        const photoBtns = el('div', 'order-actions');
        photoBtns.append(button('Take a live photo (verified)', 'btn btn-primary', () => livePhotoDialog(reload), 'fa-solid fa-camera'));
        const pick = el('label', 'btn');
        pick.append(icon('fa-solid fa-image'), document.createTextNode(' Choose a photo'));
        const file = inputEl('file', '', { accept: 'image/*' });
        file.hidden = true;
        pick.append(file);
        file.addEventListener('change', async () => {
            const f = file.files[0];
            file.value = '';
            if (!f) return;
            let img;
            try { img = await App.imageToJpeg(f, 256, 0.85, true); } catch { return toast('Could not read that photo.', true); }
            const r = await App.verify.secure('PUT', '/api/settings/avatar', { image: img, live: false }, 'Confirm it is you to change your profile photo.');
            if (r.cancelled) return;
            if (!r.ok) return toast(r.data.message || 'Could not save the photo.', true);
            toast('Photo saved. Take a live photo to get the Verified tick.');
            await refreshUser();
            reload();
        });
        photoBtns.append(pick);
        ht.append(photoBtns);
        head.append(ht);
        root.append(head);

        // ---- security ----
        const sec = card('Security', 'fa-solid fa-shield-halved', 'Every change below needs your password and Face ID (your phone\u2019s face or fingerprint unlock, or Windows Hello).');
        if (data.devSkip) sec.append(el('p', 'notice warn', 'Development mode: Face ID is switched off on this server, so only your password is checked. Never use this in production.'));
        else if (!App.verify.canFaceId()) sec.append(el('p', 'notice warn', 'You are on an insecure address, so Face ID is unavailable and changes are blocked. Open the site through https (or localhost on a computer).'));
        const devs = el('div', 'device-list');
        if (!data.passkeys.length) devs.append(muted('No Face ID set up yet. Set it up now: you will be asked for your password, then your phone\u2019s face/fingerprint.'));
        data.passkeys.forEach((p) => {
            const row = el('div', 'delivery-row');
            row.append(icon('fa-solid fa-mobile-screen'));
            const t = el('div', 'delivery-info');
            t.append(el('strong', '', p.label), el('small', 'muted', 'Added ' + fmtDate(p.createdAt, false)));
            const del = button('', 'icon-btn', async () => {
                if (!confirm('Remove this device? You will not be able to use it for Face ID checks.')) return;
                const r = await App.verify.secure('DELETE', '/api/security/passkey/' + encodeURIComponent(p.id), undefined, 'Confirm it is you to remove a device.');
                if (r.cancelled) return;
                if (!r.ok) return toast(r.data.message || 'Could not remove the device.', true);
                toast('Device removed.');
                reload();
            });
            del.setAttribute('aria-label', 'Remove ' + p.label);
            del.append(icon('fa-solid fa-trash'));
            row.append(t, del);
            devs.append(row);
        });
        sec.append(devs);
        sec.append(button(data.passkeys.length ? 'Add this device' : 'Set up Face ID', 'btn', async () => {
            const done = data.passkeys.length ? await App.verify.addDevice() : await App.verify.ensure('Set up Face ID: first confirm your password.');
            if (done) { App.verify.forget(); toast('Face ID is ready.'); reload(); }
        }, 'fa-solid fa-face-smile'));
        root.append(sec);

        // ---- profile ----
        const prof = card('Profile', 'fa-solid fa-user');
        const nameI = inputEl('text', data.profile.fullName, { maxlength: 80, autocomplete: 'name' });
        const bioI = document.createElement('textarea'); bioI.maxLength = 160; bioI.rows = 2; bioI.value = data.profile.bio || ''; bioI.placeholder = 'A short line about you or your store';
        const bioWrap = el('div', 'input-group'); const bl = el('label', '', 'About you'); const bf = el('div', 'input-field textarea'); bf.append(bioI); bl.htmlFor = bioI.id = 'bio1'; bioWrap.append(bl, bf);
        const pErr = errBox();
        prof.append(field('Full name', nameI, 'Use your real name. Your bank account holder must match it.'), bioWrap, pErr,
            button('Save profile', 'btn btn-primary', async () => {
                pErr.classList.remove('show');
                if (nameI.value.trim().length < 2) return showError(pErr, 'Enter your full name.');
                const r = await App.verify.secure('PATCH', '/api/settings/profile', { fullName: nameI.value, bio: bioI.value }, 'Confirm it is you to change your profile.');
                if (r.cancelled) return;
                if (!r.ok) return showError(pErr, r.data.message || 'Could not save.');
                toast('Profile saved.'); await refreshUser(); reload();
            }));
        root.append(prof);

        // ---- contact ----
        const con = card('Contact & address', 'fa-solid fa-address-book', 'Used to prefill checkout. Sellers only see your address on orders you place.');
        const a = data.contact.address || {};
        const phone = inputEl('tel', data.contact.phone, { maxlength: 20, inputmode: 'tel', autocomplete: 'tel', placeholder: '082 123 4567' });
        const street = inputEl('text', a.street, { maxlength: 80, autocomplete: 'address-line1' });
        const city = inputEl('text', a.city, { maxlength: 40, autocomplete: 'address-level2' });
        const postal = inputEl('text', a.postalCode, { maxlength: 4, inputmode: 'numeric', autocomplete: 'postal-code' });
        const prov = document.createElement('select');
        prov.append(Object.assign(el('option', '', 'Choose province'), { value: '' }));
        data.provinces.forEach((p) => { const o = el('option', '', p); o.value = p; prov.append(o); });
        prov.value = a.province || '';
        const emailI = inputEl('email', data.contact.email, { disabled: '' });
        const r1 = el('div', 'field-row'); r1.append(field('City / town', city), field('Postal code', postal));
        const cErr = errBox();
        con.append(field('Email', emailI, 'To change your email address, contact support.'), field('Phone', phone), field('Street address', street), r1, field('Province', prov), cErr,
            button('Save contact details', 'btn btn-primary', async () => {
                cErr.classList.remove('show');
                const r = await App.verify.secure('PATCH', '/api/settings/contact', { phone: phone.value, address: { street: street.value, city: city.value, province: prov.value, postalCode: postal.value } }, 'Confirm it is you to change your contact details.');
                if (r.cancelled) return;
                if (!r.ok) return showError(cErr, r.data.message || 'Could not save.');
                toast('Contact details saved.'); reload();
            }));
        root.append(con);

        // ---- bank ----
        const bank = card('Bank account', 'fa-solid fa-building-columns', 'Where withdrawals are paid. The account must be in your own name. For your safety, withdrawals pause for 24 hours after any change.');
        if (data.bank) bank.append(el('p', 'bank-line', `Current: ${data.bank.bankName} (${data.bank.accountType}) ending ${data.bank.last4}`));
        const bankSel = document.createElement('select');
        bankSel.append(Object.assign(el('option', '', 'Choose your bank'), { value: '' }));
        data.banks.forEach((b) => { const o = el('option', '', b); o.value = b; bankSel.append(o); });
        bankSel.value = data.bank ? data.bank.bankName : '';
        const typeSel = document.createElement('select');
        data.accountTypes.forEach((t) => { const o = el('option', '', t[0].toUpperCase() + t.slice(1)); o.value = t; typeSel.append(o); });
        typeSel.value = data.bank ? data.bank.accountType : 'cheque';
        const holder = inputEl('text', data.profile.fullName, { maxlength: 80 });
        const acc = inputEl('text', '', { inputmode: 'numeric', maxlength: 16, autocomplete: 'off', placeholder: data.bank ? `Enter the full number again (ending ${data.bank.last4})` : 'Account number' });
        const branch = inputEl('text', data.bank ? data.bank.branchCode : '', { inputmode: 'numeric', maxlength: 6, autocomplete: 'off', placeholder: '6 digits' });
        const bErr = errBox();
        const r2 = el('div', 'field-row'); r2.append(field('Account type', typeSel), field('Branch code', branch));
        bank.append(field('Bank', bankSel), field('Account holder', holder, 'Must match your profile name.'), field('Account number', acc), r2, bErr,
            button(data.bank ? 'Change bank account' : 'Save bank account', 'btn btn-primary', async () => {
                bErr.classList.remove('show');
                const r = await App.verify.secure('PUT', '/api/settings/bank', { bankName: bankSel.value, accountHolder: holder.value, accountType: typeSel.value, accountNumber: acc.value, branchCode: branch.value }, 'Confirm it is you to change your bank account.');
                if (r.cancelled) return;
                if (!r.ok) return showError(bErr, r.data.message || 'Could not save.');
                toast('Bank account saved. Withdrawals unlock in 24 hours.'); reload();
            }));
        root.append(bank);

        // ---- notifications ----
        const nCard = card('Notifications', 'fa-solid fa-bell', 'Choose what shows up in your Inbox and red dots.');
        const n = data.notifications;
        const sw = {
            offers: switchRow('Offers', 'Offers on your items and special prices from sellers', n.offers !== false),
            messages: switchRow('Messages', 'Questions from buyers and replies from sellers', n.messages !== false),
            orders: switchRow('Orders', 'New orders and delivery progress', n.orders !== false),
            promotions: switchRow('Promotions', 'News and deals from Mandla\u2019s Tech...', !!n.promotions)
        };
        Object.values(sw).forEach((s) => nCard.append(s.row));
        const nErr = errBox();
        nCard.append(nErr, button('Save notification settings', 'btn btn-primary', async () => {
            nErr.classList.remove('show');
            const r = await App.verify.secure('PATCH', '/api/settings/notifications', Object.fromEntries(Object.entries(sw).map(([k, v]) => [k, v.input.checked])), 'Confirm it is you to change notification settings.');
            if (r.cancelled) return;
            if (!r.ok) return showError(nErr, r.data.message || 'Could not save.');
            toast('Notification settings saved.'); reload();
        }));
        root.append(nCard);

        // ---- privacy ----
        const prCard = card('Privacy', 'fa-solid fa-user-shield', 'Control who can reach you and how your name appears.');
        const pv = data.privacy;
        const ps = {
            allowOffers: switchRow('Receive special offers', 'Sellers can send you a special price on items you saved', pv.allowOffers !== false),
            allowMessages: switchRow('Allow messages', 'Buyers can message you about your listings', pv.allowMessages !== false),
            showFullName: switchRow('Show my full name', 'Off = others see "Mandla K." instead of your full name', !!pv.showFullName)
        };
        Object.values(ps).forEach((s) => prCard.append(s.row));
        const prErr = errBox();
        prCard.append(prErr, button('Save privacy settings', 'btn btn-primary', async () => {
            prErr.classList.remove('show');
            const r = await App.verify.secure('PATCH', '/api/settings/privacy', Object.fromEntries(Object.entries(ps).map(([k, v]) => [k, v.input.checked])), 'Confirm it is you to change privacy settings.');
            if (r.cancelled) return;
            if (!r.ok) return showError(prErr, r.data.message || 'Could not save.');
            toast('Privacy settings saved.'); reload();
        }));
        root.append(prCard);

        // ---- password ----
        const pw = card('Password', 'fa-solid fa-key');
        const pw1 = inputEl('password', '', { autocomplete: 'new-password', minlength: 8, maxlength: 72 });
        const pw2 = inputEl('password', '', { autocomplete: 'new-password', maxlength: 72 });
        const wErr = errBox();
        pw.append(field('New password', pw1, 'At least 8 characters.'), field('Repeat new password', pw2), wErr,
            button('Change password', 'btn btn-primary', async () => {
                wErr.classList.remove('show');
                if (pw1.value.length < 8) return showError(wErr, 'The new password must be at least 8 characters.');
                if (pw1.value !== pw2.value) return showError(wErr, 'The two passwords do not match.');
                const r = await App.verify.secure('PUT', '/api/settings/password', { newPassword: pw1.value }, 'Confirm it is you to change your password.');
                if (r.cancelled) return;
                if (!r.ok) return showError(wErr, r.data.message || 'Could not change the password.');
                pw1.value = pw2.value = '';
                toast('Password changed.');
            }));
        root.append(pw);

        // ---- activity ----
        const act = card('Recent security activity', 'fa-solid fa-clock-rotate-left');
        if (!data.activity.length) act.append(muted('Nothing yet.'));
        data.activity.forEach((x) => {
            const row = el('div', 'tx-row');
            row.append(el('span', '', ACTIVITY[x.action] || x.action), el('small', 'muted', fmtDate(x.at)));
            act.append(row);
        });
        root.append(act);
    }
    App.views.settings = render;
})();
