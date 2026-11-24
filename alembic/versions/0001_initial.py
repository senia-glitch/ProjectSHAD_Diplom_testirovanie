"""Начальная схема: пользователи, тесты, доступ, попытки."""
from alembic import op
import sqlalchemy as sa

revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)


def upgrade():
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('username', sa.String(64), nullable=False),
        sa.Column('full_name', sa.String(120), nullable=False),
        sa.Column('role', sa.String(16), nullable=False),
        sa.Column('password_hash', sa.String(100), nullable=False),
        sa.Column('created_at', TS, nullable=False),
        sa.UniqueConstraint('username'))
    op.create_table(
        'tests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('owner_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('tasks', sa.Text(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('good_percent', sa.Integer(), nullable=False),
        sa.Column('excellent_percent', sa.Integer(), nullable=False),
        sa.Column('created_at', TS, nullable=False),
        sa.Column('updated_at', TS, nullable=False))
    op.create_table(
        'test_access',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('test_id', sa.Integer(), sa.ForeignKey('tests.id', ondelete='CASCADE'), nullable=False),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('granted_at', TS, nullable=False),
        sa.UniqueConstraint('test_id', 'student_id'))
    op.create_table(
        'attempts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('test_id', sa.Integer(), sa.ForeignKey('tests.id', ondelete='CASCADE'), nullable=False),
        sa.Column('student_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('test_version', sa.Integer(), nullable=False),
        sa.Column('answers', sa.Text(), nullable=False),
        sa.Column('results', sa.Text(), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('max_score', sa.Float(), nullable=False),
        sa.Column('auto_grade', sa.String(16), nullable=True),
        sa.Column('teacher_grade', sa.String(16), nullable=True),
        sa.Column('teacher_comment', sa.Text(), nullable=False),
        sa.Column('submitted_at', TS, nullable=False),
        sa.Column('reviewed_at', TS, nullable=True))


def downgrade():
    raise RuntimeError('Destructive downgrade requires an explicit reviewed data migration')
