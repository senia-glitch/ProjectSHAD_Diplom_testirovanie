'use strict';
/* Конструктор заданий. Каждый редактор возвращает {node, collect()} → {data, answer}.
   Правильный ответ везде необязателен: без него задание проверяет преподаватель. */

const lines = (text) => String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
const alts = (text) => String(text || '').split('|').map(s => s.trim()).filter(Boolean);
const field = (label, control, hint) => el('label', {}, label, control, hint ? el('span', { class: 'hint', text: hint }) : null);
const ta = (value, rows = 4, extra = {}) => el('textarea', { rows, value: value ?? '', ...extra });
const inp = (value, extra = {}) => el('input', { type: 'text', value: value ?? '', ...extra });
const autoBox = (on, text = 'Проверять автоматически') => { const box = el('input', { type: 'checkbox', checked: on }); return { box, node: el('label', { class: 'check' }, box, text) }; };

/* ---------- 1. Выбор ---------- */
function edChoice(variant, task) {
  const binary = variant === 'binary', single = ['single', 'binary', 'dropdown'].includes(variant);
  let rows = (task.data?.options || (binary ? ['Да', 'Нет'] : ['', ''])).map((t, i) => ({ text: t, ok: !!task.answer?.correct?.includes(i) }));
  if (binary) rows = rows.slice(0, 2);
  const list = el('div', { class: 'ed-rows' });
  const name = 'ok' + Math.random().toString(36).slice(2);
  const draw = () => list.replaceChildren(...rows.map((r, i) => el('div', { class: 'list-row' },
    el('input', { type: single ? 'radio' : 'checkbox', name, checked: r.ok, 'aria-label': 'Правильный вариант', title: 'Правильный вариант',
      onchange: (e) => { if (single) rows.forEach(x => (x.ok = false)); r.ok = e.target.checked; } }),
    inp(r.text, { placeholder: `Вариант ${i + 1}`, oninput: (e) => (r.text = e.target.value) }),
    binary || rows.length <= 2 ? null : ibtn({ icon: 'trash', tip: 'Удалить вариант', danger: true, onclick: () => { rows.splice(i, 1); draw(); } }))),
    binary ? '' : el('button', { type: 'button', class: 'btn small ghost', onclick: () => { rows.push({ text: '', ok: false }); draw(); } }, icon('add'), 'Вариант'));
  draw();
  return {
    node: el('div', {}, el('p', { class: 'hint', text: 'Отметьте правильный вариант (необязательно).' }), list),
    collect: () => {
      const correct = rows.map((r, i) => (r.ok ? i : -1)).filter(i => i >= 0);
      return { data: { options: rows.map(r => r.text) }, answer: correct.length ? { correct } : null };
    },
  };
}

/* ---------- 2. Сопоставление ---------- */
function edMatching(variant, task) {
  const L = ta((task.data?.left || []).map(x => x.text).join('\n'), 4, { placeholder: 'Элемент слева\nпо одному в строке' });
  const R = ta((task.data?.right || []).map(x => x.text).join('\n'), 4, { placeholder: 'Элемент справа\nпо одному в строке' });
  const leftIds = (task.data?.left || []).map(x => x.id), rightIds = (task.data?.right || []).map(x => x.id);
  let checks = new Set((task.answer?.pairs || []).map(([l, r]) => `${leftIds.indexOf(l)}:${rightIds.indexOf(r)}`));
  const grid = el('div', { class: 'table-wrap' });
  const drawGrid = () => {
    const ls = lines(L.value), rs = lines(R.value);
    if (!ls.length || !rs.length) { grid.replaceChildren(el('p', { class: 'muted small pad', text: 'Заполните обе колонки' })); return; }
    grid.replaceChildren(el('table', { class: 'grid-table' },
      el('thead', {}, el('tr', {}, el('th', {}), rs.map(r => el('th', { text: r })))),
      el('tbody', {}, ls.map((l, i) => el('tr', {}, el('th', { text: l }), rs.map((_, j) => el('td', {},
        el('input', { type: 'checkbox', checked: checks.has(`${i}:${j}`), 'aria-label': `${l} — ${rs[j]}`, onchange: (e) => {
          if (e.target.checked && variant !== 'multi') checks = new Set([...checks].filter(k => !k.startsWith(i + ':')));
          e.target.checked ? checks.add(`${i}:${j}`) : checks.delete(`${i}:${j}`);
          drawGrid();
        } }))))))));
  };
  L.addEventListener('input', drawGrid); R.addEventListener('input', drawGrid);
  drawGrid();
  return {
    node: el('div', { class: 'stack-sm' }, el('div', { class: 'grid2' }, field('Левая колонка', L), field('Правая колонка', R, 'Можно добавить лишние варианты')),
      el('div', { class: 'hint', text: variant === 'multi' ? 'Правильные связи (несколько на элемент):' : 'Правильные связи (по одной на элемент слева, необязательно):' }), grid),
    collect: () => {
      const ls = lines(L.value), rs = lines(R.value);
      const pairs = [...checks].map(k => k.split(':').map(Number)).filter(([i, j]) => i < ls.length && j < rs.length).map(([i, j]) => ['L' + (i + 1), 'R' + (j + 1)]);
      return { data: { left: ls.map((t, i) => ({ id: 'L' + (i + 1), text: t })), right: rs.map((t, i) => ({ id: 'R' + (i + 1), text: t })) }, answer: pairs.length ? { pairs } : null };
    },
  };
}

