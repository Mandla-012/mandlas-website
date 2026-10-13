// "Verify it's you": your password, then Face ID (the phone's face/fingerprint unlock or Windows Hello).
// Anything that changes settings or moves money goes through App.secure(), which asks for this first.
(() => {
    'use strict';
    const App = window.App;
    const { el, icon, button, api, toast, showError } = App;

    // ---- base64url helpers for WebAuthn ----
    const toBuf = (s) => {
        const pad = '='.repeat((4 - (s.length % 4)) % 4);
        const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
        return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
    };
    const toB64u = (buf) => {
        const b = new Uint8Array(buf);
        let bin = '';
        b.forEach((c) => { bin += String.fromCharCode(c); });
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const canFaceId = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);

    function prepareRegistration(o) {
        o.challenge = toBuf(o.challenge);
        o.user.id = toBuf(o.user.id);
        (o.excludeCredentials || []).forEach((c) => { c.id = toBuf(c.id); });
        return o;
    }
    function prepareAuth(o) {
        o.challenge = toBuf(o.challenge);
        (o.allowCredentials || []).forEach((c) => { c.id = toBuf(c.id); });
        return o;
    }
    const serializeAuth = (c) => ({
        id: c.id, rawId: toB64u(c.rawId), type: c.type, authenticatorAttachment: c.authenticatorAttachment,
        clientExtensionResults: c.getClientExtensionResults ? c.getClientExtensionResults() : {},
        response: { clientDataJSON: toB64u(c.response.clientDataJSON), authenticatorData: toB64u(c.response.authenticatorData), signature: toB64u(c.response.signature), userHandle: c.response.userHandle ? toB64u(c.response.userHandle) : undefined }
    });
    const serializeReg = (c) => ({
        id: c.id, rawId: toB64u(c.rawId), type: c.type, authenticatorAttachment: c.authenticatorAttachment,
        clientExtensionResults: c.getClientExtensionResults ? c.getClientExtensionResults() : {},
        response: { clientDataJSON: toB64u(c.response.clientDataJSON), attestationObject: toB64u(c.response.attestationObject), transports: c.response.getTransports ? c.response.getTransports() : [] }
    });
    const faceIdError = (e) => (e && e.name === 'NotAllowedError' ? 'Face ID was cancelled or timed out. Try again.' : (e && e.message) || 'Face ID did not work.');

    // A successful check stays valid for ~3 minutes and is used up by the first change that goes through.
    let ticketAt = 0;
    const ticketFresh = () => Date.now() - ticketAt < 170000;

    // Shows the verification window. Resolves true when the person is verified, false if they cancel.
    function ensure(reason = 'To protect your account, confirm it is really you.') {
        if (ticketFresh()) return Promise.resolve(true);
        return new Promise(async (resolve) => {
            let status = { devSkip: false, hasPasskey: false };
            const st = await api('/api/security/status');
            if (st.ok) status = st.data;

            const m = App.modal({ title: 'Verify it\u2019s you' });
            let done = false;
            const finish = async (ok) => { if (done) return; done = true; if (ok) ticketAt = Date.now(); await m.close(); resolve(ok); };
            m.onClose = () => { if (!done) { done = true; resolve(false); } };

            const body = m.body;
            body.append(el('p', 'muted', reason));
            const secureWarning = !status.devSkip && !canFaceId();
            if (secureWarning) {
                const w = el('div', 'notice warn');
                w.append(icon('fa-solid fa-triangle-exclamation'), document.createTextNode(' Face ID only works on a secure connection (https:// or localhost). You are on an insecure address, so changes are blocked for your safety. Open the site through https, or see the notes about testing on your phone.'));
                body.append(w);
                return;
            }
            const stepPw = el('div', 'verify-step');
            const pwLabel = el('label', '', 'Step 1 · Your password');
            pwLabel.htmlFor = 'verifyPw';
            const pw = document.createElement('input');
            pw.type = 'password'; pw.id = 'verifyPw'; pw.autocomplete = 'current-password'; pw.className = 'verify-input'; pw.placeholder = 'Enter your password';
            const err = el('div', 'error-msg');
            err.setAttribute('role', 'alert');
            const go = button(status.devSkip ? 'Verify' : 'Continue to Face ID', 'btn btn-primary btn-wide', null, status.devSkip ? 'fa-solid fa-lock' : 'fa-solid fa-face-smile');
            stepPw.append(pwLabel, pw, err, go);
            if (status.devSkip) stepPw.append(el('p', 'muted small', 'Development mode: Face ID is switched off on this server.'));
            else if (!status.hasPasskey) stepPw.append(el('p', 'muted small', 'You have not set up Face ID yet. After your password we will set it up on this device.'));
            body.append(stepPw);
            setTimeout(() => pw.focus(), 80);

            async function enrol() {
                const label = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android phone' : /Windows/.test(navigator.userAgent) ? 'Windows PC' : 'This device';
                const o = await api('/api/security/passkey/register-options', { method: 'POST', body: {} });
                if (!o.ok) throw new Error(o.data.message || 'Could not start Face ID setup.');
                const cred = await navigator.credentials.create({ publicKey: prepareRegistration(o.data.options) });
                const v = await api('/api/security/passkey/register-verify', { method: 'POST', body: { response: serializeReg(cred), label } });
                if (!v.ok) throw new Error(v.data.message || 'Could not save Face ID.');
                toast('Face ID is set up on this device.');
            }
            async function runCheck() {
                const r = await api('/api/security/verify/password', { method: 'POST', body: { password: pw.value } });
                if (!r.ok) throw new Error(r.data.message || 'Could not verify your password.');
                if (r.data.devSkipped) return true;
                if (!r.data.hasPasskey) {
                    status.hasPasskey = true;
                    go.textContent = 'Setting up Face ID...';
                    await enrol();
                    return runCheck(); // password again behind the scenes to run the full check
                }
                const cred = await navigator.credentials.get({ publicKey: prepareAuth(r.data.options) });
                const v = await api('/api/security/verify/passkey', { method: 'POST', body: { response: serializeAuth(cred) } });
                if (!v.ok) throw new Error(v.data.message || 'Face ID could not be verified.');
                return true;
            }
            async function start() {
                err.classList.remove('show');
                if (!pw.value) return showError(err, 'Enter your password.');
                go.disabled = true; pw.disabled = true;
                const label = go.textContent;
                go.textContent = status.devSkip ? 'Checking...' : 'Waiting for Face ID...';
                try {
                    await runCheck();
                    finish(true);
                } catch (e) {
                    showError(err, faceIdError(e));
                    go.disabled = false; pw.disabled = false; go.textContent = label;
                    if (e && e.message && /password/i.test(e.message)) pw.select();
                }
            }
            go.addEventListener('click', start);
            pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
        });
    }

    // Verify, send, and re-verify once if the ticket had expired.
    async function secure(method, path, body, reason) {
        for (let attempt = 0; attempt < 2; attempt++) {
            if (!(await ensure(reason))) return { cancelled: true, ok: false, status: 0, data: {} };
            const r = await api(path, { method, body });
            if (r.status === 200 || r.status === 201 || r.status === 403) ticketAt = 0; // used up (or rejected)
            if (r.status === 403 && r.data.code === 'STEP_UP_REQUIRED') { ticketAt = 0; continue; }
            return r;
        }
        return { ok: false, status: 403, data: { message: 'Verification expired. Please try again.' } };
    }

    // Adds this phone / computer as a Face ID device (needs the full password + Face ID check first)
    async function addDevice() {
        if (!(await ensure('Confirm it is really you before adding a new device.'))) return false;
        try {
            const label = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android phone' : /Windows/.test(navigator.userAgent) ? 'Windows PC' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'This device';
            const o = await api('/api/security/passkey/register-options', { method: 'POST', body: {} });
            if (!o.ok) throw new Error(o.data.message || 'Could not start Face ID setup.');
            const cred = await navigator.credentials.create({ publicKey: prepareRegistration(o.data.options) });
            const v = await api('/api/security/passkey/register-verify', { method: 'POST', body: { response: serializeReg(cred), label } });
            ticketAt = 0;
            if (!v.ok) throw new Error(v.data.message || 'Could not save Face ID.');
            return true;
        } catch (e) {
            ticketAt = 0;
            toast(faceIdError(e), true);
            return false;
        }
    }

    App.verify = { ensure, secure, addDevice, canFaceId, forget: () => { ticketAt = 0; } };
})();
