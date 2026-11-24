"""Внешние сценарии ученика."""
from typing import Any
from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, Field
from core import run
from app.policy import Principal, allow
from app.scenarios.attempts import ActorDTO as AttemptActorDTO, AttemptDetail, AttemptList, AttemptRefDTO, SubmitDTO
from app.scenarios.quizzes import ActorDTO, OwnedTestDTO, TestDetail, TestList

router = APIRouter(prefix='/student', tags=['student'])


class SubmitBody(BaseModel):
    version: int = Field(gt=0)
    answers: dict[str, Any]


@router.get('/tests', response_model=TestList)
async def available(p: Principal = Depends(allow('tests.list_available'))):
    return await run('tests.list_available', ActorDTO(actor_id=p.user_id))


@router.get('/tests/{test_id}', response_model=TestDetail)
async def open_test(test_id: int = Path(gt=0), p: Principal = Depends(allow('tests.open'))):
    return await run('tests.get_for_student', OwnedTestDTO(actor_id=p.user_id, test_id=test_id))


@router.post('/tests/{test_id}/attempts', status_code=201, response_model=AttemptDetail)
async def submit(body: SubmitBody, test_id: int = Path(gt=0), p: Principal = Depends(allow('attempts.submit'))):
    return await run('attempts.submit', SubmitDTO(actor_id=p.user_id, test_id=test_id, **body.model_dump()))


@router.get('/results', response_model=AttemptList)
async def my_results(p: Principal = Depends(allow('results.list_mine'))):
    return await run('attempts.list_mine', AttemptActorDTO(actor_id=p.user_id))


@router.get('/results/{attempt_id}', response_model=AttemptDetail)
async def my_result(attempt_id: int = Path(gt=0), p: Principal = Depends(allow('results.get_mine'))):
    return await run('attempts.get_mine', AttemptRefDTO(actor_id=p.user_id, attempt_id=attempt_id))
