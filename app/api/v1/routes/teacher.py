"""Внешние сценарии преподавателя."""
from typing import Literal
from fastapi import APIRouter, Depends, Path, Response
from pydantic import BaseModel, Field
from core import run
from app.policy import Principal, allow
from app.scenarios.attempts import AttemptDetail, AttemptList, AttemptRefDTO, AttemptSummary, ReviewDTO, TestRefDTO
from app.scenarios.quizzes import ActorDTO, CreateTestDTO, OwnedTestDTO, TestDetail, TestInput, TestList, UpdateTestDTO
from app.scenarios.test_access import AccessItem, AccessList, AccessListDTO, SetAccessDTO
from app.scenarios.users import EmptyDTO, StudentList

router = APIRouter(prefix='/teacher', tags=['teacher'])


class AccessBody(BaseModel):
    enabled: bool


class ReviewBody(BaseModel):
    teacher_grade: Literal['удовлетворительно', 'хорошо', 'замечательно'] | None = None
    teacher_comment: str = Field(default='', max_length=5000)


@router.get('/tests', response_model=TestList)
async def list_tests(p: Principal = Depends(allow('tests.list_own'))):
    return await run('tests.list_owned', ActorDTO(actor_id=p.user_id))


@router.post('/tests', status_code=201, response_model=TestDetail)
async def create_test(body: TestInput, p: Principal = Depends(allow('tests.create'))):
    return await run('tests.create', CreateTestDTO(**body.model_dump(), actor_id=p.user_id))


@router.get('/tests/{test_id}', response_model=TestDetail)
async def get_test(test_id: int = Path(gt=0), p: Principal = Depends(allow('tests.get_own'))):
    return await run('tests.get_owned', OwnedTestDTO(actor_id=p.user_id, test_id=test_id))


@router.put('/tests/{test_id}', response_model=TestDetail)
async def update_test(body: TestInput, test_id: int = Path(gt=0), p: Principal = Depends(allow('tests.update'))):
    return await run('tests.update', UpdateTestDTO(**body.model_dump(), actor_id=p.user_id, test_id=test_id))


@router.delete('/tests/{test_id}', status_code=204)
async def delete_test(test_id: int = Path(gt=0), p: Principal = Depends(allow('tests.delete'))):
    await run('tests.delete', OwnedTestDTO(actor_id=p.user_id, test_id=test_id))
    return Response(status_code=204)


@router.get('/students', response_model=StudentList)
async def list_students(_: Principal = Depends(allow('students.list'))):
    return await run('users.list_students', EmptyDTO())


@router.get('/tests/{test_id}/access', response_model=AccessList)
async def list_access(test_id: int = Path(gt=0), p: Principal = Depends(allow('access.list'))):
    return await run('access.list', AccessListDTO(actor_id=p.user_id, test_id=test_id))


@router.put('/tests/{test_id}/access/{student_id}', response_model=AccessItem)
async def set_access(body: AccessBody, test_id: int = Path(gt=0), student_id: int = Path(gt=0),
                     p: Principal = Depends(allow('access.set'))):
    return await run('access.set', SetAccessDTO(actor_id=p.user_id, test_id=test_id,
                                                 student_id=student_id, enabled=body.enabled))


@router.get('/tests/{test_id}/results', response_model=AttemptList)
async def list_results(test_id: int = Path(gt=0), p: Principal = Depends(allow('results.list_for_test'))):
    return await run('attempts.list_for_test', TestRefDTO(actor_id=p.user_id, test_id=test_id))


@router.get('/results/{attempt_id}', response_model=AttemptDetail)
async def get_result(attempt_id: int = Path(gt=0), p: Principal = Depends(allow('results.get_for_teacher'))):
    return await run('attempts.get_for_teacher', AttemptRefDTO(actor_id=p.user_id, attempt_id=attempt_id))


@router.put('/results/{attempt_id}/review', response_model=AttemptSummary)
async def review(body: ReviewBody, attempt_id: int = Path(gt=0), p: Principal = Depends(allow('results.review'))):
    return await run('attempts.review', ReviewDTO(actor_id=p.user_id, attempt_id=attempt_id, **body.model_dump()))
