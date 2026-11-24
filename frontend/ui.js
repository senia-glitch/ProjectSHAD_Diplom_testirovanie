'use strict';
/* Общие помощники интерфейса: элементы, значки, уведомления, API, перетаскивание. */

function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('aria-')) { node.setAttribute(k, String(v)); continue; }
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v; // только константы-иконки и очищенный сервером HTML
    else if (k === 'value') node.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') node[k] = !!v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

const _svg = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICONS = {
  user: _svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  post: _svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>'),
  layers: _svg('<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>'),
  flag: _svg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>'),
  edit: _svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  plus: _svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>'),
  eye: _svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  logout: _svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  sun: _svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: _svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  trash: _svg('<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  check: _svg('<path d="M20 6L9 17l-5-5"/>'),
  open: _svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/>'),
  x: _svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  add: _svg('<path d="M12 5v14M5 12h14"/>'),
  up: _svg('<path d="M18 15l-6-6-6 6"/>'),
  down: _svg('<path d="M6 9l6 6 6-6"/>'),
  left: _svg('<path d="M15 18l-6-6 6-6"/>'),
  right: _svg('<path d="M9 18l6-6-6-6"/>'),
  copy: _svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  grip: _svg('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>'),
  key: _svg('<path d="M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>'),
  chart: _svg('<path d="M18 20V10M12 20V4M6 20v-6"/>'),
};
const icon = (name) => el('span', { class: 'icon', 'data-icon': name, html: ICONS[name] || '' });

function ibtn({ icon: name, tip, onclick, danger = false, on = false, bordered = false, href, disabled = false }) {
  const props = { class: `ibtn${danger ? ' danger' : ''}${on ? ' on' : ''}${bordered ? ' bordered' : ''}`, 'data-tip': tip, 'aria-label': tip };
  if (href) return el('a', { ...props, href }, icon(name));
  return el('button', { ...props, type: 'button', onclick, disabled }, icon(name));
}

function toast(message, kind = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = el('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
  const t = el('div', { class: `toast ${kind}`, text: message });
  box.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 6000 : 3500);
}

/* ---------- API ---------- */
const auth = {
  get token() { try { return localStorage.getItem('token') || ''; } catch { return ''; } },
  set token(v) { try { v ? localStorage.setItem('token', v) : localStorage.removeItem('token'); } catch {} },
  user: null,
};

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (auth.token) headers.Authorization = 'Bearer ' + auth.token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch('/api/v1' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('Сервер недоступен. Проверьте подключение', 0);
  }
  if (response.status === 204) return null;
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    let message = data?.error?.message || 'Запрос не выполнен';
    if (response.status === 422 && Array.isArray(data?.error?.details) && message === 'Validation failed') {
      message = 'Проверьте поля: ' + data.error.details.map(d => (d.msg || '').replace(/^Value error, /, '')).filter(Boolean).slice(0, 3).join('; ');
    }
    if (response.status === 401 && auth.token) { auth.token = ''; auth.user = null; setTimeout(() => (location.hash = '#/login'), 0); }
    throw new ApiError(message, response.status);
  }
  return data;
}

/* ---------- перетаскивание указателем (мышь, касание) с запасным выбором кликом ---------- */
/* Источник: dragSource(el, payload, ctx). Цель: dropTarget(el, key, ctx). ctx.onDrop(key, payload). */
function dndContext(onDrop) {
  const ctx = { onDrop, picked: null };
  ctx.pick = (payload, node) => {
    document.querySelectorAll('.dnd-picked').forEach(n => n.classList.remove('dnd-picked'));
    if (ctx.picked && ctx.picked.payload === payload) { ctx.picked = null; return; }
    ctx.picked = { payload, node };
    node.classList.add('dnd-picked');
  };
  return ctx;
}

