/**
 * StoreOps sign-in helper, shared by pages that call signed-in endpoints.
 * Keeps the session in sessionStorage and exposes window.StoreOpsAuth:
 *   mount(el)       render the sign-in form / "Signed in as" bar into el
 *   user            the signed-in staff member, or null
 *   onChange(fn)    called now and whenever the user signs in or out
 *   fetch(url, opt) fetch with the bearer token; a 401 signs the user out
 */
(function () {
  'use strict';

  const KEY = 'storeops.session';
  const listeners = [];
  const mounts = [];

  function load() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (saved && Date.parse(saved.token.expiresAt) > Date.now()) return saved;
    } catch {
      /* storage unavailable or corrupt */
    }
    return null;
  }

  let session = load();

  function save(next) {
    session = next;
    try {
      if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
      else sessionStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: session lasts for this page only */
    }
    mounts.forEach(render);
    listeners.forEach((fn) => fn(session ? session.user : null));
  }

  function el(tag, props, children) {
    const node = Object.assign(document.createElement(tag), props || {});
    (children || []).forEach((child) => node.append(child));
    return node;
  }

  function render(container) {
    container.replaceChildren();
    if (session) {
      const { profile, storeId, role } = session.user;
      const signOut = el('button', { type: 'button', className: 'linklike', textContent: 'Sign out' });
      signOut.addEventListener('click', () => auth.logout());
      container.append(
        el('div', { className: 'auth-bar' }, [
          el('span', { textContent: `Signed in as ${profile.firstName} ${profile.lastName} · ${storeId} · ${role}` }),
          signOut,
        ]),
      );
      return;
    }

    const email = el('input', { type: 'email', name: 'email', placeholder: 'name@storeops.example', required: true, autocomplete: 'username' });
    const password = el('input', { type: 'password', name: 'password', placeholder: 'Password', required: true, autocomplete: 'current-password' });
    const error = el('div', { className: 'field-error', hidden: true });
    const button = el('button', { type: 'submit', className: 'btn', textContent: 'Sign in' });
    const form = el('form', { className: 'auth-form card' }, [
      el('strong', { textContent: 'Sign in to continue' }),
      el('div', { className: 'auth-fields' }, [email, password, button]),
      el('div', { className: 'hint', textContent: 'Demo accounts use the password StoreOps@123, e.g. priya.nair@storeops.example (store manager).' }),
      error,
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.hidden = true;
      button.disabled = true;
      try {
        await auth.login(email.value.trim(), password.value);
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      } finally {
        button.disabled = false;
      }
    });
    container.append(form);
  }

  const auth = {
    get user() {
      return session ? session.user : null;
    },

    mount(container) {
      mounts.push(container);
      render(container);
    },

    onChange(fn) {
      listeners.push(fn);
      fn(auth.user);
    },

    async login(email, password) {
      const res = await fetch('/api/staff/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ? body.error.message : `Sign-in failed (${res.status})`);
      save(body);
    },

    async logout() {
      if (session) {
        await fetch('/api/staff/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token.token}` },
        }).catch(() => undefined);
      }
      save(null);
    },

    async fetch(url, options) {
      const opts = Object.assign({}, options);
      opts.headers = Object.assign({}, opts.headers, session ? { Authorization: `Bearer ${session.token.token}` } : {});
      const res = await fetch(url, opts);
      if (res.status === 401) save(null);
      return res;
    },
  };

  window.StoreOpsAuth = auth;
})();
