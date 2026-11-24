'use strict';
/* Оболочка, маршрутизация по hash и страницы. */

const main = document.getElementById('main');
const nav = document.getElementById('nav');
const actions = document.getElementById('header-actions');
let renderToken = 0;
let leaveGuard = null; // возвращает текст предупреждения, если есть несохранённые изменения

/* ---------- тема ---------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch {}
}
applyTheme((() => { try { return localStorage.getItem('theme') || 'dark'; } catch { return 'dark'; } })());

/* ---------- шапка ---------- */
function drawHeader(route) {
  const u = auth.user;
  const links = !u ? [] : u.role === 'teacher'
    ? [['#/tests', 'Мои тесты', 'post'], ['#/students', 'Ученики', 'user']]
    : [['#/available', 'Тесты', 'post'], ['#/my-results', 'Мои результаты', 'chart']];
  const current = (href) => route === href.slice(1) || route.startsWith(href.slice(1) + '/') ||
    (href === '#/tests' && route.startsWith('/results/')) || (href === '#/available' && route.startsWith('/take/'));
  nav.replaceChildren(...links.map(([href, label, ic]) => el('a', { href, 'data-tip': label, 'aria-current': current(href) ? 'page' : null }, icon(ic), el('span', { class: 'nav-label', text: label }))));
  const dark = document.documentElement.dataset.theme !== 'light';
  actions.replaceChildren(
    ibtn({ icon: dark ? 'sun' : 'moon', tip: dark ? 'Светлая тема' : 'Тёмная тема', onclick: () => { applyTheme(dark ? 'light' : 'dark'); drawHeader(route); } }),
    u ? el('details', { class: 'usermenu' },
      el('summary', { class: 'btn ghost small' }, icon('user'), el('span', { class: 'user-name', text: u.full_name })),
      el('div', { class: 'menu-panel' },
        el('div', { class: 'menu-who' }, el('strong', { text: u.full_name }), el('span', { class: 'muted small', text: `${u.username} · ${u.role === 'teacher' ? 'преподаватель' : 'ученик'}` })),
        el('hr'),
        el('button', { type: 'button', onclick: logout }, icon('logout'), 'Выйти'))) : '');
}

function logout() { auth.token = ''; auth.user = null; location.hash = '#/login'; }

/* ---------- маршрутизация ---------- */
const ROUTES = [
  [/^\/login$/, pageLogin, null], [/^\/register$/, pageRegister, null],
  [/^\/tests$/, pageTeacherTests, 'teacher'], [/^\/tests\/new$/, pageTestEditor, 'teacher'],
  [/^\/tests\/(\d+)\/edit$/, pageTestEditor, 'teacher'], [/^\/tests\/(\d+)$/, pageTestOverview, 'teacher'],
  [/^\/results\/(\d+)$/, pageTeacherResult, 'teacher'], [/^\/students$/, pageStudents, 'teacher'],
  [/^\/available$/, pageAvailable, 'student'], [/^\/take\/(\d+)$/, pageTake, 'student'],
  [/^\/my-results$/, pageMyResults, 'student'], [/^\/my-results\/(\d+)$/, pageMyResult, 'student'],
];