/* ---------- 3. Заполнение полей ---------- */
const BLANK_RE = /\[\[([^\]]*)\]\]/g;
function edFill(variant, task) {
  const d = task.data || {}, a = task.answer?.fields || {};
  if (variant === 'inline' || variant === 'inline_select' || variant === 'table') {
    const toSyntax = (text) => String(text || '').replace(FIELD_RE, (_, id) => {
      const f = (d.fields || []).find(x => x.id === id) || {};
      if (variant === 'inline_select') return '[[' + (f.options || []).map(o => ((a[id] || []).includes(o) ? '*' : '') + o).join('|') + ']]';
      return '[[' + (a[id] || []).join('|') + ']]';
    });
    let initial = '';
    if (variant === 'table' && d.columns) initial = [d.columns.join(' | '), ...d.rows.map(r => r.map(toSyntax).join(' | '))].join('\n');
    else if (d.text) initial = toSyntax(d.text);
    const help = {
      inline: 'Пропуск — [[ответ]] или [[ответ|другой вариант]]; без ответа — [[]].',
      inline_select: 'Пропуск — [[*правильный|вариант|вариант]]; звёздочка отмечает правильный (необязательно).',
      table: 'Первая строка — заголовки, ячейки разделяются «|». Поле ввода — [[ответ]] или [[]].',
    }[variant];
    const area = ta(initial, 6, { placeholder: variant === 'table' ? 'x | x²\n2 | [[4]]\n3 | [[9]]' : 'Столица Франции — [[Париж]].' });
    const tol = null;
    return {
      node: el('div', { class: 'stack-sm' }, field(variant === 'table' ? 'Таблица' : 'Текст', area, help)),
      collect: () => {
        const fields = [], answers = {};
        let n = 0;
        const conv = (s) => s.replace(BLANK_RE, (_, inner) => {
          const id = String(++n);
          const parts = alts(inner);
          if (variant === 'inline_select') {
            fields.push({ id, options: parts.map(p => p.replace(/^\*/, '')) });
            const ok = parts.filter(p => p.startsWith('*')).map(p => p.slice(1));
            if (ok.length) answers[id] = ok;
          } else { fields.push({ id }); if (parts.length) answers[id] = parts; }
          return `{{${id}}}`;
        });
        let data;
        if (variant === 'table') {
          const rows = lines(area.value).map(r => r.split('|').map(s => s.trim()));
          const columns = rows.shift() || [];
          data = { columns, rows: rows.map(r => conv(r.join('\u0001')).split('\u0001')).map(r => columns.map((_, i) => r[i] ?? '')), fields };
        } else data = { text: conv(area.value), fields };
        return { data, answer: Object.keys(answers).length ? { fields: answers, tolerance: tol } : null };
      },
    };
  }
  let rows = (d.fields || [{ id: '1', label: '' }]).map(f => ({ label: f.label || '', ans: (a[f.id] || []).join(' | ') }));
  const list = el('div', { class: 'ed-rows' });
  const multi = variant === 'multi';
  const tol = inp(task.answer?.tolerance ?? '', { inputmode: 'decimal', placeholder: '0' });
  const draw = () => list.replaceChildren(...rows.map((r, i) => el('div', { class: 'grid2' },
    field(multi ? `Подпись поля ${i + 1}` : 'Подпись поля', inp(r.label, { oninput: (e) => (r.label = e.target.value), placeholder: 'Необязательно' })),
    el('div', { class: 'row nowrap' }, field('Правильный ответ', inp(r.ans, { oninput: (e) => (r.ans = e.target.value), placeholder: variant === 'formula' ? 'a^2+b^2 | b^2+a^2' : 'Варианты через |', class: variant === 'formula' ? 'mono' : '' })),
      multi && rows.length > 1 ? ibtn({ icon: 'trash', tip: 'Удалить поле', danger: true, onclick: () => { rows.splice(i, 1); draw(); } }) : null))),
    multi ? el('button', { type: 'button', class: 'btn small ghost', onclick: () => { rows.push({ label: '', ans: '' }); draw(); } }, icon('add'), 'Поле') : '');
  draw();
  return {
    node: el('div', { class: 'stack-sm' }, list, variant === 'number' ? field('Допустимая погрешность', tol) : null),
    collect: () => {
      const fields = rows.map((r, i) => ({ id: String(i + 1), label: r.label }));
      const answers = {};
      rows.forEach((r, i) => { const v = alts(r.ans); if (v.length) answers[String(i + 1)] = v; });
      return { data: { fields }, answer: Object.keys(answers).length ? { fields: answers, tolerance: tol.value || 0 } : null };
    },
  };
}

