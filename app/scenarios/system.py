"""Служебная проверка готовности: HTTP → core → PostgreSQL."""
from pydantic import BaseModel
from core import BaseScenario, register_scenario


class PingDTO(BaseModel):
    pass


class PingResponse(BaseModel):
    status: str


@register_scenario('system.ping', dto=PingDTO, response=PingResponse)
class Ping(BaseScenario):
    async def execute(self, dto):
        rows = await self._db.query('SELECT 1 AS ok', {})
        return PingResponse(status='ready' if rows and rows[0]['ok'] == 1 else 'error')
