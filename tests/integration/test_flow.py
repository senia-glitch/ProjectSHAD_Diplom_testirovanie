import uuid

API = '/api/v1'


def register(client, role):
    name = f'{role[:3]}_{uuid.uuid4().hex[:10]}'
    created = client.post(f'{API}/auth/register', json={'username': name, 'full_name': f'Пользователь {name}',
                                                          'password': 'secret123', 'role': role})
    assert created.status_code == 201, created.text
    token = client.post(f'{API}/auth/login', json={'username': name, 'password': 'secret123'}).json()['access_token']
    return created.json(), {'Authorization': f'Bearer {token}'}


TASKS = [
    {'id': 'q1', 'kind': 'choice', 'variant': 'single', 'prompt': '2+2?', 'points': 2,
     'data': {'options': ['3', '4']}, 'answer': {'correct': [1]}},
    {'id': 'q2', 'kind': 'ordering', 'variant': 'buttons', 'prompt': 'По возрастанию', 'points': 2,
     'data': {'items': [{'id': 'a', 'text': '1'}, {'id': 'b', 'text': '2'}, {'id': 'c', 'text': '3'}]}, 'answer': {}},
    {'id': 'q3', 'kind': 'open', 'variant': 'rich', 'prompt': 'Эссе', 'points': 0, 'data': {}},
]


def test_service_and_auth(client):
    assert client.get(f'{API}/health').json() == {'status': 'ok'}
    assert client.get(f'{API}/ready').json() == {'status': 'ready'}
    assert client.get(f'{API}/auth/me').status_code == 401
    assert client.get(f'{API}/auth/me', headers={'Authorization': 'Bearer broken'}).status_code == 401
    user, headers = register(client, 'student')
    assert client.get(f'{API}/auth/me', headers=headers).json()['role'] == 'student'
    duplicate = client.post(f'{API}/auth/register', json={'username': user['username'].upper(), 'full_name': 'X',
                                                          'password': 'secret123', 'role': 'teacher'})
    assert duplicate.status_code == 409
    assert client.post(f'{API}/auth/register', json={'username': 'adm_x1', 'full_name': 'X', 'password': 'secret123',
                                                     'role': 'admin'}).status_code == 422
    assert client.post(f'{API}/auth/login', json={'username': user['username'], 'password': 'wrong!'}).status_code == 401


