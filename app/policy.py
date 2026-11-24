"""Проверка доступа к внешним сценариям по config/access.toml."""
import tomllib
from dataclasses import dataclass
import jwt
from fastapi import Depends, Request
from fastbase import ForbiddenError, UnauthorizedError
from core.utils.security import decode_token
from app.config import ROOT

POLICY_PATH = ROOT / 'config' / 'access.toml'


def load_policy(path=POLICY_PATH):
    with open(path, 'rb') as file:
        raw = tomllib.load(file)
    roles = raw.get('roles')
    if not isinstance(roles, dict) or 'guest' not in roles:
        raise RuntimeError('Access policy must define roles including guest')
    policy = {}
    for role, body in roles.items():
        scenarios = body.get('scenarios') if isinstance(body, dict) else None
        if not isinstance(scenarios, list) or not all(isinstance(s, str) and s and '*' not in s for s in scenarios):
            raise RuntimeError(f'Invalid scenarios list for role {role}')
        policy[role] = frozenset(scenarios)
    return policy


POLICY = load_policy()


@dataclass(frozen=True)
class Principal:
    user_id: int | None
    role: str


def principal_from(request: Request) -> Principal:
    header = request.headers.get('authorization', '')
    if not header:
        return Principal(None, 'guest')
    scheme, _, token = header.partition(' ')
    if scheme.lower() != 'bearer' or not token:
        raise UnauthorizedError('Неверный заголовок авторизации')
    try:
        payload = decode_token(token)
        user_id, role = int(payload['sub']), payload.get('role')
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise UnauthorizedError('Сессия истекла, войдите снова') from None
    if payload.get('type') != 'access' or not isinstance(role, str) or role == 'guest' or role not in POLICY:
        raise UnauthorizedError('Сессия недействительна, войдите снова')
    return Principal(user_id, role)


def allow(scenario: str):
    """Depends-провайдер: подтверждённая роль должна иметь разрешение на внешний сценарий."""
    if not any(scenario in allowed for allowed in POLICY.values()):
        raise RuntimeError(f'External scenario {scenario} is not in access policy')

    def check(principal: Principal = Depends(principal_from)) -> Principal:
        if scenario not in POLICY.get(principal.role, frozenset()):
            if principal.role == 'guest':
                raise UnauthorizedError('Требуется вход')
            raise ForbiddenError('Недостаточно прав')
        return principal

    return check
