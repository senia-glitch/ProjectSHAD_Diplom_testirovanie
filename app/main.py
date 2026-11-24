from app.config import ROOT
from contextlib import asynccontextmanager
from core import ScenarioRegistry, shutdown_core, start_core
from fastbase import make_app, start
from fastapi.staticfiles import StaticFiles
from run_infrastructure import start_infrastructure

EXPECTED_SCENARIOS = (
    'users.register,users.login,users.get,users.list_students,'
    'tests.create,tests.update,tests.delete,tests.get_owned,tests.list_owned,tests.list_available,tests.get_for_student,'
    'access.list,access.set,attempts.submit,attempts.list_mine,attempts.get_mine,attempts.list_for_test,'
    'attempts.get_for_teacher,attempts.review,system.ping')


@asynccontextmanager
async def lifespan(app):
    router = await start_infrastructure()
    try:
        await start_core(router=router, discover='app.scenarios')
        expected = set(EXPECTED_SCENARIOS.split(','))
        if not expected.issubset(set(ScenarioRegistry.list_scenarios())):
            raise RuntimeError('Required scenarios were not discovered')
        yield
    finally:
        try:
            await shutdown_core()
        finally:
            await router.shutdown()


app = make_app()
app.router.lifespan_context = lifespan
if '1' == '1':
    # API routes and docs are mounted before static files.
    app.mount('/', StaticFiles(directory=ROOT / 'frontend', html=True), name='frontend')

if __name__ == '__main__':
    start()
