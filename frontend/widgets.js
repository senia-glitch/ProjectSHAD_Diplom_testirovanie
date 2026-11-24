'use strict';
/* Отображение заданий ученику. renderTask(task, {value, onChange, readonly}) → элемент.
   Ответ ученика — объект; формат совпадает с проверкой на сервере (app/scenarios/tasks.py). */

const KIND_NAMES = {
  choice: 'Выбор ответа', matching: 'Сопоставление', fill: 'Заполнение полей', open: 'Свободный ответ',
  ordering: 'Упорядочивание', categorize: 'Классификация', selection: 'Выделение и обозначение',
  connecting: 'Соединение элементов', editing: 'Редактирование и исправление',
};
const VARIANT_NAMES = {
  choice: { single: 'Одиночный выбор', multiple: 'Множественный выбор', binary: 'Бинарный выбор', dropdown: 'Выпадающий список', multi_dropdown: 'Множественный выпадающий список' },
  matching: { columns: 'Две колонки', dropdown: 'Через выпадающие списки', drag: 'Перетаскиванием', lines: 'Соединительными линиями', multi: 'Множественные связи' },
  fill: { single: 'Одно текстовое поле', multi: 'Несколько полей', inline: 'Пропуски в тексте', inline_select: 'Пропуски с выбором', number: 'Числовое поле', formula: 'Формула', table: 'Заполнение таблицы' },
  open: { short: 'Краткий ответ', long: 'Развёрнутый ответ', number: 'Числовой ответ', rich: 'С форматированием', blocks: 'Несколько блоков' },
  ordering: { vertical: 'Вертикальный список', horizontal: 'Горизонтальный список', buttons: 'Кнопками', numbered: 'Пронумерованные позиции', slots: 'Через слоты' },
  categorize: { two: 'Две категории', many: 'Несколько категорий', drag: 'Перетаскиванием', dropdown: 'Выбор категории', multi: 'Множественное распределение' },
  selection: { one: 'Выбор одного элемента', many: 'Выбор нескольких', position: 'Выбор позиции', place_labels: 'Размещение меток', name: 'Подпись элементов', scheme: 'Элементы схемы' },
  connecting: { single: 'Одна связь', many: 'Несколько связей', hub: 'С общим узлом', network: 'Сеть связей', directed: 'Направленные связи' },
  editing: { rewrite: 'Редактирование текста', highlight: 'Выделение ошибок', replace: 'Замена элементов', delete: 'Удаление элементов', reorder: 'Исправление структуры', insert: 'Вставка пропущенного' },
};
const FIELD_RE = /\{\{([A-Za-z0-9_-]{1,40})\}\}/g;
const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));

function renderTask(task, opts = {}) {
  const ctx = { task, data: task.data, ro: !!opts.readonly, st: clone(opts.value), emit: () => opts.onChange?.(clone(ctx.st)) };
  const body = el('div', { class: 'task-body' });
  const fn = WIDGETS[task.kind];
  try { body.append(fn ? fn(ctx) : el('p', { class: 'muted', text: 'Неизвестный тип задания' })); }
  catch (error) { console.error(error); body.append(el('p', { class: 'error-text', text: 'Не удалось отобразить задание' })); }
  return body;
}

/* ---------- 1. Выбор ответа ---------- */
function wChoice(c) {
  const { options } = c.data, v = c.task.variant;
  c.st.selected ??= [];
  const set = (i, on, single) => {
    c.st.selected = single ? (on ? [i] : []) : (on ? [...new Set([...c.st.selected, i])] : c.st.selected.filter(x => x !== i)).sort((a, b) => a - b);
    c.emit();
  };
  const name = 'c' + Math.random().toString(36).slice(2);
  if (v === 'dropdown') {
    return el('select', { disabled: c.ro, 'aria-label': 'Ответ', onchange: (e) => set(Number(e.target.value), e.target.value !== '', true) },
      el('option', { value: '', text: '— выберите —' }),
      options.map((o, i) => el('option', { value: i, text: o, selected: c.st.selected.includes(i) })));
  }
  if (v === 'multi_dropdown') return multiSelect(options, c.st.selected, c.ro, (sel) => { c.st.selected = sel; c.emit(); });
  if (v === 'binary') {
    const wrap = el('div', { class: 'binary', role: 'radiogroup' });
    const draw = () => wrap.replaceChildren(...options.map((o, i) => el('button', {
      type: 'button', class: 'binary-opt', disabled: c.ro, 'aria-pressed': c.st.selected.includes(i) ? 'true' : 'false', text: o,
      onclick: () => { set(i, true, true); draw(); },
    })));
    draw();
    return wrap;
  }
  const multi = v === 'multiple';
  return el('div', { class: 'opt-list' }, options.map((o, i) => el('label', { class: 'opt' },
    el('input', { type: multi ? 'checkbox' : 'radio', name, disabled: c.ro, checked: c.st.selected.includes(i),
      onchange: (e) => set(i, e.target.checked, !multi) }),
    el('span', { text: o }))));
}