function dragSource(node, payload, ctx) {
  node.classList.add('dnd-source');
  node.tabIndex = 0;
  node.setAttribute('role', 'button');
  node.setAttribute('aria-label', (node.textContent || '').trim() + ': выбрать для переноса');
  let start = null, ghost = null, moved = false;
  node.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY }; moved = false;
    node.setPointerCapture(e.pointerId);
  });
  node.addEventListener('pointermove', (e) => {
    if (!start) return;
    if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
    if (!moved) {
      moved = true;
      ghost = node.cloneNode(true);
      ghost.classList.add('dnd-ghost');
      ghost.style.width = node.offsetWidth + 'px';
      document.body.append(ghost);
      node.classList.add('dnd-dragging');
    }
    ghost.style.left = e.clientX - node.offsetWidth / 2 + 'px';
    ghost.style.top = e.clientY - 16 + 'px';
    document.querySelectorAll('.dnd-over').forEach(n => n.classList.remove('dnd-over'));
    const t = targetAt(e.clientX, e.clientY, ghost);
    if (t) t.classList.add('dnd-over');
  });
  const finish = (e) => {
    if (!start) return;
    start = null;
    document.querySelectorAll('.dnd-over').forEach(n => n.classList.remove('dnd-over'));
    node.classList.remove('dnd-dragging');
    if (moved) {
      const t = targetAt(e.clientX, e.clientY, ghost);
      ghost?.remove(); ghost = null;
      if (t && t._dndCtx === ctx) { ctx.picked = null; ctx.onDrop(t._dndKey, payload); }
    } else ctx.pick(payload, node);
  };
  node.addEventListener('pointerup', finish);
  node.addEventListener('pointercancel', () => { start = null; ghost?.remove(); ghost = null; node.classList.remove('dnd-dragging'); });
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.pick(payload, node); } });
}

function targetAt(x, y, ghost) {
  if (ghost) ghost.style.display = 'none';
  const hit = document.elementFromPoint(x, y);
  if (ghost) ghost.style.display = '';
  return hit ? hit.closest('[data-drop]') : null;
}

function dropTarget(node, key, ctx) {
  node.setAttribute('data-drop', '');
  node._dndKey = key; node._dndCtx = ctx;
  node.addEventListener('click', (e) => {
    if (!ctx.picked || e.target.closest('.dnd-source') && e.target.closest('.dnd-source') !== node) return;
    const payload = ctx.picked.payload; ctx.picked = null;
    ctx.onDrop(key, payload);
  });
}

/* Сортируемый список: перетаскивание элемента за ручку. onChange(newOrderIds). */
function sortable(list, axis, onChange) {
  let dragging = null;
  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-handle]');
    if (!handle || !list.contains(handle) || e.button !== 0) return;
    dragging = handle.closest('[data-id]');
    dragging.classList.add('dnd-dragging');
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  list.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const items = [...list.children].filter(n => n !== dragging);
    const pos = axis === 'x' ? e.clientX : e.clientY;
    let before = null;
    for (const item of items) {
      const r = item.getBoundingClientRect();
      const mid = axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2;
      if (axis === 'x' && (e.clientY < r.top || e.clientY > r.bottom)) continue;
      if (pos < mid) { before = item; break; }
    }
    if (before !== dragging.nextSibling) list.insertBefore(dragging, before);
  });
  const end = () => {
    if (!dragging) return;
    dragging.classList.remove('dnd-dragging'); dragging = null;
    onChange([...list.children].map(n => n.dataset.id));
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
}

const GRADES = ['удовлетворительно', 'хорошо', 'замечательно'];
function gradePill(grade, fallback = 'нет оценки') {
  const cls = { 'удовлетворительно': 'pill-amber', 'хорошо': 'pill-blue', 'замечательно': 'pill-green' }[grade] || 'pill-gray';
  return el('span', { class: `pill ${cls}`, text: grade || fallback });
}
function fmtDate(value) {
  try { return new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return value; }
}
function fmtNum(n) { return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100); }
