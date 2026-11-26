from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, delete, func, or_, select, update
from core.db.repository import Repository
from modules.melodi_notifications.config import NotificationConfig
from modules.melodi_notifications.models.notification_model import NotificationModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class NotificationRepository(Repository):
    """Couche d'accès aux données pour les notifications In-App."""

    async def create(self, data: dict[str, Any]) -> NotificationModel:
        """Crée une notification (ou met à jour une non-lue existante si dedup_key correspond)."""
        user_id = str(data["user_id"])
        dedup_key = data.get("dedup_key")

        async with self.get_session() as session:
            if dedup_key:
                stmt = select(NotificationModel).where(
                    and_(
                        NotificationModel.user_id == user_id,
                        NotificationModel.dedup_key == dedup_key,
                        NotificationModel.is_read.is_(False),
                        NotificationModel.is_archived.is_(False),
                    )
                ).limit(1)
                existing = (await session.execute(stmt)).scalar_one_or_none()
                if existing is not None:
                    existing.title = data["title"]
                    existing.message = data["message"]
                    existing.severity = data.get("severity", existing.severity)
                    existing.category = data.get("category", existing.category)
                    existing.action_url = data.get("action_url", existing.action_url)
                    existing.action_label = data.get("action_label", existing.action_label)
                    existing.icon = data.get("icon", existing.icon)
                    existing.metadata_json = data.get("metadata", existing.metadata_json or {})
                    existing.created_at = _utcnow()
                    await session.commit()
                    await session.refresh(existing)
                    return existing

            notif = NotificationModel(
                id=data.get("id") or uuid.uuid4().hex,
                user_id=user_id,
                source_module=str(data.get("source_module") or "system"),
                category=str(data.get("category") or NotificationConfig.DEFAULT_CATEGORY),
                severity=str(data.get("severity") or NotificationConfig.DEFAULT_SEVERITY),
                title=str(data["title"]),
                message=str(data["message"]),
                action_url=data.get("action_url"),
                action_label=data.get("action_label"),
                icon=data.get("icon"),
                metadata_json=data.get("metadata") or {},
                dedup_key=dedup_key,
                expires_at=data.get("expires_at"),
                is_read=False,
                is_archived=False,
            )
            session.add(notif)
            await session.commit()
            await session.refresh(notif)
            return notif

    async def count_unread(self, user_id: str) -> int:
        """Retourne le nombre de notifications non lues (non archivées, non expirées) pour un utilisateur."""
        now = _utcnow()
        async with self.get_session() as session:
            stmt = select(func.count(NotificationModel.id)).where(
                and_(
                    NotificationModel.user_id == str(user_id),
                    NotificationModel.is_read.is_(False),
                    NotificationModel.is_archived.is_(False),
                    or_(NotificationModel.expires_at.is_(None), NotificationModel.expires_at > now),
                )
            )
            result = await session.execute(stmt)
            return int(result.scalar() or 0)

    async def list_for_user(
        self,
        user_id: str,
        *,
        status: str = "all",
        category: str | None = None,
        severity: str | None = None,
        query_text: str | None = None,
        limit: int = NotificationConfig.DEFAULT_LIMIT,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Retourne la liste paginée des notifications d'un utilisateur et les compteurs."""
        now = _utcnow()
        limit = max(1, min(int(limit or NotificationConfig.DEFAULT_LIMIT), NotificationConfig.MAX_LIMIT))
        offset = max(0, int(offset or 0))

        conditions = [
            NotificationModel.user_id == str(user_id),
            or_(NotificationModel.expires_at.is_(None), NotificationModel.expires_at > now),
        ]

        norm_status = (status or "all").lower()
        if norm_status == "unread":
            conditions.extend([NotificationModel.is_archived.is_(False), NotificationModel.is_read.is_(False)])
        elif norm_status == "read":
            conditions.extend([NotificationModel.is_archived.is_(False), NotificationModel.is_read.is_(True)])
        elif norm_status == "archived":
            conditions.append(NotificationModel.is_archived.is_(True))
        else:
            conditions.append(NotificationModel.is_archived.is_(False))

        if category:
            conditions.append(NotificationModel.category == str(category))
        if severity and severity in NotificationConfig.SEVERITIES:
            conditions.append(NotificationModel.severity == str(severity))
        if query_text:
            pattern = f"%{query_text.strip()}%"
            conditions.append(
                or_(
                    NotificationModel.title.ilike(pattern),
                    NotificationModel.message.ilike(pattern),
                    NotificationModel.source_module.ilike(pattern),
                )
            )

        async with self.get_session() as session:
            where_clause = and_(*conditions)
            total_stmt = select(func.count(NotificationModel.id)).where(where_clause)
            total = int((await session.execute(total_stmt)).scalar() or 0)

            items_stmt = (
                select(NotificationModel)
                .where(where_clause)
                .order_by(NotificationModel.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
            items = list((await session.execute(items_stmt)).scalars().all())

            unread_stmt = select(func.count(NotificationModel.id)).where(
                and_(
                    NotificationModel.user_id == str(user_id),
                    NotificationModel.is_read.is_(False),
                    NotificationModel.is_archived.is_(False),
                    or_(NotificationModel.expires_at.is_(None), NotificationModel.expires_at > now),
                )
            )
            unread_count = int((await session.execute(unread_stmt)).scalar() or 0)

        return {
            "items": [item.to_dict() for item in items],
            "total": total,
            "unread_count": unread_count,
            "limit": limit,
            "offset": offset,
        }

    async def mark_read(self, notif_id: str, user_id: str, read: bool = True) -> dict[str, Any] | None:
        """Marque une notification comme lue ou non lue."""
        now = _utcnow() if read else None
        async with self.get_session() as session:
            stmt = select(NotificationModel).where(
                and_(NotificationModel.id == str(notif_id), NotificationModel.user_id == str(user_id))
            )
            notif = (await session.execute(stmt)).scalar_one_or_none()
            if notif is None:
                return None
            notif.is_read = bool(read)
            notif.read_at = now
            await session.commit()
            await session.refresh(notif)
            return notif.to_dict()

    async def mark_all_read(self, user_id: str) -> int:
        """Marque toutes les notifications non lues (non archivées) comme lues."""
        now = _utcnow()
        async with self.get_session() as session:
            stmt = (
                update(NotificationModel)
                .where(
                    and_(
                        NotificationModel.user_id == str(user_id),
                        NotificationModel.is_read.is_(False),
                        NotificationModel.is_archived.is_(False),
                    )
                )
                .values(is_read=True, read_at=now)
            )
            result = await session.execute(stmt)
            await session.commit()
            return int(result.rowcount or 0)

    async def archive(self, notif_id: str, user_id: str, archived: bool = True) -> dict[str, Any] | None:
        """Archive ou désarchive une notification."""
        now = _utcnow() if archived else None
        async with self.get_session() as session:
            stmt = select(NotificationModel).where(
                and_(NotificationModel.id == str(notif_id), NotificationModel.user_id == str(user_id))
            )
            notif = (await session.execute(stmt)).scalar_one_or_none()
            if notif is None:
                return None
            notif.is_archived = bool(archived)
            notif.archived_at = now
            if archived and not notif.is_read:
                notif.is_read = True
                notif.read_at = now
            await session.commit()
            await session.refresh(notif)
            return notif.to_dict()

    async def delete_notification(self, notif_id: str, user_id: str) -> bool:
        """Supprime une notification appartenant à l'utilisateur."""
        async with self.get_session() as session:
            stmt = delete(NotificationModel).where(
                and_(NotificationModel.id == str(notif_id), NotificationModel.user_id == str(user_id))
            )
            result = await session.execute(stmt)
            await session.commit()
            return bool(result.rowcount and result.rowcount > 0)

    async def delete_by_user_id(self, user_id: str, session: Any = None) -> int:
        """Cascade transactionnelle (VirtualFK) lors de la suppression d'un utilisateur dans base."""
        stmt = delete(NotificationModel).where(NotificationModel.user_id == str(user_id))
        if session is not None:
            result = await session.execute(stmt)
            return int(result.rowcount or 0)
        async with self.get_session() as owned_session:
            result = await owned_session.execute(stmt)
            await owned_session.commit()
            return int(result.rowcount or 0)
