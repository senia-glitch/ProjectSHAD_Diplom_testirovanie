"""Демо-данные для локальной проверки: преподаватель, ученик, тест со всеми типами заданий.

Запуск: <python> -m scripts.seed_demo --database <имя основной БД>
Учётные записи (только для локальной демонстрации):
  преподаватель demo_teacher / demo12345
  ученик        demo_student / demo12345
Повторный запуск не создаёт дубликатов пользователей; тест добавляется заново.
"""
import argparse
import asyncio
from app.config import database_name
from core import ConflictError, run, shutdown_core, start_core
from run_infrastructure import start_infrastructure

PASSWORD = 'demo12345'
P = lambda x, y: {'x': x, 'y': y}  # noqa: E731

DEMO_TASKS = [
    {'kind': 'choice', 'variant': 'single', 'prompt': 'Сколько будет 7 × 8?', 'points': 1,
     'data': {'options': ['54', '56', '58']}, 'answer': {'correct': [1]}},
    {'kind': 'choice', 'variant': 'multiple', 'prompt': 'Отметьте простые числа.', 'points': 2,
     'data': {'options': ['2', '4', '7', '9', '11']}, 'answer': {'correct': [0, 2, 4]}},
    {'kind': 'choice', 'variant': 'binary', 'prompt': 'Вода кипит при 100 °C на уровне моря.', 'points': 1,
     'data': {'options': ['Верно', 'Неверно']}, 'answer': {'correct': [0]}},
    {'kind': 'choice', 'variant': 'multi_dropdown', 'prompt': 'Выберите млекопитающих.', 'points': 1,
     'data': {'options': ['Кит', 'Акула', 'Летучая мышь', 'Пингвин']}, 'answer': {'correct': [0, 2]}},
    {'kind': 'matching', 'variant': 'lines', 'prompt': 'Соедините страну и столицу.', 'points': 2,
     'data': {'left': [{'id': 'L1', 'text': 'Франция'}, {'id': 'L2', 'text': 'Япония'}, {'id': 'L3', 'text': 'Египет'}],
              'right': [{'id': 'R1', 'text': 'Каир'}, {'id': 'R2', 'text': 'Париж'}, {'id': 'R3', 'text': 'Токио'}]},
     'answer': {'pairs': [['L1', 'R2'], ['L2', 'R3'], ['L3', 'R1']]}},
    {'kind': 'matching', 'variant': 'drag', 'prompt': 'Перетащите термин к определению.', 'points': 2,
     'data': {'left': [{'id': 'L1', 'text': 'Существительное'}, {'id': 'L2', 'text': 'Глагол'}],
              'right': [{'id': 'R1', 'text': 'Бежать'}, {'id': 'R2', 'text': 'Дом'}, {'id': 'R3', 'text': 'Красный'}]},
     'answer': {'pairs': [['L1', 'R2'], ['L2', 'R1']]}},
    {'kind': 'fill', 'variant': 'inline', 'prompt': 'Заполните пропуски.', 'points': 2,
     'data': {'text': 'Солнце встаёт на {{1}}, а садится на {{2}}.', 'fields': [{'id': '1'}, {'id': '2'}]},
     'answer': {'fields': {'1': ['востоке'], '2': ['западе']}}},
    {'kind': 'fill', 'variant': 'formula', 'prompt': 'Запишите формулу площади круга радиуса r.', 'points': 1,
     'data': {'fields': [{'id': '1', 'label': 'S ='}]}, 'answer': {'fields': {'1': ['pi*r^2', 'π*r^2', 'pi r^2']}}},
    {'kind': 'fill', 'variant': 'table', 'prompt': 'Заполните таблицу квадратов.', 'points': 2,
     'data': {'columns': ['x', 'x²'], 'rows': [['3', '{{1}}'], ['5', '{{2}}']], 'fields': [{'id': '1'}, {'id': '2'}]},
     'answer': {'fields': {'1': ['9'], '2': ['25']}}},
    {'kind': 'open', 'variant': 'number', 'prompt': 'Сколько минут в сутках?', 'points': 1,
     'data': {}, 'answer': {'value': 1440, 'tolerance': 0}},
    {'kind': 'open', 'variant': 'rich', 'prompt': 'Кратко опишите круговорот воды в природе.', 'points': 0, 'data': {}},
    {'kind': 'ordering', 'variant': 'vertical', 'prompt': 'Расположите планеты по удалению от Солнца.', 'points': 2,
     'data': {'items': [{'id': 'i1', 'text': 'Меркурий'}, {'id': 'i2', 'text': 'Венера'}, {'id': 'i3', 'text': 'Земля'}, {'id': 'i4', 'text': 'Марс'}]},
     'answer': {'enabled': True}},
    {'kind': 'ordering', 'variant': 'slots', 'prompt': 'Разложите этапы по порядку.', 'points': 1,
     'data': {'items': [{'id': 'i1', 'text': 'Замысел'}, {'id': 'i2', 'text': 'Черновик'}, {'id': 'i3', 'text': 'Правка'}]},
     'answer': {'enabled': True}},
    {'kind': 'categorize', 'variant': 'drag', 'prompt': 'Распределите по категориям.', 'points': 2,
     'data': {'items': [{'id': 'i1', 'text': 'Яблоко'}, {'id': 'i2', 'text': 'Морковь'}, {'id': 'i3', 'text': 'Груша'}, {'id': 'i4', 'text': 'Свёкла'}],
              'categories': [{'id': 'c1', 'text': 'Фрукты'}, {'id': 'c2', 'text': 'Овощи'}]},
     'answer': {'map': {'i1': ['c1'], 'i2': ['c2'], 'i3': ['c1'], 'i4': ['c2']}}},
    {'kind': 'selection', 'variant': 'many', 'prompt': 'Выберите чётные числа.', 'points': 1,
     'data': {'elements': [{'id': 'e1', 'text': '3', **P(20, 30)}, {'id': 'e2', 'text': '8', **P(50, 30)},
                           {'id': 'e3', 'text': '12', **P(80, 30)}, {'id': 'e4', 'text': '15', **P(35, 70)}, {'id': 'e5', 'text': '20', **P(65, 70)}]},
     'answer': {'selected': ['e2', 'e3', 'e5']}},
    {'kind': 'selection', 'variant': 'position', 'prompt': 'Нажмите в правую верхнюю четверть поля.', 'points': 1,
     'data': {}, 'answer': {'region': {'x': 50, 'y': 0, 'w': 50, 'h': 50}}},
    {'kind': 'connecting', 'variant': 'directed', 'prompt': 'Постройте цепочку: идея → план → результат.', 'points': 2,
     'data': {'nodes': [{'id': 'n1', 'text': 'Идея', **P(15, 50)}, {'id': 'n2', 'text': 'План', **P(50, 25)}, {'id': 'n3', 'text': 'Результат', **P(85, 50)}]},
     'answer': {'edges': [['n1', 'n2'], ['n2', 'n3']]}},
    {'kind': 'editing', 'variant': 'highlight', 'prompt': 'Найдите слова с ошибками.', 'points': 1,
     'data': {'text': 'Мы пошли в лес и сабрали много грибов и ягот'}, 'answer': {'indices': [5, 9]}},
    {'kind': 'editing', 'variant': 'insert', 'prompt': 'Вставьте пропущенное слово.', 'points': 1,
     'data': {'text': 'Кошка на окне'}, 'answer': {'text': 'Кошка спит на окне'}},
]


