"""Пользователи: регистрация с ролью, вход, профиль, список учеников."""
from typing import Literal
from pydantic import BaseModel, Field, field_validator
from core import BaseScenario, ConflictError, NotFoundError, register_scenario
from core.utils.security import create_access_token, hash_password, verify_password
from app.scenarios.common import UnauthorizedError, now

Role = Literal['teacher', 'student']


class RegisterDTO(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r'^[A-Za-z0-9_.-]+$')
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=6, max_length=72)
    role: Role

    @field_validator('full_name')
    @classmethod
    def strip_name(cls, value):
        value = ' '.join(value.split())
        if not value:
            raise ValueError('Укажите имя')
        return value

    @field_validator('password')
    @classmethod
    def password_bytes(cls, value):
        if len(value.encode()) > 72:
            raise ValueError('Пароль слишком длинный')
        return value


class LoginDTO(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=72)


class UserIdDTO(BaseModel):
    user_id: int = Field(gt=0)


class EmptyDTO(BaseModel):
    pass


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    role: Role


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    user: UserResponse


class StudentList(BaseModel):
    items: list[UserResponse]


def _user(row):
    return UserResponse(id=row['id'], username=row['username'], full_name=row['full_name'], role=row['role'])


@register_scenario('users.register', dto=RegisterDTO, response=UserResponse)
class Register(BaseScenario):
    async def execute(self, dto):
        rows = await self._db.query('SELECT id FROM users WHERE lower(username) = lower(:u)', {'u': dto.username})
        if rows:
            raise ConflictError('Такой логин уже занят')
        data = dto.model_dump(exclude={'password'}) | {
            'password_hash': await hash_password(dto.password), 'created_at': now()}
        try:
            return _user(await self._db.create('users', data))
        except Exception as error:
            if 'unique' in str(error).lower() or 'duplicate' in str(error).lower():
                raise ConflictError('Такой логин уже занят') from None
            raise


@register_scenario('users.login', dto=LoginDTO, response=TokenResponse)
class Login(BaseScenario):
    async def execute(self, dto):
        rows = await self._db.query(
            'SELECT id, username, full_name, role, password_hash FROM users WHERE lower(username) = lower(:u)',
            {'u': dto.username})
        valid = False
        if rows:
            try:
                valid = await verify_password(dto.password, rows[0]['password_hash'])
            except ValueError:
                valid = False
        if not valid:
            raise UnauthorizedError('Неверный логин или пароль')
        user = _user(rows[0])
        return TokenResponse(access_token=create_access_token(user.id, user.role), user=user)


@register_scenario('users.get', dto=UserIdDTO, response=UserResponse)
class GetUser(BaseScenario):
    async def execute(self, dto):
        row = await self._db.read('users', dto.user_id)
        if row is None:
            raise NotFoundError('Пользователь не найден')
        return _user(row)


@register_scenario('users.list_students', dto=EmptyDTO, response=StudentList)
class ListStudents(BaseScenario):
    async def execute(self, dto):
        rows = await self._db.query(
            "SELECT id, username, full_name, role FROM users WHERE role = 'student' ORDER BY full_name, id", {})
        return StudentList(items=[_user(r) for r in rows])