/* ---------- 4. Свободный ответ ---------- */
function edOpen(variant, task) {
  const d = task.data || {}, a = task.answer || {};
  const ph = inp(d.placeholder, { placeholder: 'Подсказка в поле (необязательно)' });
  const nodes = [field('Подсказка', ph)];
  let collectAnswer = () => null;
  if (variant === 'short') {
    const acc = inp((a.accepted || []).join(' | '), { placeholder: 'Варианты через |' });
    nodes.push(field('Правильный ответ', acc, 'Необязательно; регистр и лишние пробелы не учитываются'));
    collectAnswer = () => (alts(acc.value).length ? { accepted: alts(acc.value) } : null);
  } else if (variant === 'number') {
    const val = inp(a.value ?? '', { inputmode: 'decimal' }), tol = inp(a.tolerance ?? '', { inputmode: 'decimal', placeholder: '0' });
    nodes.push(el('div', { class: 'grid2' }, field('Правильное число', val, 'Необязательно'), field('Погрешность', tol)));
    collectAnswer = () => (val.value.trim() ? { value: val.value, tolerance: tol.value || 0 } : null);
  } else {
    let max = null;
    if (variant === 'blocks') { max = inp(d.max_blocks ?? 5, { inputmode: 'numeric' }); nodes.push(field('Максимум блоков', max)); }
    nodes.push(el('p', { class: 'hint', text: 'Развёрнутый ответ проверяет преподаватель.' }));
    return { node: el('div', { class: 'stack-sm' }, nodes), collect: () => ({ data: { placeholder: ph.value, ...(max ? { max_blocks: Number(max.value) || 5 } : {}) }, answer: null }) };
  }
  return { node: el('div', { class: 'stack-sm' }, nodes), collect: () => ({ data: { placeholder: ph.value }, answer: collectAnswer() }) };
}

/* ---------- 5. Упорядочивание ---------- */
function edOrdering(variant, task, key = 'items', label = 'Элементы в правильном порядке') {
  const area = ta((task.data?.[key] || []).map(x => x.text).join('\n'), 5, { placeholder: 'Первый\nВторой\nТретий' });
  const auto = autoBox(task.id ? !!task.answer : true, 'Проверять порядок автоматически');
  return {
    node: el('div', { class: 'stack-sm' }, field(label, area, 'По одному в строке; ученик получит их перемешанными'), auto.node),
    collect: () => ({ data: { [key]: lines(area.value).map((t, i) => ({ id: 'i' + (i + 1), text: t })) }, answer: auto.box.checked ? { enabled: true } : null }),
  };
}

