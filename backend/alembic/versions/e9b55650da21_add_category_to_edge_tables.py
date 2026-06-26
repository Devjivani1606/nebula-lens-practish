"""Add category to edge tables

Revision ID: e9b55650da21
Revises: 
Create Date: 2026-06-25 23:09:01.038110

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e9b55650da21'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('relationships', sa.Column('category', sa.String(length=50), nullable=True, server_default='runtime'))
    op.add_column('normalized_edges', sa.Column('category', sa.String(length=50), nullable=True, server_default='runtime'))


def downgrade() -> None:
    op.drop_column('normalized_edges', 'category')
    op.drop_column('relationships', 'category')