let currentRoute = null, skipGuard = false;
async function router() {
  const route = (location.hash || '#/').slice(1);
  if (skipGuard) { skipGuard = false; return; }
  if (leaveGuard && leaveGuard() && currentRoute !== null && route !== currentRoute) {
    const leave = await askConfirm('Уйти со страницы?', leaveGuard(), { okText: 'Уйти', danger: true, cancelText: 'Остаться' });
    if (!leave) { skipGuard = true; location.hash = '#' + currentRoute; return; }
  }
  leaveGuard = null;
  currentRoute = route;
  if (auth.token && !auth.user) {
    try { auth.user = await api('/auth/me'); } catch { auth.token = ''; }
  }
  const home = !auth.user ? '/login' : auth.user.role === 'teacher' ? '/tests' : '/available';
  const match = ROUTES.map(([re, fn, role]) => [route.match(re), fn, role]).find(([m]) => m);
  if (!match || (match[2] && match[2] !== auth.user?.role) || (!match[2] && auth.user)) { location.replace('#' + home); return; }
  drawHeader(route);
  const token = ++renderToken;
  const skeleton = setTimeout(() => { if (token === renderToken) main.replaceChildren(el('div', { class: 'skeleton tall' })); }, 350);
  try {
    const node = await match[1](...match[0].slice(1));
    if (token !== renderToken) return;
    main.replaceChildren(node);
    document.title = (main.querySelector('h1')?.textContent || 'Тестирование') + ' · Тестирование';
    window.scrollTo(0, 0);
  } catch (error) {
    if (token !== renderToken) return;
    main.replaceChildren(el('div', { class: 'notice error' }, error.message || 'Ошибка загрузки'),
      el('p', {}, el('a', { href: '#' + home, text: 'На главную' })));
  } finally { clearTimeout(skeleton); }
}
window.addEventListener('hashchange', router);
window.addEventListener('beforeunload', (e) => { if (leaveGuard && leaveGuard()) { e.preventDefault(); e.returnValue = ''; } });

const head = (title, lead, ...extra) => el('div', { class: 'toolbar' }, el('div', {}, el('h1', { text: title }), lead ? el('p', { class: 'muted lead', text: lead }) : null), extra.length ? el('div', { class: 'row' }, extra) : null);
const empty = (text, ...extra) => el('div', { class: 'empty' }, el('p', { class: 'muted', text }), ...extra);
async function busy(button, fn) {
  button.disabled = true;
  try { return await fn(); } finally { button.disabled = false; }
}

/* ---------- вход и регистрация ---------- */
function pageLogin() {
  const err = el('p', { class: 'error-text', role: 'alert' });
  const username = el('input', { type: 'text', name: 'username', autocomplete: 'username', required: true, maxlength: 64 });
  const password = el('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true, maxlength: 72 });
  const submit = el('button', { type: 'submit', class: 'btn primary', text: 'Войти' });
  const form = el('form', { class: 'form-card form-narrow stack-sm', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    await busy(submit, async () => {
      try {
        const res = await api('/auth/login', { method: 'POST', body: { username: username.value.trim(), password: password.value } });
        auth.token = res.access_token; auth.user = res.user;
        location.hash = res.user.role === 'teacher' ? '#/tests' : '#/available';
      } catch (error) { err.textContent = error.message; }
    });
  } }, el('h1', { text: 'Вход' }), el('label', {}, 'Логин', username), el('label', {}, 'Пароль', password), err, submit,
    el('p', { class: 'muted small' }, 'Нет учётной записи? ', el('a', { href: '#/register', text: 'Зарегистрироваться' })));
  setTimeout(() => username.focus(), 0);
  return form;
}

function pageRegister() {
  const err = el('p', { class: 'error-text', role: 'alert' });
  const fullName = el('input', { type: 'text', required: true, maxlength: 120, autocomplete: 'name' });
  const username = el('input', { type: 'text', required: true, minlength: 3, maxlength: 64, pattern: '[A-Za-z0-9_.\\-]+', autocomplete: 'username' });
  const password = el('input', { type: 'password', required: true, minlength: 6, maxlength: 72, autocomplete: 'new-password' });
  let role = 'student';
  const roleBtns = el('div', { class: 'binary', role: 'radiogroup', 'aria-label': 'Роль' });
  const drawRoles = () => roleBtns.replaceChildren(...[['student', 'Ученик'], ['teacher', 'Преподаватель']].map(([v, t]) =>
    el('button', { type: 'button', class: 'binary-opt', 'aria-pressed': role === v ? 'true' : 'false', text: t, onclick: () => { role = v; drawRoles(); } })));
  drawRoles();
  const submit = el('button', { type: 'submit', class: 'btn primary', text: 'Создать учётную запись' });
  return el('form', { class: 'form-card form-narrow stack-sm', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    await busy(submit, async () => {
      try {
        await api('/auth/register', { method: 'POST', body: { full_name: fullName.value, username: username.value.trim(), password: password.value, role } });
        const res = await api('/auth/login', { method: 'POST', body: { username: username.value.trim(), password: password.value } });
        auth.token = res.access_token; auth.user = res.user;
        toast('Учётная запись создана', 'ok');
        location.hash = role === 'teacher' ? '#/tests' : '#/available';
      } catch (error) { err.textContent = error.message; }
    });
  } }, el('h1', { text: 'Регистрация' }),
    el('label', {}, 'Роль', roleBtns),
    el('label', {}, 'Имя и фамилия', fullName),
    el('label', {}, 'Логин', username, el('span', { class: 'hint', text: 'Латиница, цифры, «_ . -», от 3 символов' })),
    el('label', {}, 'Пароль', password, el('span', { class: 'hint', text: 'Не короче 6 символов' })), err, submit,
    el('p', { class: 'muted small' }, 'Уже есть учётная запись? ', el('a', { href: '#/login', text: 'Войти' })));
}

