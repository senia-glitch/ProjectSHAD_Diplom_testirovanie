"""Расширение колонок оценок: «удовлетворительно» длиннее 16 символов."""
from alembic import op
import sqlalchemy as sa

revision = '0002_grade_length'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade():
    for column in ('auto_grade', 'teacher_grade'):
        op.alter_column('attempts', column, type_=sa.String(32), existing_type=sa.String(16), existing_nullable=True)


def downgrade():
    raise RuntimeError('Narrowing grade columns may truncate data; write an explicit reviewed migration')
