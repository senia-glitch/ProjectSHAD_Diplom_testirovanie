from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from core import run
from app.policy import allow
from app.scenarios.system import PingDTO

router = APIRouter(tags=['service'])


@router.get('/health', dependencies=[Depends(allow('service.health'))])
def health():
    return {'status': 'ok'}


@router.get('/ready', dependencies=[Depends(allow('service.ready'))])
async def ready():
    try:
        result = await run('system.ping', PingDTO())
        if result.status == 'ready':
            return {'status': 'ready'}
    except Exception:
        pass
    return JSONResponse({'status': 'unavailable'}, status_code=503)