/* ---------- преподаватель ---------- */
async function pageTeacherTests() {
  const { items } = await api('/teacher/tests');
  const add = el('a', { class: 'btn primary', href: '#/tests/new' }, icon('add'), 'Создать тест');
  if (!items.length) return el('div', {}, head('Мои тесты', 'Создавайте тесты и выдавайте доступ ученикам'), empty('Тестов пока нет.', add));
  return el('div', {}, head('Мои тесты', 'Создавайте тесты и выдавайте доступ ученикам', add),
    el('div', { class: 'cards' }, items.map(t => el('article', { class: 'tcard' },
      el('h2', {}, el('a', { class: 'card-link', href: `#/tests/${t.id}`, text: t.title })),
      t.description ? el('p', { class: 'muted clamp2', text: markdownPlain(t.description) }) : null,
      el('div', { class: 'meta-row' },
        el('span', { text: `${t.task_count} ${plural(t.task_count, 'задание', 'задания', 'заданий')}` }),
        el('span', { text: `${fmtNum(t.max_points)} б. автопроверки` }),
        el('span', { text: `доступ: ${t.access_count}` }), el('span', { text: `попыток: ${t.attempt_count}` }),
        el('span', { class: 'pill pill-gray', text: 'версия ' + t.version })),
      el('div', { class: 'card-actions' },
        ibtn({ icon: 'edit', tip: 'Изменить', href: `#/tests/${t.id}/edit` }),
        ibtn({ icon: 'open', tip: 'Доступ и результаты', href: `#/tests/${t.id}` }))))));
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}