/* ---------- 6. Классификация ---------- */
function edCategorize(variant, task) {
  const d = task.data || {}, map = task.answer?.map || {};
  const catName = new Map((d.categories || []).map(c => [c.id, c.text]));
  const cats = ta((d.categories || []).map(c => c.text).join('\n') || (variant === 'two' ? 'Категория 1\nКатегория 2' : ''), 3, { placeholder: 'Категория по одной в строке' });
  const items = ta((d.items || []).map(i => i.text + ((map[i.id] || []).length ? ' => ' + map[i.id].map(id => catName.get(id)).join(', ') : '')).join('\n'), 6,
    { placeholder: 'Яблоко => Фрукты\nМорковь => Овощи' });
  return {
    node: el('div', { class: 'grid2' }, field('Категории', cats, variant === 'two' ? 'Ровно две' : variant === 'many' ? 'Три и более' : ''),
      field('Элементы', items, variant === 'multi' ? 'Правильные категории после «=>» через запятую (необязательно)' : 'Правильная категория после «=>» (необязательно)')),
    collect: () => {
      const cs = lines(cats.value).map((t, i) => ({ id: 'c' + (i + 1), text: t }));
      const byName = new Map(cs.map(c => [c.text.toLowerCase(), c.id]));
      const answer = {}; let any = false;
      const its = lines(items.value).map((line, i) => {
        const [text, right] = line.split('=>');
        const id = 'i' + (i + 1);
        answer[id] = (right ? right.split(',').map(s => byName.get(s.trim().toLowerCase())).filter(Boolean) : []);
        if (answer[id].length) any = true;
        return { id, text: text.trim() };
      });
      return { data: { items: its, categories: cs }, answer: any ? { map: answer } : null };
    },
  };
}

/* ---------- 7–8. Рабочая область с элементами ---------- */
function parsePoints(text, prefix) {
  return lines(text).map((line, i) => {
    const star = line.startsWith('*');
    const [label, x, y] = line.replace(/^\*/, '').split(';').map(s => s.trim());
    return { id: prefix + (i + 1), text: label, x: clamp(x, 10 + (i * 17) % 80), y: clamp(y, 15 + Math.floor(i / 5) * 20 % 70), star };
  });
}
const clamp = (v, d) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : d; };
function parseEdges(text, nodes) {
  const ids = nodes.map(n => n.id);
  return lines(text).map(l => l.split(/\s*(?:->|→|-|—)\s*/).map(s => ids[Number(s) - 1])).filter(e => e.length === 2 && e[0] && e[1] && e[0] !== e[1]);
}
function pointsPreview(area, getImage, onClick) {
  const box = el('div', { class: 'canvas clickable small' });
  const draw = () => {
    const pts = parsePoints(area.value, 'p');
    const img = getImage();
    box.replaceChildren(...(img ? [el('img', { src: img, alt: '', draggable: 'false', referrerpolicy: 'no-referrer' })] : []),
      ...pts.map((p, i) => el('span', { class: 'node static-node' + (p.star ? ' selected' : ''), style: at(p.x, p.y), text: `${i + 1}. ${p.text}` })));
  };
  box.addEventListener('click', (e) => {
    const r = box.getBoundingClientRect();
    onClick(Math.round((e.clientX - r.left) / r.width * 100), Math.round((e.clientY - r.top) / r.height * 100));
    draw();
  });
  area.addEventListener('input', draw);
  draw();
  return { box, draw };
}

