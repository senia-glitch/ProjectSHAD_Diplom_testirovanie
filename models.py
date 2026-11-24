"""Модели хранения: пользователи, тесты, доступ к тестам, попытки (результаты)."""
from datetime import datetime
import sqlalchemy as sa
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = 'users'
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(max_length=64, unique=True)
    full_name: str = Field(max_length=120)
    role: str = Field(max_length=16)
    password_hash: str = Field(max_length=100)
    created_at: datetime = Field(sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False))


class Test(SQLModel, table=True):
    __tablename__ = 'tests'
    id: int | None = Field(default=None, primary_key=True)
    owner_id: int = Field(sa_column=sa.Column(sa.Integer, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False))
    title: str = Field(max_length=200)
    description: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
    tasks: str = Field(sa_column=sa.Column(sa.Text, nullable=False))  # JSON-массив заданий
    version: int = Field(default=1)
    good_percent: int = Field(default=60)
    excellent_percent: int = Field(default=85)
    created_at: datetime = Field(sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False))
    updated_at: datetime = Field(sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False))


class TestAccess(SQLModel, table=True):
    __tablename__ = 'test_access'
    __table_args__ = (sa.UniqueConstraint('test_id', 'student_id'),)
    id: int | None = Field(default=None, primary_key=True)
    test_id: int = Field(sa_column=sa.Column(sa.Integer, sa.ForeignKey('tests.id', ondelete='CASCADE'), nullable=False))
    student_id: int = Field(sa_column=sa.Column(sa.Integer, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False))
    granted_at: datetime = Field(sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False))


class Attempt(SQLModel, table=True):
    __tablename__ = 'attempts'
    id: int | None = Field(default=None, primary_key=True)
    test_id: int = Field(sa_column=sa.Column(sa.Integer, sa.ForeignKey('tests.id', ondelete='CASCADE'), nullable=False))
    student_id: int = Field(sa_column=sa.Column(sa.Integer, sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False))
    test_version: int
    answers: str = Field(sa_column=sa.Column(sa.Text, nullable=False))   # JSON {task_id: ответ}
    results: str = Field(sa_column=sa.Column(sa.Text, nullable=False))   # JSON {task_id: {status, points}}
    score: float
    max_score: float
    auto_grade: str | None = Field(default=None, max_length=32)
    teacher_grade: str | None = Field(default=None, max_length=32)
    teacher_comment: str = Field(sa_column=sa.Column(sa.Text, nullable=False))
    submitted_at: datetime = Field(sa_column=sa.Column(sa.DateTime(timezone=True), nullable=False))
    reviewed_at: datetime | None = Field(default=None, sa_column=sa.Column(sa.DateTime(timezone=True), nullable=True))


metadata = SQLModel.metadata


def get_all_schemas():
    return {'users': User, 'tests': Test, 'test_access': TestAccess, 'attempts': Attempt}