function multiSelect(options, selected, ro, onChange) {
  let sel = [...selected];
  const chips = el('span', { class: 'ms-chips' });
  const draw = () => chips.replaceChildren(...(sel.length ? sel.map(i => el('span', { class: 'chip', text: options[i] })) : [el('span', { class: 'muted', text: '— выберите —' })]));
  const panel = el('div', { class: 'ms-panel' }, options.map((o, i) => el('label', { class: 'opt' },
    el('input', { type: 'checkbox', disabled: ro, checked: sel.includes(i), onchange: (e) => {
      sel = e.target.checked ? [...sel, i].sort((a, b) => a - b) : sel.filter(x => x !== i); draw(); onChange(sel);
    } }), el('span', { text: o }))));
  draw();
  return el('details', { class: 'ms' }, el('summary', { class: 'ms-summary' }, chips), panel);
}

/* ---------- 2. Сопоставление ---------- */
function wMatching(c) {
  const { left, right } = c.data, v = c.task.variant;
  c.st.pairs ??= [];
  const rightOf = (l) => c.st.pairs.filter(p => p[0] === l).map(p => p[1]);
  const setPair = (l, r) => { c.st.pairs = c.st.pairs.filter(p => p[0] !== l); if (r) c.st.pairs.push([l, r]); c.emit(); };
  const textOf = (list, id) => list.find(x => x.id === id)?.text ?? '';

  if (v === 'dropdown') {
    return el('div', { class: 'match-dd' }, left.map(l => el('div', { class: 'match-row' },
      el('span', { class: 'match-left', text: l.text }),
      el('select', { disabled: c.ro, 'aria-label': 'Соответствие для ' + l.text, onchange: (e) => setPair(l.id, e.target.value) },
        el('option', { value: '', text: '—' }), right.map(r => el('option', { value: r.id, text: r.text, selected: rightOf(l.id)[0] === r.id }))))));
  }
  if (v === 'multi') {
    return el('div', { class: 'table-wrap' }, el('table', { class: 'grid-table' },
      el('thead', {}, el('tr', {}, el('th', {}), right.map(r => el('th', { text: r.text })))),
      el('tbody', {}, left.map(l => el('tr', {}, el('th', { text: l.text }), right.map(r => el('td', {},
        el('input', { type: 'checkbox', disabled: c.ro, 'aria-label': `${l.text} — ${r.text}`, checked: rightOf(l.id).includes(r.id),
          onchange: (e) => {
            c.st.pairs = c.st.pairs.filter(p => !(p[0] === l.id && p[1] === r.id));
            if (e.target.checked) c.st.pairs.push([l.id, r.id]);
            c.emit();
          } }))))))));
  }
  if (v === 'drag') {
    const wrap = el('div', { class: 'match-drag' });
    const ctx = dndContext((key, rid) => {
      if (c.ro) return;
      c.st.pairs = c.st.pairs.filter(p => p[1] !== rid && (key === '__pool' || p[0] !== key));
      if (key !== '__pool') c.st.pairs.push([key, rid]);
      c.emit(); draw();
    });
    const draw = () => {
      const used = new Set(c.st.pairs.map(p => p[1]));
      const pool = el('div', { class: 'pool' }, right.filter(r => !used.has(r.id)).map(r => { const n = el('span', { class: 'chip', text: r.text }); if (!c.ro) dragSource(n, r.id, ctx); return n; }));
      const rows = left.map(l => {
        const slot = el('div', { class: 'slot' });
        const rid = rightOf(l.id)[0];
        if (rid) {
          const chip = el('span', { class: 'chip on', text: textOf(right, rid) });
          if (!c.ro) dragSource(chip, rid, ctx);
          slot.append(chip);
        } else slot.append(el('span', { class: 'muted', text: 'перетащите сюда' }));
        if (!c.ro) dropTarget(slot, l.id, ctx);
        return el('div', { class: 'match-row' }, el('span', { class: 'match-left', text: l.text }), slot);
      });
      const poolBox = el('div', { class: 'pool-box' }, el('div', { class: 'cap', text: 'Варианты' }), pool);
      if (!c.ro) dropTarget(poolBox, '__pool', ctx);
      wrap.replaceChildren(el('div', { class: 'match-rows' }, rows), poolBox);
    };
    draw();
    return wrap;
  }
  // columns / lines: щелчок слева, затем справа
  return linkBoard({
    left, right, pairs: () => c.st.pairs, ro: c.ro, lines: v === 'lines',
    toggle: (l, r) => {
      const exists = c.st.pairs.some(p => p[0] === l && p[1] === r);
      c.st.pairs = c.st.pairs.filter(p => p[0] !== l && p[1] !== r);
      if (!exists) c.st.pairs.push([l, r]);
      c.emit();
    },
  });
}