async function pageTestEditor(id) {
  const test = id ? await api(`/teacher/tests/${id}`) : { title: '', description: '', tasks: [], good_percent: 60, excellent_percent: 85 };
  const title = el('input', { type: 'text', maxlength: 200, value: test.title, required: true });
  const description = el('textarea', { rows: 3, maxlength: 20000, value: test.description });
  const good = el('input', { type: 'number', min: 1, max: 99, value: test.good_percent });
  const excellent = el('input', { type: 'number', min: 2, max: 100, value: test.excellent_percent });
  const list = el('div', { class: 'stack' });
  const err = el('div', { class: 'notice error', hidden: true, role: 'alert' });
  let cards = [];
  let snapshot = '';
  const collectAll = () => ({ title: title.value, description: description.value, good_percent: Number(good.value), excellent_percent: Number(excellent.value), tasks: cards.map(c => c.collect()) });
  const draw = () => {
    const tasks = cards.map(c => { try { return c.collect(); } catch { return {}; } });
    cards = tasks.map((t, i) => taskEditor(t, {
      index: i, total: tasks.length,
      onRemove: async () => { if (await askConfirm('Удалить задание?', `Задание ${i + 1} будет удалено из теста после сохранения.`, { okText: 'Удалить', danger: true })) { cards.splice(i, 1); draw(); } },
      onMove: (d) => { const j = i + d; [cards[i], cards[j]] = [cards[j], cards[i]]; draw(); },
    }));
    list.replaceChildren(...cards.map(c => c.node), ...(cards.length ? [] : [empty('Добавьте первое задание')]));
  };
  cards = test.tasks.map(t => ({ collect: () => t }));
  draw();
  setTimeout(() => { try { snapshot = JSON.stringify(collectAll()); } catch {} }, 0);
  leaveGuard = () => { try { return JSON.stringify(collectAll()) !== snapshot ? 'Есть несохранённые изменения. Уйти со страницы?' : ''; } catch { return ''; } };
  const addTask = () => { cards.push({ collect: () => ({ kind: 'choice', variant: 'single', points: 1, prompt: '' }) }); draw(); cards.at(-1).node.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  const save = el('button', { type: 'button', class: 'btn primary' }, icon('check'), 'Сохранить');
  save.onclick = () => busy(save, async () => {
    err.hidden = true;
    try {
      const body = collectAll();
      const problem = !body.title.trim() ? 'Укажите название теста.' : !body.tasks.length ? 'Добавьте хотя бы одно задание.'
        : body.tasks.findIndex(t => !String(t.prompt || '').trim()) >= 0 ? `Задание ${body.tasks.findIndex(t => !String(t.prompt || '').trim()) + 1}. Заполните вопрос.` : '';
      if (problem) { err.textContent = problem; err.hidden = false; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if (id && !(await askConfirm('Сохранить новую версию теста?', 'После изменения ученики перестанут видеть свои прежние результаты по этому тесту.', { okText: 'Сохранить' }))) return;
      const saved = await api(id ? `/teacher/tests/${id}` : '/teacher/tests', { method: id ? 'PUT' : 'POST', body });
      snapshot = JSON.stringify(collectAll());
      leaveGuard = null;
      toast('Тест сохранён', 'ok');
      location.hash = `#/tests/${saved.id}`;
    } catch (error) { err.textContent = error.message; err.hidden = false; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });
  return el('div', { class: 'stack' },
    head(id ? 'Редактирование теста' : 'Новый тест', id ? 'Сохранение создаёт новую версию теста' : 'Соберите тест из заданий разных типов',
      el('a', { class: 'btn ghost', href: id ? `#/tests/${id}` : '#/tests', text: 'Отмена' }), save),
    el('section', { class: 'form-card stack-sm' },
      el('label', {}, 'Название', title), el('label', {}, 'Описание', mdToolbar(description), description, el('span', { class: 'hint', text: 'Поддерживается Markdown' })),
      el('div', { class: 'grid2' },
        el('label', {}, 'Порог «хорошо», %', good, el('span', { class: 'hint', text: 'Ниже — «удовлетворительно»' })),
        el('label', {}, 'Порог «замечательно», %', excellent)),
      el('p', { class: 'hint', text: 'Оценка выставляется автоматически по доле баллов за задания с правильным ответом. Задания без правильного ответа оценивает преподаватель.' })),
    err, list,
    el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn ghost', onclick: addTask }, icon('add'), 'Добавить задание')));
}

async function pageTestOverview(id) {
  const [test, access, results] = await Promise.all([api(`/teacher/tests/${id}`), api(`/teacher/tests/${id}/access`), api(`/teacher/tests/${id}/results`)]);
  const accessList = el('div', { class: 'table-wrap' });
  const drawAccess = () => accessList.replaceChildren(access.items.length ? el('table', {},
    el('thead', {}, el('tr', {}, el('th', { text: 'Ученик' }), el('th', { text: 'Попыток' }), el('th', { text: 'Доступ' }))),
    el('tbody', {}, access.items.map(s => el('tr', {},
      el('td', {}, el('div', { text: s.full_name }), el('div', { class: 'muted small', text: s.username })),
      el('td', { text: s.attempts }),
      el('td', {}, el('label', { class: 'switch' }, el('input', { type: 'checkbox', role: 'switch', checked: s.enabled, 'aria-label': 'Доступ для ' + s.full_name,
        onchange: async (e) => {
          const box = e.target; box.disabled = true;
          try { Object.assign(s, await api(`/teacher/tests/${id}/access/${s.student_id}`, { method: 'PUT', body: { enabled: box.checked } })); toast(box.checked ? 'Доступ открыт' : 'Доступ закрыт', 'ok'); }
          catch (error) { box.checked = !box.checked; toast(error.message, 'error'); }
          finally { box.disabled = false; }
        } }), el('span', { class: 'switch-ui' }))))))) : el('p', { class: 'muted pad', text: 'Учеников пока нет. Они появятся после регистрации.' }));
  drawAccess();
  const setAll = async (enabled) => {
    for (const s of access.items.filter(x => x.enabled !== enabled)) {
      try { Object.assign(s, await api(`/teacher/tests/${id}/access/${s.student_id}`, { method: 'PUT', body: { enabled } })); } catch (error) { toast(error.message, 'error'); break; }
    }
    drawAccess();
  };
  const del = el('button', { type: 'button', class: 'btn danger' }, icon('trash'), 'Удалить тест');
  del.onclick = () => busy(del, async () => {
    if (!(await askConfirm(`Удалить тест «${test.title}»?`, 'Все результаты по нему будут удалены безвозвратно.', { okText: 'Удалить', danger: true }))) return;
    try { await api(`/teacher/tests/${id}`, { method: 'DELETE' }); toast('Тест удалён', 'ok'); location.hash = '#/tests'; } catch (error) { toast(error.message, 'error'); }
  });
  return el('div', { class: 'stack' },
    head(test.title, `Версия ${test.version} · ${test.tasks.length} ${plural(test.tasks.length, 'задание', 'задания', 'заданий')} · пороги: хорошо ${test.good_percent}%, замечательно ${test.excellent_percent}%`,
      el('a', { class: 'btn ghost', href: `#/tests/${id}/edit` }, icon('edit'), 'Изменить'), del),
    el('section', { class: 'stack-sm' }, el('div', { class: 'toolbar slim' }, el('h2', { text: 'Доступ учеников' }),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn small ghost', onclick: () => setAll(true), text: 'Открыть всем' }), el('button', { type: 'button', class: 'btn small ghost', onclick: () => setAll(false), text: 'Закрыть всем' }))), accessList),
    el('section', { class: 'stack-sm' }, el('h2', { text: 'Результаты' }), resultsTable(results.items, true)));
}

function resultsTable(items, teacher) {
  if (!items.length) return el('p', { class: 'muted', text: 'Результатов пока нет.' });
  return el('div', { class: 'table-wrap' }, el('table', {},
    el('thead', {}, el('tr', {}, el('th', { text: teacher ? 'Ученик' : 'Тест' }), el('th', { text: 'Дата' }), el('th', { text: 'Баллы' }), el('th', { text: 'Автооценка' }), el('th', { text: 'Оценка преподавателя' }), el('th', {}))),
    el('tbody', {}, items.map(r => el('tr', {},
      el('td', {}, el('div', { text: teacher ? r.student_name : r.test_title }), r.outdated ? el('span', { class: 'pill pill-gray', text: 'прежняя версия теста' }) : null),
      el('td', { class: 'nowrap', text: fmtDate(r.submitted_at) }),
      el('td', { class: 'nowrap', text: r.max_score ? `${fmtNum(r.score)} / ${fmtNum(r.max_score)}` : '—' }),
      el('td', {}, gradePill(r.auto_grade, 'ждёт проверки')),
      el('td', {}, r.teacher_grade ? gradePill(r.teacher_grade) : el('span', { class: 'muted', text: r.teacher_comment ? 'комментарий' : '—' })),
      el('td', {}, ibtn({ icon: 'open', tip: 'Открыть', href: teacher ? `#/results/${r.id}` : `#/my-results/${r.id}` })))))));
}

async function pageStudents() {
  const { items } = await api('/teacher/students');
  return el('div', {}, head('Ученики', 'Зарегистрированные ученики. Доступ к тестам выдаётся на странице теста.'),
    items.length ? el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', { text: 'Имя' }), el('th', { text: 'Логин' }))),
      el('tbody', {}, items.map(s => el('tr', {}, el('td', { text: s.full_name }), el('td', { class: 'muted', text: s.username })))))) : empty('Учеников пока нет.'));
}

const STATUS = { correct: ['верно', 'pill-green'], wrong: ['неверно', 'pill-red'], manual: ['проверяет преподаватель', 'pill-violet'], empty: ['нет ответа', 'pill-gray'] };

function attemptView(a, teacher) {
  const header = el('section', { class: 'form-card result-head' },
    el('div', { class: 'result-grid' },
      el('div', {}, el('div', { class: 'cap', text: 'Баллы' }), el('div', { class: 'big', text: a.max_score ? `${fmtNum(a.score)} из ${fmtNum(a.max_score)}` : '—' })),
      el('div', {}, el('div', { class: 'cap', text: 'Автооценка' }), gradePill(a.auto_grade, 'ждёт проверки')),
      el('div', {}, el('div', { class: 'cap', text: 'Оценка преподавателя' }), a.teacher_grade ? gradePill(a.teacher_grade) : el('span', { class: 'muted', text: 'нет' })),
      el('div', {}, el('div', { class: 'cap', text: 'Сдано' }), el('div', { text: fmtDate(a.submitted_at) }))),
    a.teacher_comment && !teacher ? el('div', { class: 'teacher-note' }, el('div', { class: 'cap', text: 'Комментарий преподавателя' }), el('p', { class: 'pre', text: a.teacher_comment })) : null);
  const tasks = a.tasks.map((t, i) => {
    const r = a.results[t.id] || { status: 'empty', points: 0 };
    const [label, cls] = STATUS[r.status] || STATUS.empty;
    const given = a.answers[t.id];
    return el('section', { class: 'task-card' },
      el('div', { class: 'task-head' }, el('span', { class: 'task-num', text: i + 1 }), el('div', { class: 'grow' }, el('div', { class: 'cap', text: `${KIND_NAMES[t.kind]} · ${VARIANT_NAMES[t.kind][t.variant]}` })),
        el('span', { class: `pill ${cls}`, text: label }), (t.graded ?? t.answer) && t.points ? el('span', { class: 'muted small nowrap', text: `${fmtNum(r.points)} / ${fmtNum(t.points)} б.` }) : null),
      markdownBlock(t.prompt, 'task-prompt'),
      renderTask(t, { value: given, readonly: true }),
      teacher ? el('p', { class: 'answer-key' }, el('span', { class: 'cap', text: 'Правильный ответ: ' }), describeAnswer(t)) : null);
  });
  return el('div', { class: 'stack' }, header, ...tasks);
}

async function pageTeacherResult(id) {
  const a = await api(`/teacher/results/${id}`);
  const grade = el('select', { 'aria-label': 'Оценка' }, el('option', { value: '', text: 'Без оценки' }), GRADES.map(g => el('option', { value: g, text: g, selected: a.teacher_grade === g })));
  const comment = el('textarea', { rows: 4, maxlength: 5000, value: a.teacher_comment, placeholder: 'Комментарий для ученика' });
  const save = el('button', { type: 'submit', class: 'btn primary', text: 'Сохранить оценку' });
  const review = el('form', { class: 'form-card stack-sm', onsubmit: (e) => { e.preventDefault(); busy(save, async () => {
    try { await api(`/teacher/results/${id}/review`, { method: 'PUT', body: { teacher_grade: grade.value || null, teacher_comment: comment.value } }); toast('Оценка сохранена', 'ok'); router(); }
    catch (error) { toast(error.message, 'error'); }
  }); } }, el('h2', { text: 'Оценка преподавателя' }), el('label', {}, 'Оценка', grade), el('label', {}, 'Комментарий', comment), el('div', {}, save));
  return el('div', { class: 'stack' },
    head(`${a.student_name}`, a.test_title, el('a', { class: 'btn ghost', href: `#/tests/${a.test_id}`, text: 'К тесту' })),
    a.outdated ? el('div', { class: 'notice' }, 'Тест изменён после прохождения: ученик больше не видит этот результат, подробные ответы недоступны.') : null,
    attemptView(a, true), review);
}

/* ---------- ученик ---------- */
async function pageAvailable() {
  const { items } = await api('/student/tests');
  if (!items.length) return el('div', {}, head('Тесты', 'Здесь появятся тесты, к которым преподаватель откроет доступ'), empty('Доступных тестов пока нет.'));
  return el('div', {}, head('Тесты', 'Тесты, к которым у вас есть доступ'),
    el('div', { class: 'cards' }, items.map(t => el('article', { class: 'tcard' },
      el('h2', {}, el('a', { class: 'card-link', href: `#/take/${t.id}`, text: t.title })),
      t.description ? el('p', { class: 'muted clamp2', text: markdownPlain(t.description) }) : null,
      el('div', { class: 'meta-row' }, el('span', { text: `${t.task_count} ${plural(t.task_count, 'задание', 'задания', 'заданий')}` }),
        t.my_attempts ? el('span', { text: `попыток: ${t.my_attempts}` }) : el('span', { text: 'ещё не проходили' }),
        t.my_attempts ? gradePill(t.my_last_grade, 'ждёт проверки') : null),
      el('div', { class: 'card-actions' }, el('a', { class: 'btn small primary', href: `#/take/${t.id}`, text: t.my_attempts ? 'Пройти ещё раз' : 'Начать' }))))));
}

async function pageTake(id) {
  const test = await api(`/student/tests/${id}`);
  const answers = {};
  let dirty = false;
  const progress = el('span', { class: 'muted small' });
  const updateProgress = () => { progress.textContent = `Отвечено: ${Object.keys(answers).filter(k => filled(answers[k])).length} из ${test.tasks.length}`; };
  const cards = test.tasks.map((t, i) => el('section', { class: 'task-card' },
    el('div', { class: 'task-head' }, el('span', { class: 'task-num', text: i + 1 }), el('div', { class: 'grow' }, el('div', { class: 'cap', text: VARIANT_NAMES[t.kind][t.variant] })),
      t.graded && t.points ? el('span', { class: 'muted small nowrap', text: `${fmtNum(t.points)} б.` }) : null),
    markdownBlock(t.prompt, 'task-prompt'),
    renderTask(t, { onChange: (v) => { answers[t.id] = v; dirty = true; updateProgress(); } })));
  updateProgress();
  leaveGuard = () => (dirty ? 'Ответы не отправлены. Уйти со страницы?' : '');
  const submit = el('button', { type: 'button', class: 'btn primary' }, icon('check'), 'Завершить тест');
  submit.onclick = () => busy(submit, async () => {
    const left = test.tasks.length - Object.keys(answers).filter(k => filled(answers[k])).length;
    if (!(await askConfirm('Завершить тест?', left ? `Не отвечено заданий: ${left}. После отправки изменить ответы нельзя.` : 'После отправки изменить ответы нельзя.', { okText: 'Отправить ответы' }))) return;
    try {
      const res = await api(`/student/tests/${id}/attempts`, { method: 'POST', body: { version: test.version, answers } });
      dirty = false; leaveGuard = null;
      toast('Ответы отправлены', 'ok');
      location.hash = `#/my-results/${res.id}`;
    } catch (error) { toast(error.message, 'error'); }
  });
  return el('div', { class: 'stack' }, head(test.title), test.description ? markdownBlock(test.description, 'test-desc') : '',
    ...cards, el('div', { class: 'submit-bar' }, progress, submit));
}

function filled(v) {
  if (v === null || v === undefined || v === '') return false;
  if (Array.isArray(v)) return v.some(filled);
  if (typeof v === 'object') return Object.values(v).some(filled);
  return true;
}

async function pageMyResults() {
  const { items } = await api('/student/results');
  return el('div', {}, head('Мои результаты', 'Результаты по действующим версиям тестов'), resultsTable(items, false));
}

async function pageMyResult(id) {
  const a = await api(`/student/results/${id}`);
  return el('div', { class: 'stack' }, head(a.test_title, 'Результат прохождения', el('a', { class: 'btn ghost', href: '#/my-results', text: 'Все результаты' })), attemptView(a, false));
}

router();