function edSelection(variant, task) {
  const d = task.data || {}, a = task.answer || {};
  const image = inp(d.image, { placeholder: 'https://… (необязательно)' });
  const nodes = [field('Фоновое изображение', image)];
  if (variant === 'position') {
    const r = a.region || {};
    const ins = ['x', 'y', 'w', 'h'].map(k => inp(r[k] ?? '', { inputmode: 'decimal', 'aria-label': k }));
    const rect = el('span', { class: 'region' });
    const box = el('div', { class: 'canvas clickable small' });
    let first = null;
    const draw = () => {
      const [x, y, w, h] = ins.map(i => parseFloat(i.value));
      box.replaceChildren(...(image.value ? [el('img', { src: image.value, alt: '', referrerpolicy: 'no-referrer' })] : []), rect);
      rect.hidden = ![x, y, w, h].every(Number.isFinite);
      Object.assign(rect.style, { left: x + '%', top: y + '%', width: w + '%', height: h + '%' });
    };
    box.addEventListener('click', (e) => {
      const b = box.getBoundingClientRect();
      const p = { x: Math.round((e.clientX - b.left) / b.width * 100), y: Math.round((e.clientY - b.top) / b.height * 100) };
      if (!first) { first = p; toast('Теперь нажмите противоположный угол области'); return; }
      const vals = [Math.min(first.x, p.x), Math.min(first.y, p.y), Math.abs(p.x - first.x), Math.abs(p.y - first.y)];
      ins.forEach((i, k) => (i.value = vals[k])); first = null; draw();
    });
    ins.forEach(i => i.addEventListener('input', draw)); image.addEventListener('change', draw);
    draw();
    nodes.push(el('p', { class: 'hint', text: 'Правильная область (в процентах). Нажмите на два противоположных угла на поле ниже или введите вручную. Пустые значения — без автопроверки.' }),
      el('div', { class: 'grid4' }, ['X', 'Y', 'Ширина', 'Высота'].map((l, k) => field(l, ins[k]))), box);
    return { node: el('div', { class: 'stack-sm' }, nodes), collect: () => {
      const v = ins.map(i => i.value.trim());
      return { data: { image: image.value }, answer: v.every(Boolean) ? { region: { x: v[0], y: v[1], w: v[2], h: v[3] } } : null };
    } };
  }
  const els = d.elements || [];
  let initial;
  if (variant === 'place_labels') initial = els.map(e => `${a.map?.[e.id] ?? e.text}; ${e.x}; ${e.y}`);
  else if (variant === 'name') initial = els.map(e => `${(a.names?.[e.id] || [e.text]).join(' | ')}; ${e.x}; ${e.y}`);
  else initial = els.map(e => `${(a.selected || []).includes(e.id) ? '*' : ''}${e.text}; ${e.x}; ${e.y}`);
  const area = ta(initial.join('\n'), 5, { class: 'mono' });
  const help = {
    one: 'Строка: «Подпись; x; y» (x, y — проценты). Звёздочка в начале — правильный элемент.',
    many: 'Строка: «Подпись; x; y». Звёздочкой отметьте правильные элементы.',
    scheme: 'Строка: «Блок; x; y». Звёздочкой отметьте правильные блоки.',
    place_labels: 'Строка: «Правильная метка; x; y» — позиция и метка, которую туда нужно поместить.',
    name: 'Строка: «Правильная подпись | вариант; x; y». Ученик видит только номер.',
  }[variant];
  const preview = pointsPreview(area, () => image.value, (x, y) => { area.value = (area.value.trim() ? area.value.trim() + '\n' : '') + `Элемент; ${x}; ${y}`; });
  image.addEventListener('change', preview.draw);
  nodes.push(field('Элементы', area, help + ' Нажмите на поле ниже, чтобы добавить элемент в этой точке.'), preview.box);
  let edges = null, extra = null, auto = null;
  if (variant === 'scheme') {
    const idx = new Map(els.map((e, i) => [e.id, i + 1]));
    edges = ta((d.edges || []).map(([x, y]) => `${idx.get(x)} -> ${idx.get(y)}`).join('\n'), 3, { class: 'mono', placeholder: '1 -> 2' });
    nodes.push(field('Связи схемы (для отображения)', edges, 'Номера блоков: «1 -> 2»'));
  }
  if (variant === 'place_labels') {
    const used = new Set(Object.values(a.map || {}));
    extra = ta((d.labels || []).filter(l => !used.has(l)).join('\n'), 2, { placeholder: 'Лишние метки по одной в строке' });
    nodes.push(field('Дополнительные метки', extra, 'Необязательно'));
  }
  if (variant === 'place_labels' || variant === 'name') { auto = autoBox(task.id ? !!task.answer : true); nodes.push(auto.node); }
  return {
    node: el('div', { class: 'stack-sm' }, nodes),
    collect: () => {
      const pts = parsePoints(area.value, 'e');
      if (variant === 'place_labels') {
        const labels = [...new Set([...pts.map(p => p.text), ...lines(extra.value)])];
        const map = Object.fromEntries(pts.map(p => [p.id, p.text]));
        return { data: { image: image.value, elements: pts.map((p, i) => ({ id: p.id, text: 'Позиция ' + (i + 1), x: p.x, y: p.y })), labels }, answer: auto.box.checked ? { map } : null };
      }
      if (variant === 'name') {
        const names = Object.fromEntries(pts.map(p => [p.id, alts(p.text)]));
        return { data: { image: image.value, elements: pts.map((p, i) => ({ id: p.id, text: 'Элемент ' + (i + 1), x: p.x, y: p.y })) }, answer: auto.box.checked ? { names } : null };
      }
      const data = { image: image.value, elements: pts.map(({ id, text, x, y }) => ({ id, text, x, y })) };
      if (edges) data.edges = parseEdges(edges.value, pts);
      const selected = pts.filter(p => p.star).map(p => p.id);
      return { data, answer: selected.length ? { selected } : null };
    },
  };
}

