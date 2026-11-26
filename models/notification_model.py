from __future__ import annotations

import uuid
from sqlalchemy import Boolean, Column, DateTime, Index, JSON, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from core.orm.model import BaseModel
from modules.melodi_notifications.config import NotificationConfig, NotificationTables

JsonType = JSON().with_variant(JSONB, "postgresql")


class NotificationModel(BaseModel):
    """Notification In-App persistée pour un utilisateur (sans FK SQL inter-modules)."""

    __tablename__ = NotificationTables.NOTIFICATIONS
    __table_args__ = (
        Index(
            f"idx_{NotificationTables.NOTIFICATIONS}_user_state",
            "user_id",
            "is_archived",
            "is_read",
            "created_at",
        ),
        Index(
            f"idx_{NotificationTables.NOTIFICATIONS}_dedup",
            "user_id",
            "dedup_key",
        ),
    )

    id = Column(String(64), primary_key=True, default=lambda: uuid.uuid4().hex)
    # Identifiant logique vers base.user (VirtualFK, aucune FOREIGN KEY SQL physique)
    user_id = Column(String(128), nullable=False, index=True)
    source_module = Column(String(100), nullable=False, default="system", index=True)
    category = Column(String(80), nullable=False, default=NotificationConfig.DEFAULT_CATEGORY, index=True)
    severity = Column(String(20), nullable=False, default=NotificationConfig.DEFAULT_SEVERITY)

    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    action_url = Column(String(500), nullable=True)
    action_label = Column(String(120), nullable=True)
    icon = Column(String(100), nullable=True)

    metadata_json = Column("metadata", JsonType, nullable=False, default=dict)
    dedup_key = Column(String(180), nullable=True)

    is_read = Column(Boolean, nullable=False, default=False, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    is_archived = Column(Boolean, nullable=False, default=False, index=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "source_module": self.source_module,
            "category": self.category,
            "severity": self.severity,
            "title": self.title,
            "message": self.message,
            "action_url": self.action_url,
            "action_label": self.action_label,
            "icon": self.icon,
            "metadata": self.metadata_json or {},
            "dedup_key": self.dedup_key,
            "is_read": bool(self.is_read),
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "is_archived": bool(self.is_archived),
            "archived_at": self.archived_at.isoformat() if self.archived_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
