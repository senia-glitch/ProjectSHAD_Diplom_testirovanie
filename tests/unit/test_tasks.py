import pytest
from app.scenarios.tasks import TaskError, auto_grade, for_student, grade_attempt, grade_task, validate_task, validate_tasks
from app.scenarios.common import sanitize_html


def T(kind, variant, data, answer=None, points=1):
    return validate_task({'id': f'{kind}-{variant}', 'kind': kind, 'variant': variant, 'prompt': 'Вопрос',
                          'points': points, 'data': data, 'answer': answer})


ITEMS = [{'id': 'a', 'text': 'Один'}, {'id': 'b', 'text': 'Два'}, {'id': 'c', 'text': 'Три'}]
NODES = [{'id': 'n1', 'text': 'A', 'x': 10, 'y': 10}, {'id': 'n2', 'text': 'B', 'x': 50, 'y': 50},
         {'id': 'n3', 'text': 'C', 'x': 90, 'y': 90}]

CASES = [
    # (task, правильный ответ, неправильный ответ)
    (T('choice', 'single', {'options': ['x', 'y', 'z']}, {'correct': [1]}), {'selected': [1]}, {'selected': [0]}),
    (T('choice', 'multiple', {'options': ['x', 'y', 'z']}, {'correct': [0, 2]}), {'selected': [2, 0]}, {'selected': [0]}),
    (T('choice', 'binary', {'options': ['Да', 'Нет']}, {'correct': [0]}), {'selected': [0]}, {'selected': [1]}),
    (T('choice', 'multi_dropdown', {'options': ['x', 'y']}, {'correct': [0, 1]}), {'selected': [0, 1]}, {'selected': [1]}),
    (T('matching', 'dropdown', {'left': ITEMS[:2], 'right': ITEMS}, {'pairs': [['a', 'b'], ['b', 'a']]}),
     {'pairs': [['b', 'a'], ['a', 'b']]}, {'pairs': [['a', 'a'], ['b', 'b']]}),
    (T('matching', 'multi', {'left': ITEMS[:2], 'right': ITEMS}, {'pairs': [['a', 'b'], ['a', 'c'], ['b', 'a']]}),
     {'pairs': [['a', 'b'], ['a', 'c'], ['b', 'a']]}, {'pairs': [['a', 'b'], ['b', 'a']]}),
    (T('fill', 'inline', {'text': 'Столица Франции — {{1}}, Англии — {{2}}', 'fields': [{'id': '1'}, {'id': '2'}]},
       {'fields': {'1': ['Париж', 'Paris'], '2': ['Лондон']}}),
     {'fields': {'1': ' paris ', '2': 'лондон'}}, {'fields': {'1': 'Париж', '2': 'Берлин'}}),
    (T('fill', 'inline_select', {'text': '2+2={{1}}', 'fields': [{'id': '1', 'options': ['3', '4']}]}, {'fields': {'1': ['4']}}),
     {'fields': {'1': '4'}}, {'fields': {'1': '3'}}),
    (T('fill', 'number', {'fields': [{'id': '1', 'label': 'π'}]}, {'fields': {'1': ['3.14']}, 'tolerance': 0.01}),
     {'fields': {'1': '3,141'}}, {'fields': {'1': '3.2'}}),
    (T('fill', 'formula', {'fields': [{'id': '1'}]}, {'fields': {'1': ['a^2 + b^2']}}),
     {'fields': {'1': 'A**2+B**2'}}, {'fields': {'1': 'a+b'}}),
    (T('fill', 'table', {'columns': ['x', 'x²'], 'rows': [['2', '{{c1}}'], ['3', '{{c2}}']], 'fields': [{'id': 'c1'}, {'id': 'c2'}]},
       {'fields': {'c1': ['4'], 'c2': ['9']}}),
     {'fields': {'c1': '4', 'c2': '9'}}, {'fields': {'c1': '4', 'c2': '6'}}),
    (T('open', 'short', {}, {'accepted': ['Пушкин']}), {'text': 'пушкин'}, {'text': 'Лермонтов'}),
    (T('open', 'number', {}, {'value': 42, 'tolerance': 0}), {'text': '42'}, {'text': '41'}),
    (T('ordering', 'vertical', {'items': ITEMS}, {}), {'order': ['a', 'b', 'c']}, {'order': ['b', 'a', 'c']}),
    (T('categorize', 'two', {'items': ITEMS, 'categories': [{'id': 'odd', 'text': 'Нечёт'}, {'id': 'even', 'text': 'Чёт'}]},
       {'map': {'a': ['odd'], 'b': ['even'], 'c': ['odd']}}),
     {'map': {'a': ['odd'], 'b': ['even'], 'c': ['odd']}}, {'map': {'a': ['even'], 'b': ['even'], 'c': ['odd']}}),
    (T('categorize', 'multi', {'items': ITEMS[:1], 'categories': [{'id': 'p', 'text': 'P'}, {'id': 'q', 'text': 'Q'}]},
       {'map': {'a': ['p', 'q']}}), {'map': {'a': ['q', 'p']}}, {'map': {'a': ['p']}}),
    (T('selection', 'many', {'elements': NODES}, {'selected': ['n1', 'n3']}), {'selected': ['n3', 'n1']}, {'selected': ['n1']}),
    (T('selection', 'position', {}, {'region': {'x': 10, 'y': 10, 'w': 20, 'h': 20}}),
     {'point': {'x': 15, 'y': 25}}, {'point': {'x': 50, 'y': 50}}),
    (T('selection', 'place_labels', {'elements': NODES[:2], 'labels': ['Сердце', 'Лёгкое']}, {'map': {'n1': 'Сердце', 'n2': 'Лёгкое'}}),
     {'map': {'n1': 'Сердце', 'n2': 'Лёгкое'}}, {'map': {'n1': 'Лёгкое', 'n2': 'Сердце'}}),
    (T('selection', 'name', {'elements': NODES[:1]}, {'names': {'n1': ['Ядро']}}), {'names': {'n1': 'ядро'}}, {'names': {'n1': 'клетка'}}),
    (T('connecting', 'network', {'nodes': NODES}, {'edges': [['n1', 'n2'], ['n2', 'n3']]}),
     {'edges': [['n2', 'n1'], ['n3', 'n2']]}, {'edges': [['n1', 'n3']]}),
    (T('connecting', 'directed', {'nodes': NODES}, {'edges': [['n1', 'n2']]}), {'edges': [['n1', 'n2']]}, {'edges': [['n2', 'n1']]}),
    (T('editing', 'highlight', {'text': 'Мама мыла раму рамой'}, {'indices': [3]}), {'indices': [3]}, {'indices': [2]}),
    (T('editing', 'replace', {'text': 'Кот спит на дивана'}, {'text': 'Кот спит на диване'}),
     {'replacements': {'3': 'диване'}}, {'replacements': {'3': 'диван'}}),
    (T('editing', 'delete', {'text': 'Он он пришёл'}, {'indices': [1]}), {'indices': [1]}, {'indices': [0, 1]}),
    (T('editing', 'insert', {'text': 'Я в школу'}, {'text': 'Я иду в школу'}), {'inserts': {'1': 'иду'}}, {'inserts': {'0': 'иду'}}),
    (T('editing', 'rewrite', {'text': 'превет мир'}, {'text': 'Привет, мир'}), {'text': 'привет,  мир'}, {'text': 'превет мир'}),
    (T('editing', 'reorder', {'lines': ITEMS}, {}), {'order': ['a', 'b', 'c']}, {'order': ['c', 'b', 'a']}),
]