def test_full_flow(client):
    teacher, th = register(client, 'teacher')
    other_teacher, oth = register(client, 'teacher')
    student, sh = register(client, 'student')
    stranger, xh = register(client, 'student')

    # Только преподаватель создаёт тест; ученик получает 403.
    body = {'title': 'Проверочная', 'description': 'Описание', 'tasks': TASKS, 'good_percent': 50, 'excellent_percent': 90}
    assert client.post(f'{API}/teacher/tests', json=body, headers=sh).status_code == 403
    assert client.post(f'{API}/teacher/tests', json=body).status_code == 401
    bad = client.post(f'{API}/teacher/tests', json=body | {'tasks': [{'kind': 'choice', 'variant': 'single', 'prompt': 'x', 'data': {}}]}, headers=th)
    assert bad.status_code == 422 and 'Задание 1' in bad.json()['error']['message']
    created = client.post(f'{API}/teacher/tests', json=body, headers=th)
    assert created.status_code == 201, created.text
    test = created.json()
    tid = test['id']
    assert client.get(f'{API}/teacher/tests/{tid}', headers=oth).status_code == 404

    # Без доступа ученик тест не видит.
    assert client.get(f'{API}/student/tests/{tid}', headers=sh).status_code == 404
    assert client.put(f'{API}/teacher/tests/{tid}/access/{student["id"]}', json={'enabled': True}, headers=oth).status_code == 404
    granted = client.put(f'{API}/teacher/tests/{tid}/access/{student["id"]}', json={'enabled': True}, headers=th)
    assert granted.json()['enabled'] is True
    assert client.put(f'{API}/teacher/tests/{tid}/access/{teacher["id"]}', json={'enabled': True}, headers=th).status_code == 404
    access = {i['student_id']: i['enabled'] for i in client.get(f'{API}/teacher/tests/{tid}/access', headers=th).json()['items']}
    assert access[student['id']] is True and access[stranger['id']] is False

    listed = client.get(f'{API}/student/tests', headers=sh).json()['items']
    assert [t['id'] for t in listed] == [tid]
    assert client.get(f'{API}/student/tests', headers=xh).json()['items'] == []

    # Ученик не получает правильных ответов.
    opened = client.get(f'{API}/student/tests/{tid}', headers=sh).json()
    assert all('answer' not in t for t in opened['tasks'])
    submit = {'version': opened['version'], 'answers': {
        'q1': {'selected': [1]}, 'q2': {'order': ['a', 'b', 'c']},
        'q3': {'html': '<b>Ответ</b><script>alert(1)</script>'}}}
    assert client.post(f'{API}/student/tests/{tid}/attempts', json=submit, headers=xh).status_code == 404
    result = client.post(f'{API}/student/tests/{tid}/attempts', json=submit, headers=sh)
    assert result.status_code == 201, result.text
    attempt = result.json()
    assert (attempt['score'], attempt['max_score'], attempt['auto_grade']) == (4.0, 4.0, 'замечательно')
    assert attempt['results']['q3']['status'] == 'manual'
    assert attempt['answers']['q3']['html'] == '<b>Ответ</b>'
    aid = attempt['id']

    wrong = client.post(f'{API}/student/tests/{tid}/attempts', headers=sh, json={'version': opened['version'], 'answers': {}})
    assert wrong.json()['auto_grade'] == 'удовлетворительно'

    # Результат видит только тот, кто проходил, и владелец теста.
    assert client.get(f'{API}/student/results/{aid}', headers=xh).status_code == 404
    assert client.get(f'{API}/teacher/results/{aid}', headers=oth).status_code == 404
    assert client.get(f'{API}/teacher/results/{aid}', headers=th).json()['tasks'][0]['answer'] == {'correct': [1]}

    # Личная оценка преподавателя под результатом.
    assert client.put(f'{API}/teacher/results/{aid}/review', headers=th,
                      json={'teacher_grade': 'отлично', 'teacher_comment': ''}).status_code == 422
    reviewed = client.put(f'{API}/teacher/results/{aid}/review', headers=th,
                          json={'teacher_grade': 'хорошо', 'teacher_comment': 'Хорошая работа'})
    assert reviewed.json()['teacher_grade'] == 'хорошо'
    mine = client.get(f'{API}/student/results/{aid}', headers=sh).json()
    assert mine['teacher_comment'] == 'Хорошая работа' and all('answer' not in t for t in mine['tasks'])

    # Отключение доступа в любой момент.
    client.put(f'{API}/teacher/tests/{tid}/access/{student["id"]}', json={'enabled': False}, headers=th)
    assert client.get(f'{API}/student/tests/{tid}', headers=sh).status_code == 404
    assert client.post(f'{API}/student/tests/{tid}/attempts', json=submit, headers=sh).status_code == 404
    client.put(f'{API}/teacher/tests/{tid}/access/{student["id"]}', json={'enabled': True}, headers=th)

    # Изменение теста скрывает прежние результаты от ученика, преподаватель видит их как устаревшие.
    updated = client.put(f'{API}/teacher/tests/{tid}', json=body | {'title': 'Проверочная 2'}, headers=th).json()
    assert updated['version'] == 2
    assert client.get(f'{API}/student/results/{aid}', headers=sh).status_code == 404
    assert client.get(f'{API}/student/results', headers=sh).json()['items'] == []
    assert client.post(f'{API}/student/tests/{tid}/attempts', json=submit, headers=sh).status_code == 409
    teacher_list = client.get(f'{API}/teacher/tests/{tid}/results', headers=th).json()['items']
    assert teacher_list and all(i['outdated'] for i in teacher_list)

    # Удаление теста удаляет его результаты.
    assert client.delete(f'{API}/teacher/tests/{tid}', headers=oth).status_code == 404
    assert client.delete(f'{API}/teacher/tests/{tid}', headers=th).status_code == 204
    assert client.get(f'{API}/teacher/results/{aid}', headers=th).status_code == 404
    assert client.get(f'{API}/student/tests', headers=sh).json()['items'] == []