async def ensure_user(username, full_name, role):
    from app.scenarios.users import LoginDTO, RegisterDTO
    try:
        await run('users.register', RegisterDTO(username=username, full_name=full_name, password=PASSWORD, role=role))
    except ConflictError:
        pass
    return (await run('users.login', LoginDTO(username=username, password=PASSWORD))).user


async def main():
    router = await start_infrastructure()
    try:
        await start_core(router=router, discover='app.scenarios')
        from app.scenarios.quizzes import CreateTestDTO
        from app.scenarios.test_access import SetAccessDTO
        teacher = await ensure_user('demo_teacher', 'Анна Петровна Учителева', 'teacher')
        student = await ensure_user('demo_student', 'Иван Учеников', 'student')
        test = await run('tests.create', CreateTestDTO(
            actor_id=teacher.id, title='Демонстрационный тест: все типы заданий',
            description='Пример теста с заданиями каждого типа.', tasks=DEMO_TASKS, good_percent=60, excellent_percent=85))
        await run('access.set', SetAccessDTO(actor_id=teacher.id, test_id=test.id, student_id=student.id, enabled=True))
        print(f'Создан тест {test.id} ({len(test.tasks)} заданий); доступ открыт для demo_student')
    finally:
        try:
            await shutdown_core()
        finally:
            await router.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, help='Точное имя целевой БД для подтверждения')
    args = parser.parse_args()
    if args.database != database_name():
        parser.error('Имя БД не совпадает с настроенной POSTGRES_DB')
    asyncio.run(main())
