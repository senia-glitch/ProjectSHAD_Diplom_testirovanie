from fastapi import APIRouter, Depends
from core import run
from app.policy import Principal, allow
from app.scenarios.users import LoginDTO, RegisterDTO, TokenResponse, UserIdDTO, UserResponse

router = APIRouter(prefix='/auth', tags=['auth'])


@router.post('/register', status_code=201, response_model=UserResponse)
async def register(dto: RegisterDTO, _: Principal = Depends(allow('auth.register'))):
    return await run('users.register', dto)


@router.post('/login', response_model=TokenResponse)
async def login(dto: LoginDTO, _: Principal = Depends(allow('auth.login'))):
    return await run('users.login', dto)


@router.get('/me', response_model=UserResponse)
async def me(principal: Principal = Depends(allow('auth.me'))):
    return await run('users.get', UserIdDTO(user_id=principal.user_id))