function edConnecting(variant, task) {
  const d = task.data || {};
  const ns = d.nodes || [];
  const idx = new Map(ns.map((n, i) => [n.id, i + 1]));
  const arrow = variant === 'directed' ? ' -> ' : ' - ';
  const area = ta(ns.map(n => `${n.text}; ${n.x}; ${n.y}`).join('\n'), 5, { class: 'mono', placeholder: 'Узел A; 20; 30\nУзел B; 70; 60' });
  const edges = ta((task.answer?.edges || []).map(([a, b]) => idx.get(a) + arrow + idx.get(b)).join('\n'), 3, { class: 'mono', placeholder: '1' + arrow + '2' });
  const preview = pointsPreview(area, () => '', (x, y) => { area.value = (area.value.trim() ? area.value.trim() + '\n' : '') + `Узел; ${x}; ${y}`; });
  return {
    node: el('div', { class: 'stack-sm' },
      field('Узлы', area, 'Строка: «Подпись; x; y» (проценты). Нажмите на поле ниже, чтобы добавить узел.'), preview.box,
      field('Правильные связи', edges, `Номера узлов, по одной связи в строке: «1${arrow}2». Необязательно.`)),
    collect: () => {
      const pts = parsePoints(area.value, 'n');
      const es = parseEdges(edges.value, pts);
      return { data: { nodes: pts.map(({ id, text, x, y }) => ({ id, text, x, y })) }, answer: es.length ? { edges: es } : null };
    },
  };
}

/* ---------- 9. Редактирование ---------- */
function edEditing(variant, task) {
  if (variant === 'reorder') return edOrdering(variant, task, 'lines', 'Строки в правильном порядке');
  const d = task.data || {}, a = task.answer || {};
  if (variant === 'highlight' || variant === 'delete') {
    const words = d.tokens || [];
    const marked = new Set(a.indices || []);
    const src = ta(words.map((w, i) => (marked.has(i) ? `[${w}]` : w)).join(' '), 4, { placeholder: 'Мама мыла [рамма] раму' });
    return {
      node: field('Текст', src, variant === 'highlight' ? 'Слова с ошибками возьмите в квадратные скобки (необязательно).' : 'Лишние слова возьмите в квадратные скобки (необязательно).'),
      collect: () => {
        const toks = src.value.split(/\s+/).filter(Boolean);
        const indices = toks.map((t, i) => (/^\[.*\]$/.test(t) ? i : -1)).filter(i => i >= 0);
        return { data: { text: toks.map(t => t.replace(/^\[(.*)\]$/, '$1')).join(' ') }, answer: indices.length ? { indices } : null };
      },
    };
  }
  const src = ta(d.text, 4), target = ta(a.text, 4);
  const hint = { rewrite: 'Ученик правит текст целиком.', replace: 'Ученик заменяет отдельные слова.', insert: 'Ученик вставляет пропущенные слова между существующими.' }[variant];
  return {
    node: el('div', { class: 'grid2' }, field('Исходный текст', src, hint), field('Правильный итоговый текст', target, 'Необязательно')),
    collect: () => ({ data: { text: src.value }, answer: target.value.trim() ? { text: target.value } : null }),
  };
}

