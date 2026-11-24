"""Доступ учеников к тесту: преподаватель включает и выключает в любое время."""
from pydantic import BaseModel, Field
from core import BaseScenario, NotFoundError, register_scenario
from app.scenarios.common import now
from app.scenarios.quizzes import load_owned


class AccessListDTO(BaseModel):
    actor_id: int = Field(gt=0)
    test_id: int = Field(gt=0)


class SetAccessDTO(AccessListDTO):
    student_id: int = Field(gt=0)
    enabled: bool


class AccessItem(BaseModel):
    student_id: int
    username: str
    full_name: str
    enabled: bool
    attempts: int


class AccessList(BaseModel):
    items: list[AccessItem]


@register_scenario('access.list', dto=AccessListDTO, response=AccessList)
class ListAccess(BaseScenario):
    async def execute(self, dto):
        row = await load_owned(self._db, dto.actor_id, dto.test_id)
        rows = await self._db.query(
            "SELECT u.id AS student_id, u.username, u.full_name, (a.id IS NOT NULL) AS enabled, "
            "(SELECT count(*) FROM attempts p WHERE p.test_id = :t AND p.student_id = u.id AND p.test_version = :v) AS attempts "
            "FROM users u LEFT JOIN test_access a ON a.student_id = u.id AND a.test_id = :t "
            "WHERE u.role = 'student' ORDER BY u.full_name, u.id", {'t': dto.test_id, 'v': row['version']})
        return AccessList(items=[AccessItem(**r) for r in rows])


@register_scenario('access.set', dto=SetAccessDTO, response=AccessItem)
class SetAccess(BaseScenario):
    async def execute(self, dto):
        await load_owned(self._db, dto.actor_id, dto.test_id)
        student = await self._db.read('users', dto.student_id)
        if student is None or student['role'] != 'student':
            raise NotFoundError('Ученик не найден')
        params = {'t': dto.test_id, 's': dto.student_id}
        if dto.enabled:
            await self._db.query(
                'INSERT INTO test_access (test_id, student_id, granted_at) VALUES (:t, :s, :at) '
                'ON CONFLICT (test_id, student_id) DO NOTHING', params | {'at': now()}, channel='write')
        else:
            await self._db.query('DELETE FROM test_access WHERE test_id = :t AND student_id = :s', params, channel='write')
        count = await self._db.query(
            'SELECT count(*) AS n FROM attempts p JOIN tests t ON t.id = p.test_id '
            'WHERE p.test_id = :t AND p.student_id = :s AND p.test_version = t.version', params)
        return AccessItem(student_id=student['id'], username=student['username'], full_name=student['full_name'],
                          enabled=dto.enabled, attempts=count[0]['n'])