function linkBoard({ left, right, pairs, ro, lines, toggle }) {
  const board = el('div', { class: 'link-board' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'link-svg'); svg.setAttribute('aria-hidden', 'true');
  let active = null;
  const colL = el('div', { class: 'link-col' }), colR = el('div', { class: 'link-col' });
  const draw = () => {
    const ps = pairs();
    const numL = new Map(ps.map((p, i) => [p[0], i + 1]));
    const numR = new Map(ps.map((p, i) => [p[1], i + 1]));
    const item = (x, side) => {
      const n = (side === 'l' ? numL : numR).get(x.id);
      return el('button', { type: 'button', class: `link-item${active === x.id && side === 'l' ? ' active' : ''}${n ? ' linked' : ''}`, 'data-id': x.id, 'data-side': side, disabled: ro,
        onclick: () => {
          if (side === 'l') { active = active === x.id ? null : x.id; draw(); return; }
          if (!active) { toast('Сначала выберите элемент левой колонки'); return; }
          toggle(active, x.id); active = null; draw();
        } }, n && !lines ? el('span', { class: 'link-num', text: n }) : null, el('span', { text: x.text }));
    };
    colL.replaceChildren(...left.map(x => item(x, 'l')));
    colR.replaceChildren(...right.map(x => item(x, 'r')));
    requestAnimationFrame(drawLines);
  };
  const drawLines = () => {
    svg.replaceChildren();
    if (!lines) return;
    const box = board.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    for (const [l, r] of pairs()) {
      const a = colL.querySelector(`[data-id="${CSS.escape(l)}"]`), b = colR.querySelector(`[data-id="${CSS.escape(r)}"]`);
      if (!a || !b) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', ra.right - box.left); line.setAttribute('y1', ra.top + ra.height / 2 - box.top);
      line.setAttribute('x2', rb.left - box.left); line.setAttribute('y2', rb.top + rb.height / 2 - box.top);
      svg.append(line);
    }
  };
  board.append(colL, el('div', { class: 'link-gap' }), colR, svg);
  new ResizeObserver(() => drawLines()).observe(board);
  draw();
  if (!ro) board.prepend(el('p', { class: 'hint', text: 'Выберите элемент слева, затем соответствующий справа. Повторный выбор пары удаляет связь.' }));
  return board;
}

/* ---------- 3. Заполнение полей ---------- */
function wFill(c) {
  const v = c.task.variant, fields = c.data.fields;
  c.st.fields ??= {};
  const input = (f, extra = {}) => {
    const props = { type: 'text', disabled: c.ro, value: c.st.fields[f.id] ?? '', 'aria-label': f.label || 'Поле ' + f.id,
      oninput: (e) => { c.st.fields[f.id] = e.target.value; c.emit(); }, ...extra };
    if (v === 'number') Object.assign(props, { inputmode: 'decimal', placeholder: 'Число' });
    if (v === 'formula') Object.assign(props, { class: 'mono', placeholder: 'Например: (a+b)^2/2', spellcheck: 'false' });
    if (v === 'inline_select') {
      return el('select', { class: 'inline-ctl', disabled: c.ro, 'aria-label': 'Пропуск ' + f.id, onchange: (e) => { c.st.fields[f.id] = e.target.value; c.emit(); } },
        el('option', { value: '', text: '—' }), f.options.map(o => el('option', { value: o, text: o, selected: c.st.fields[f.id] === o })));
    }
    return el('input', props);
  };
  const withBlanks = (text, cls) => {
    const parts = []; let last = 0;
    for (const m of text.matchAll(FIELD_RE)) {
      parts.push(text.slice(last, m.index));
      const f = fields.find(x => x.id === m[1]);
      parts.push(f ? input(f, { class: cls }) : m[0]);
      last = m.index + m[0].length;
    }
    parts.push(text.slice(last));
    return parts;
  };
  if (v === 'inline' || v === 'inline_select') return el('div', { class: 'inline-text' }, withBlanks(c.data.text, 'inline-ctl'));
  if (v === 'table') {
    return el('div', { class: 'table-wrap' }, el('table', { class: 'grid-table' },
      el('thead', {}, el('tr', {}, c.data.columns.map(h => el('th', { text: h })))),
      el('tbody', {}, c.data.rows.map(row => el('tr', {}, row.map(cell => el('td', {}, withBlanks(cell, 'cell-input'))))))));
  }
  return el('div', { class: 'fields' }, fields.map(f => el('label', {}, f.label || (fields.length > 1 ? 'Поле ' + f.id : 'Ответ'), input(f))));
}

/* ---------- 4. Свободный ответ ---------- */
function wOpen(c) {
  const v = c.task.variant, ph = c.data.placeholder || '';
  if (v === 'short') return el('input', { type: 'text', disabled: c.ro, value: c.st.text ?? '', placeholder: ph, 'aria-label': 'Ответ', oninput: (e) => { c.st.text = e.target.value; c.emit(); } });
  if (v === 'number') {
    const err = el('div', { class: 'error-text' });
    return el('div', {}, el('input', { type: 'text', inputmode: 'decimal', disabled: c.ro, value: c.st.text ?? '', placeholder: ph || 'Число', 'aria-label': 'Числовой ответ',
      oninput: (e) => {
        const ok = /^\s*-?\d+([.,]\d+)?\s*$/.test(e.target.value) || e.target.value === '';
        err.textContent = ok ? '' : 'Введите число, например 12 или 3,5';
        c.st.text = e.target.value; c.emit();
      } }), err);
  }
  if (v === 'long') return el('textarea', { rows: 6, disabled: c.ro, placeholder: ph, 'aria-label': 'Ответ', value: c.st.text ?? '', oninput: (e) => { c.st.text = e.target.value; c.emit(); } });
  if (v === 'rich') {
    // HTML очищается сервером при сохранении попытки; здесь показывается введённое учеником или очищенное сервером.
    const area = el('div', { class: 'rich-area', contenteditable: c.ro ? 'false' : 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Ответ с форматированием', html: c.st.html || '' });
    area.addEventListener('input', () => { c.st.html = area.innerHTML; c.emit(); });
    const cmd = (name, label, tip) => el('button', { type: 'button', class: 'rich-btn', 'aria-label': tip, title: tip, disabled: c.ro,
      onmousedown: (e) => e.preventDefault(), onclick: () => { document.execCommand(name); area.focus(); c.st.html = area.innerHTML; c.emit(); } }, el('span', { html: label }));
    return el('div', { class: 'rich' }, c.ro ? null : el('div', { class: 'rich-bar' },
      cmd('bold', '<b>Ж</b>', 'Жирный'), cmd('italic', '<i>К</i>', 'Курсив'), cmd('underline', '<u>П</u>', 'Подчёркнутый'),
      cmd('insertUnorderedList', '• —', 'Маркированный список'), cmd('insertOrderedList', '1.', 'Нумерованный список')), area);
  }
  // blocks
  c.st.blocks ??= [''];
  const max = c.data.max_blocks || 5;
  const wrap = el('div', { class: 'blocks' });
  const draw = () => wrap.replaceChildren(...c.st.blocks.map((b, i) => el('div', { class: 'block-row' },
    el('label', {}, `Блок ${i + 1}`, el('textarea', { rows: 3, disabled: c.ro, value: b, placeholder: ph, oninput: (e) => { c.st.blocks[i] = e.target.value; c.emit(); } })),
    c.ro || c.st.blocks.length < 2 ? null : ibtn({ icon: 'trash', tip: 'Удалить блок', danger: true, onclick: () => { c.st.blocks.splice(i, 1); c.emit(); draw(); } }))),
    c.ro || c.st.blocks.length >= max ? '' : el('button', { type: 'button', class: 'btn small ghost', onclick: () => { c.st.blocks.push(''); c.emit(); draw(); } }, icon('add'), 'Добавить блок'));
  draw();
  return wrap;
}

/* ---------- 5. Упорядочивание ---------- */
function orderWidget(c, items, variant) {
  const byId = new Map(items.map(i => [i.id, i]));
  if (!Array.isArray(c.st.order) || c.st.order.length !== items.length || !c.st.order.every(id => byId.has(id))) {
    // Начальный (перемешанный) порядок не считается ответом, пока ученик его не изменит.
    c.st.order = variant === 'slots' || variant === 'numbered' ? (c.st.order || []).filter(id => byId.has(id)) : items.map(i => i.id);
  }
  if (variant === 'numbered') {
    c.st.nums ??= {};
    const n = items.length;
    const update = () => {
      const assigned = items.filter(i => c.st.nums[i.id]);
      c.st.order = assigned.length === n ? [...items].sort((a, b) => c.st.nums[a.id] - c.st.nums[b.id]).map(i => i.id) : [];
      c.emit();
    };
    return el('div', { class: 'opt-list' }, items.map(i => el('div', { class: 'num-row' },
      el('select', { class: 'num-select', disabled: c.ro, 'aria-label': 'Позиция для ' + i.text, onchange: (e) => { c.st.nums[i.id] = Number(e.target.value) || 0; update(); } },
        el('option', { value: '', text: '№' }), Array.from({ length: n }, (_, k) => el('option', { value: k + 1, text: k + 1, selected: c.st.nums[i.id] === k + 1 }))),
      el('span', { text: i.text }))));
  }
  if (variant === 'slots') {
    const wrap = el('div', { class: 'slots-wrap' });
    const ctx = dndContext(() => {});
    const draw = () => {
      const placed = new Set(c.st.order.filter(Boolean));
      const slots = items.map((_, k) => {
        const id = c.st.order[k];
        const slot = el('div', { class: 'slot numbered' }, el('span', { class: 'slot-num', text: k + 1 }));
        if (id) { const chip = el('span', { class: 'chip on', text: byId.get(id).text }); if (!c.ro) dragSource(chip, id, ctx); slot.append(chip); }
        if (!c.ro) dropTarget(slot, k, ctx);
        return slot;
      });
      const pool = el('div', { class: 'pool' }, items.filter(i => !placed.has(i.id)).map(i => { const n = el('span', { class: 'chip', text: i.text }); if (!c.ro) dragSource(n, i.id, ctx); return n; }));
      const poolBox = el('div', { class: 'pool-box' }, el('div', { class: 'cap', text: 'Элементы' }), pool);
      if (!c.ro) dropTarget(poolBox, 'pool', ctx);
      wrap.replaceChildren(el('div', { class: 'slots' }, slots), poolBox);
    };
    ctx.onDrop = (key, id) => {
      const order = Array.from({ length: items.length }, (_, k) => c.st.order[k] || null).map(x => (x === id ? null : x));
      if (key !== 'pool') order[key] = id;
      c.st.order = order;
      c.emit(); draw();
    };
    draw();
    return wrap;
  }
  const horizontal = variant === 'horizontal';
  const list = el('ol', { class: `sort-list${horizontal ? ' horizontal' : ''}` });
  const move = (idx, delta) => {
    const j = idx + delta;
    if (j < 0 || j >= c.st.order.length) return;
    [c.st.order[idx], c.st.order[j]] = [c.st.order[j], c.st.order[idx]];
    c.emit(); draw();
  };
  const draw = () => list.replaceChildren(...c.st.order.map((id, idx) => el('li', { class: 'sort-item', 'data-id': id },
    variant === 'buttons' || c.ro ? null : el('span', { class: 'grip', 'data-handle': '', 'aria-hidden': 'true', html: ICONS.grip }),
    el('span', { class: 'sort-text', text: byId.get(id).text }),
    c.ro ? null : el('span', { class: 'sort-btns' },
      ibtn({ icon: horizontal ? 'left' : 'up', tip: horizontal ? 'Левее' : 'Выше', onclick: () => move(idx, -1), disabled: idx === 0 }),
      ibtn({ icon: horizontal ? 'right' : 'down', tip: horizontal ? 'Правее' : 'Ниже', onclick: () => move(idx, 1), disabled: idx === c.st.order.length - 1 })))));
  if (!c.ro && variant !== 'buttons') sortable(list, horizontal ? 'x' : 'y', (order) => { c.st.order = order; c.emit(); draw(); });
  draw();
  return list;
}
const wOrdering = (c) => orderWidget(c, c.data.items, c.task.variant);

/* ---------- 6. Классификация ---------- */
function wCategorize(c) {
  const { items, categories } = c.data, v = c.task.variant;
  c.st.map ??= {};
  const catsOf = (id) => c.st.map[id] || [];
  if (v === 'dropdown') {
    return el('div', { class: 'match-dd' }, items.map(i => el('div', { class: 'match-row' }, el('span', { class: 'match-left', text: i.text }),
      el('select', { disabled: c.ro, 'aria-label': 'Категория для ' + i.text, onchange: (e) => { c.st.map[i.id] = e.target.value ? [e.target.value] : []; c.emit(); } },
        el('option', { value: '', text: '—' }), categories.map(k => el('option', { value: k.id, text: k.text, selected: catsOf(i.id)[0] === k.id }))))));
  }
  if (v === 'multi') {
    return el('div', { class: 'table-wrap' }, el('table', { class: 'grid-table' },
      el('thead', {}, el('tr', {}, el('th', {}), categories.map(k => el('th', { text: k.text })))),
      el('tbody', {}, items.map(i => el('tr', {}, el('th', { text: i.text }), categories.map(k => el('td', {},
        el('input', { type: 'checkbox', disabled: c.ro, 'aria-label': `${i.text} — ${k.text}`, checked: catsOf(i.id).includes(k.id),
          onchange: (e) => { const s = new Set(catsOf(i.id)); e.target.checked ? s.add(k.id) : s.delete(k.id); c.st.map[i.id] = [...s].sort(); c.emit(); } }))))))));
  }
  const wrap = el('div', { class: 'cat-wrap' });
  const ctx = dndContext((key, id) => { if (c.ro) return; c.st.map[id] = key === 'pool' ? [] : [key]; c.emit(); draw(); });
  const chip = (i, on) => { const n = el('span', { class: `chip${on ? ' on' : ''}`, text: i.text }); if (!c.ro) dragSource(n, i.id, ctx); return n; };
  const draw = () => {
    const pool = el('div', { class: 'pool-box' }, el('div', { class: 'cap', text: 'Элементы' }),
      el('div', { class: 'pool' }, items.filter(i => !catsOf(i.id).length).map(i => chip(i, false))));
    if (!c.ro) dropTarget(pool, 'pool', ctx);
    const boxes = categories.map(k => {
      const box = el('div', { class: 'cat-box' }, el('div', { class: 'cap', text: k.text }),
        el('div', { class: 'pool' }, items.filter(i => catsOf(i.id).includes(k.id)).map(i => chip(i, true))));
      if (!c.ro) dropTarget(box, k.id, ctx);
      return box;
    });
    wrap.replaceChildren(pool, el('div', { class: 'cat-grid' }, boxes));
  };
  draw();
  return wrap;
}

/* ---------- 7. Выделение и обозначение ---------- */
function canvasBox(data, children) {
  const box = el('div', { class: 'canvas' + (data.image ? ' has-image' : '') });
  if (data.image) box.append(el('img', { src: data.image, alt: '', draggable: 'false', referrerpolicy: 'no-referrer' }));
  box.append(...children);
  return box;
}
const at = (x, y) => ({ left: x + '%', top: y + '%' });

function wSelection(c) {
  const v = c.task.variant, d = c.data;
  if (v === 'position') {
    c.st.point ??= null;
    const marker = el('span', { class: 'pos-marker', hidden: !c.st.point });
    const place = () => { if (c.st.point) { Object.assign(marker.style, at(c.st.point.x, c.st.point.y)); marker.hidden = false; } };
    const box = canvasBox(d, [marker]);
    box.classList.add('clickable');
    if (!c.ro) box.addEventListener('click', (e) => {
      const r = box.getBoundingClientRect();
      c.st.point = { x: Math.round((e.clientX - r.left) / r.width * 1000) / 10, y: Math.round((e.clientY - r.top) / r.height * 1000) / 10 };
      place(); c.emit();
    });
    place();
    return el('div', {}, c.ro ? null : el('p', { class: 'hint', text: 'Нажмите на нужное место рабочей области.' }), box);
  }
  const elements = d.elements;
  const nums = new Map(elements.map((e, i) => [e.id, i + 1]));
  if (v === 'name') {
    c.st.names ??= {};
    return el('div', { class: 'stack-sm' }, canvasBox(d, elements.map(e => el('span', { class: 'marker', style: at(e.x, e.y), text: nums.get(e.id) }))),
      el('div', { class: 'fields two' }, elements.map(e => el('label', {}, `Элемент ${nums.get(e.id)}`,
        el('input', { type: 'text', disabled: c.ro, value: c.st.names[e.id] ?? '', oninput: (ev) => { c.st.names[e.id] = ev.target.value; c.emit(); } })))));
  }
  if (v === 'place_labels') {
    c.st.map ??= {};
    const wrap = el('div', { class: 'stack-sm' });
    const ctx = dndContext((key, label) => {
      if (c.ro) return;
      for (const k of Object.keys(c.st.map)) if (c.st.map[k] === label) delete c.st.map[k];
      if (key !== 'pool') c.st.map[key] = label;
      c.emit(); draw();
    });
    const draw = () => {
      const used = new Set(Object.values(c.st.map));
      const spots = elements.map(e => {
        const label = c.st.map[e.id];
        const spot = el('div', { class: 'label-spot' + (label ? ' filled' : ''), style: at(e.x, e.y) });
        if (label) { const chip = el('span', { class: 'chip on', text: label }); if (!c.ro) dragSource(chip, label, ctx); spot.append(chip); }
        else spot.append(el('span', { class: 'marker', text: nums.get(e.id) }));
        if (!c.ro) dropTarget(spot, e.id, ctx);
        return spot;
      });
      const pool = el('div', { class: 'pool-box' }, el('div', { class: 'cap', text: 'Метки' }),
        el('div', { class: 'pool' }, d.labels.filter(l => !used.has(l)).map(l => { const n = el('span', { class: 'chip', text: l }); if (!c.ro) dragSource(n, l, ctx); return n; })));
      if (!c.ro) dropTarget(pool, 'pool', ctx);
      wrap.replaceChildren(canvasBox(d, spots), pool);
    };
    draw();
    return wrap;
  }
  // one / many / scheme
  c.st.selected ??= [];
  const single = v === 'one';
  const box = canvasBox(d, []);
  if (v === 'scheme') box.append(edgesSvg(elements, d.edges || [], true));
  const draw = () => {
    box.querySelectorAll('.node').forEach(n => n.remove());
    box.append(...elements.map(e => el('button', { type: 'button', class: 'node' + (v === 'scheme' ? ' block' : '') + (c.st.selected.includes(e.id) ? ' selected' : ''),
      style: at(e.x, e.y), disabled: c.ro, 'aria-pressed': c.st.selected.includes(e.id) ? 'true' : 'false', text: e.text,
      onclick: () => {
        const on = c.st.selected.includes(e.id);
        c.st.selected = single ? (on ? [] : [e.id]) : (on ? c.st.selected.filter(x => x !== e.id) : [...c.st.selected, e.id]);
        c.emit(); draw();
      } })));
  };
  draw();
  return box;
}

function edgesSvg(nodes, edges, directed) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'edge-svg'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const pos = new Map(nodes.map(n => [n.id, n]));
  for (const [a, b] of edges) {
    const p = pos.get(a), q = pos.get(b);
    if (!p || !q) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', p.x); line.setAttribute('y1', p.y); line.setAttribute('x2', q.x); line.setAttribute('y2', q.y);
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(line);
    if (directed) {
      // стрелка в 65% пути, чтобы не пряталась под узлом
      const mx = p.x + (q.x - p.x) * .65, my = p.y + (q.y - p.y) * .65;
      const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      head.setAttribute('cx', mx); head.setAttribute('cy', my); head.setAttribute('r', '1.1'); head.setAttribute('class', 'arrow-dot');
      svg.append(head);
    }
  }
  return svg;
}

/* ---------- 8. Соединение элементов ---------- */
function wConnecting(c) {
  const d = c.data, directed = !!d.directed, max = d.max_edges || Infinity;
  c.st.edges ??= [];
  let active = null;
  const wrap = el('div', { class: 'stack-sm' });
  const label = new Map(d.nodes.map(n => [n.id, n.text]));
  const same = (e, a, b) => (e[0] === a && e[1] === b) || (!directed && e[0] === b && e[1] === a);
  const draw = () => {
    const box = canvasBox({}, [edgesSvg(d.nodes, c.st.edges, directed)]);
    box.append(...d.nodes.map(n => el('button', { type: 'button', class: 'node' + (active === n.id ? ' active' : ''), style: at(n.x, n.y), disabled: c.ro, text: n.text,
      'aria-pressed': active === n.id ? 'true' : 'false',
      onclick: () => {
        if (!active) { active = n.id; draw(); return; }
        if (active === n.id) { active = null; draw(); return; }
        const exists = c.st.edges.some(e => same(e, active, n.id));
        if (exists) c.st.edges = c.st.edges.filter(e => !same(e, active, n.id));
        else if (c.st.edges.length >= max) c.st.edges = [[active, n.id]];
        else c.st.edges.push([active, n.id]);
        active = null; c.emit(); draw();
      } })));
    const list = el('ul', { class: 'edge-list' }, c.st.edges.map(e => el('li', {},
      el('span', { text: `${label.get(e[0])} ${directed ? '→' : '—'} ${label.get(e[1])}` }),
      c.ro ? null : ibtn({ icon: 'x', tip: 'Удалить связь', danger: true, onclick: () => { c.st.edges = c.st.edges.filter(x => x !== e); c.emit(); draw(); } }))));
    wrap.replaceChildren(c.ro ? '' : el('p', { class: 'hint', text: directed ? 'Нажмите узел-начало, затем узел-конец. Повторное соединение удаляет связь.' : 'Нажмите два узла, чтобы соединить их. Повторное соединение удаляет связь.' }),
      box, c.st.edges.length ? list : el('p', { class: 'muted small', text: 'Связей пока нет' }));
  };
  draw();
  return wrap;
}

/* ---------- 9. Редактирование ---------- */
function wEditing(c) {
  const v = c.task.variant, d = c.data;
  if (v === 'reorder') return orderWidget(c, d.lines, 'vertical');
  if (v === 'rewrite') {
    c.st.text ??= d.text;
    return el('textarea', { rows: 5, disabled: c.ro, value: c.st.text, 'aria-label': 'Исправьте текст', oninput: (e) => { c.st.text = e.target.value; c.emit(); } });
  }
  const words = d.tokens;
  const wrap = el('div', { class: 'tokens' });
  if (v === 'highlight' || v === 'delete') {
    c.st.indices ??= [];
    const cls = v === 'highlight' ? 'hl' : 'struck';
    const draw = () => wrap.replaceChildren(...words.map((w, i) => el('button', { type: 'button', class: 'token' + (c.st.indices.includes(i) ? ' ' + cls : ''), disabled: c.ro,
      'aria-pressed': c.st.indices.includes(i) ? 'true' : 'false', text: w,
      onclick: () => { c.st.indices = c.st.indices.includes(i) ? c.st.indices.filter(x => x !== i) : [...c.st.indices, i].sort((a, b) => a - b); c.emit(); draw(); } })));
    draw();
    return el('div', {}, c.ro ? null : el('p', { class: 'hint', text: v === 'highlight' ? 'Нажмите на слова с ошибками.' : 'Нажмите на лишние слова, чтобы удалить их.' }), wrap);
  }
  if (v === 'replace') {
    c.st.replacements ??= {};
    let editing = null;
    const draw = () => wrap.replaceChildren(...words.map((w, i) => {
      const key = String(i), rep = c.st.replacements[key];
      if (editing === i) {
        const inp = el('input', { type: 'text', class: 'token-input', value: rep ?? w, 'aria-label': 'Замена для ' + w,
          onkeydown: (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { editing = null; draw(); } },
          onblur: () => { const val = inp.value.trim(); if (!val || val === w) delete c.st.replacements[key]; else c.st.replacements[key] = val; editing = null; c.emit(); draw(); } });
        setTimeout(() => inp.focus(), 0);
        return inp;
      }
      return el('button', { type: 'button', class: 'token' + (rep ? ' replaced' : ''), disabled: c.ro, title: rep ? 'Было: ' + w : 'Заменить',
        onclick: () => { editing = i; draw(); } }, rep ? el('span', {}, el('s', { class: 'muted', text: w }), ' ', rep) : w);
    }));
    draw();
    return el('div', {}, c.ro ? null : el('p', { class: 'hint', text: 'Нажмите на слово, чтобы заменить его.' }), wrap);
  }
  // insert
  c.st.inserts ??= {};
  let editing = null;
  const gap = (i) => {
    const key = String(i), val = c.st.inserts[key];
    if (editing === i) {
      const inp = el('input', { type: 'text', class: 'token-input', value: val ?? '', 'aria-label': 'Вставка',
        onkeydown: (e) => { if (e.key === 'Enter') inp.blur(); },
        onblur: () => { const t = inp.value.trim(); t ? (c.st.inserts[key] = t) : delete c.st.inserts[key]; editing = null; c.emit(); draw(); } });
      setTimeout(() => inp.focus(), 0);
      return inp;
    }
    if (val) return el('button', { type: 'button', class: 'token inserted', disabled: c.ro, text: val, onclick: () => { editing = i; draw(); } });
    return c.ro ? '' : el('button', { type: 'button', class: 'gap', 'aria-label': 'Вставить здесь', title: 'Вставить здесь', onclick: () => { editing = i; draw(); } }, '+');
  };
  const draw = () => { const parts = []; for (let i = 0; i <= words.length; i++) { parts.push(gap(i)); if (i < words.length) parts.push(el('span', { class: 'token static', text: words[i] })); } wrap.replaceChildren(...parts); };
  draw();
  return el('div', {}, c.ro ? null : el('p', { class: 'hint', text: 'Нажмите «+» между словами, чтобы вставить пропущенное.' }), wrap);
}

const WIDGETS = { choice: wChoice, matching: wMatching, fill: wFill, open: wOpen, ordering: wOrdering, categorize: wCategorize, selection: wSelection, connecting: wConnecting, editing: wEditing };

/* Описание правильного ответа (для преподавателя). */
function describeAnswer(task) {
  const a = task.answer, d = task.data;
  if (!a) return 'Проверяет преподаватель';
  const t = (list, id) => list?.find(x => x.id === id)?.text ?? id;
  switch (task.kind) {
    case 'choice': return a.correct.map(i => d.options[i]).join('; ');
    case 'matching': return a.pairs.map(([l, r]) => `${t(d.left, l)} → ${t(d.right, r)}`).join('; ');
    case 'fill': return Object.entries(a.fields).map(([k, v]) => `${k}: ${v.join(' / ')}`).join('; ') + (a.tolerance ? ` (допуск ${a.tolerance})` : '');
    case 'open': return a.accepted ? a.accepted.join(' / ') : `${a.value}${a.tolerance ? ' ± ' + a.tolerance : ''}`;
    case 'ordering': return a.order.map(id => t(d.items, id)).join(' → ');
    case 'categorize': return Object.entries(a.map).filter(([, v]) => v.length).map(([k, v]) => `${t(d.items, k)}: ${v.map(x => t(d.categories, x)).join(', ')}`).join('; ');
    case 'selection':
      if (a.selected) return a.selected.map(id => t(d.elements, id)).join(', ');
      if (a.region) return `область x ${a.region.x}–${a.region.x + a.region.w}%, y ${a.region.y}–${a.region.y + a.region.h}%`;
      if (a.map) return Object.entries(a.map).map(([k, v]) => `${t(d.elements, k)}: ${v}`).join('; ');
      return Object.entries(a.names).map(([k, v]) => `${t(d.elements, k)}: ${v.join(' / ')}`).join('; ');
    case 'connecting': return a.edges.map(([x, y]) => `${t(d.nodes, x)} ${d.directed ? '→' : '—'} ${t(d.nodes, y)}`).join('; ');
    case 'editing':
      if (a.order) return a.order.map(id => t(d.lines, id)).join(' / ');
      if (a.indices) return a.indices.map(i => d.tokens[i]).join(', ');
      return a.text;
  }
  return '';
}