@pytest.mark.parametrize('task,right,wrong', CASES, ids=[c[0]['id'] for c in CASES])
def test_grading(task, right, wrong):
    assert grade_task(task, right) == {'status': 'correct', 'points': 1.0}
    assert grade_task(task, wrong)['status'] == 'wrong'
    assert grade_task(task, None)['status'] == 'empty'


@pytest.mark.parametrize('task', [c[0] for c in CASES], ids=[c[0]['id'] for c in CASES])
def test_student_view_hides_answer(task):
    view = for_student(task, 'seed')
    assert 'answer' not in view and view['graded'] is True
    if task['kind'] == 'ordering':
        assert [i['id'] for i in view['data']['items']] != task['answer']['order']


def test_task_without_answer_is_manual_and_not_counted():
    task = T('open', 'long', {}, None, points=5)
    assert task['answer'] is None
    results, score, max_score = grade_attempt([task, CASES[0][0]], {task['id']: {'text': 'эссе'}, CASES[0][0]['id']: {'selected': [1]}})
    assert results[task['id']]['status'] == 'manual'
    assert (score, max_score) == (1.0, 1.0)


@pytest.mark.parametrize('raw', [
    {'kind': 'choice', 'variant': 'single', 'prompt': 'q', 'data': {'options': ['a']}},
    {'kind': 'choice', 'variant': 'binary', 'prompt': 'q', 'data': {'options': ['a', 'b', 'c']}},
    {'kind': 'choice', 'variant': 'single', 'prompt': 'q', 'data': {'options': ['a', 'b']}, 'answer': {'correct': [0, 1]}},
    {'kind': 'unknown', 'variant': 'x', 'prompt': 'q', 'data': {}},
    {'kind': 'choice', 'variant': 'single', 'prompt': '', 'data': {'options': ['a', 'b']}},
    {'kind': 'fill', 'variant': 'inline', 'prompt': 'q', 'data': {'text': 'нет пропусков', 'fields': [{'id': '1'}]}},
    {'kind': 'selection', 'variant': 'one', 'prompt': 'q', 'data': {'image': 'javascript:alert(1)', 'elements': NODES}},
    {'kind': 'choice', 'variant': 'single', 'prompt': 'q', 'points': -1, 'data': {'options': ['a', 'b']}},
])
def test_invalid_tasks_rejected(raw):
    with pytest.raises(TaskError):
        validate_task(raw)


def test_validate_tasks_reports_task_number():
    with pytest.raises(TaskError, match='Задание 2'):
        validate_tasks([CASES[0][0], {'kind': 'choice', 'variant': 'single', 'prompt': 'q', 'data': {}}])


def test_auto_grade_scale_minimum_satisfactory():
    assert auto_grade(0, 10, 60, 85) == 'удовлетворительно'
    assert auto_grade(6, 10, 60, 85) == 'хорошо'
    assert auto_grade(8.5, 10, 60, 85) == 'замечательно'
    assert auto_grade(0, 0, 60, 85) is None


def test_html_sanitizer_keeps_only_formatting():
    dirty = '<p onclick="x()">Привет <b>мир</b><script>alert(1)</script><a href="javascript:1">ссылка</a><img src=x onerror=1>'
    assert sanitize_html(dirty) == '<p>Привет <b>мир</b>ссылка</p>'