const EDITORS = { choice: edChoice, matching: edMatching, fill: edFill, open: edOpen, ordering: edOrdering, categorize: edCategorize, selection: edSelection, connecting: edConnecting, editing: edEditing };

/* Карточка задания в конструкторе. */
function taskEditor(task, { onRemove, onMove, index, total }) {
  const state = { kind: task.kind || 'choice', variant: task.variant || 'single', id: task.id };
  const kindSel = el('select', { 'aria-label': 'Тип задания' }, Object.entries(KIND_NAMES).map(([k, n]) => el('option', { value: k, text: n, selected: k === state.kind })));
  const varSel = el('select', { 'aria-label': 'Вариант задания' });
  const prompt = ta(task.prompt, 2, { placeholder: 'Текст вопроса или инструкции' });
  const points = inp(task.points ?? 1, { inputmode: 'decimal', class: 'points' });
  const holder = el('div', { class: 'ed-specific' });
  const previewBox = el('div', { class: 'preview-box', hidden: true });
  let editor;
  const fillVariants = () => varSel.replaceChildren(...Object.entries(VARIANT_NAMES[state.kind]).map(([v, n]) => el('option', { value: v, text: n, selected: v === state.variant })));
  const build = (source) => { editor = EDITORS[state.kind](state.variant, source); holder.replaceChildren(editor.node); previewBox.hidden = true; };
  kindSel.onchange = () => { state.kind = kindSel.value; state.variant = Object.keys(VARIANT_NAMES[state.kind])[0]; fillVariants(); build({}); };
  varSel.onchange = () => {
    let source = {};
    try { const c = editor.collect(); source = { id: state.id, data: c.data, answer: c.answer }; } catch {}
    state.variant = varSel.value;
    try { build(source); } catch { build({}); }
  };
  fillVariants();
  build(task);
  const card = {
    collect: () => {
      const c = editor.collect();
      return { id: state.id, kind: state.kind, variant: state.variant, prompt: prompt.value, points: Number(String(points.value).replace(',', '.')) || 0, data: c.data, answer: c.answer };
    },
  };
  const togglePreview = () => {
    if (!previewBox.hidden) { previewBox.hidden = true; return; }
    const t = card.collect();
    const data = { ...t.data };
    if (t.kind === 'editing' && data.text) data.tokens = data.text.split(/\s+/).filter(Boolean);
    previewBox.replaceChildren(el('div', { class: 'cap', text: 'Так задание увидит ученик' }), el('p', { class: 'task-prompt', text: t.prompt }), renderTask({ ...t, data }, {}));
    previewBox.hidden = false;
  };
  card.node = el('section', { class: 'task-card editor' },
    el('div', { class: 'task-head' }, el('span', { class: 'task-num', text: index + 1 }),
      el('div', { class: 'grow row' }, kindSel, varSel),
      el('span', { class: 'row nowrap' },
        ibtn({ icon: 'eye', tip: 'Предпросмотр', onclick: togglePreview }),
        ibtn({ icon: 'up', tip: 'Выше', onclick: () => onMove(-1), disabled: index === 0 }),
        ibtn({ icon: 'down', tip: 'Ниже', onclick: () => onMove(1), disabled: index === total - 1 }),
        ibtn({ icon: 'trash', tip: 'Удалить задание', danger: true, onclick: onRemove }))),
    el('div', { class: 'grid-prompt' }, field('Вопрос', prompt), field('Баллы', points, 'За верный ответ')),
    holder, previewBox);
  return card;
}
