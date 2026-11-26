from __future__ import annotations

import logging
from typing import Any

from modules.melodi_notifications.config import NotificationConfig
from modules.melodi_notifications.repositories.notification_repository import NotificationRepository

logger = logging.getLogger("melodi_notifications.service")


class NotificationService:
    """Service métier centralisant la création, la lecture et la diffusion temps réel des notifications."""

    def __init__(self, module: Any):
        self.module = module
        self.app = module.app
        self.repo = NotificationRepository(module.app)

    @staticmethod
    def _normalize_severity(value: str | None) -> str:
        sev = str(value or NotificationConfig.DEFAULT_SEVERITY).strip().lower()
        return sev if sev in NotificationConfig.SEVERITIES else NotificationConfig.DEFAULT_SEVERITY

    async def notify(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Crée une notification pour un utilisateur et tente un push WebSocket non bloquant."""
        user_id = payload.get("user_id")
        title = (payload.get("title") or "").strip()
        message = (payload.get("message") or "").strip()

        if not user_id:
            return {"success": False, "error": "Champ 'user_id' requis"}
        if not title:
            return {"success": False, "error": "Champ 'title' requis"}
        if not message:
            return {"success": False, "error": "Champ 'message' requis"}

        clean_payload = {
            "user_id": str(user_id),
            "source_module": str(payload.get("source_module") or "system").strip(),
            "category": str(payload.get("category") or NotificationConfig.DEFAULT_CATEGORY).strip(),
            "severity": self._normalize_severity(payload.get("severity")),
            "title": title,
            "message": message,
            "action_url": payload.get("action_url"),
            "action_label": payload.get("action_label"),
            "icon": payload.get("icon"),
            "metadata": payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {},
            "dedup_key": payload.get("dedup_key"),
            "expires_at": payload.get("expires_at"),
        }

        notif = await self.repo.create(clean_payload)
        notif_dict = notif.to_dict() if hasattr(notif, "to_dict") else dict(notif)
        unread_count = await self.repo.count_unread(str(user_id))

        await self._broadcast_ws(str(user_id), "notification:new", {
            "notification": notif_dict,
            "unread_count": unread_count,
        })

        return {"success": True, "notification": notif_dict, "unread_count": unread_count}

    async def notify_many(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Crée une notification pour plusieurs utilisateurs."""
        user_ids = payload.get("user_ids") or []
        if not isinstance(user_ids, (list, tuple, set)) or not user_ids:
            return {"success": False, "error": "Champ 'user_ids' (liste non vide) requis"}

        created = []
        errors = []
        for uid in user_ids:
            single = dict(payload)
            single.pop("user_ids", None)
            single["user_id"] = uid
            res = await self.notify(single)
            if res.get("success"):
                created.append(res["notification"])
            else:
                errors.append({"user_id": uid, "error": res.get("error")})

        return {
            "success": len(created) > 0 and len(errors) == 0,
            "created_count": len(created),
            "notifications": created,
            "errors": errors,
        }

    async def get_unread_count(self, user_id: str) -> int:
        return await self.repo.count_unread(str(user_id))

    async def list_notifications(
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
        return await self.repo.list_for_user(
            str(user_id),
            status=status,
            category=category,
            severity=severity,
            query_text=query_text,
            limit=limit,
            offset=offset,
        )

    async def mark_read(self, notif_id: str, user_id: str, read: bool = True) -> dict[str, Any]:
        updated = await self.repo.mark_read(notif_id, str(user_id), read=read)
        if updated is None:
            return {"success": False, "error": "Notification introuvable"}
        unread_count = await self.repo.count_unread(str(user_id))
        await self._broadcast_ws(str(user_id), "notification:updated", {
            "notification": updated,
            "unread_count": unread_count,
        })
        return {"success": True, "notification": updated, "unread_count": unread_count}

    async def mark_all_read(self, user_id: str) -> dict[str, Any]:
        updated_count = await self.repo.mark_all_read(str(user_id))
        await self._broadcast_ws(str(user_id), "notification:read_all", {
            "unread_count": 0,
            "updated_count": updated_count,
        })
        return {"success": True, "updated_count": updated_count, "unread_count": 0}

    async def archive(self, notif_id: str, user_id: str, archived: bool = True) -> dict[str, Any]:
        updated = await self.repo.archive(notif_id, str(user_id), archived=archived)
        if updated is None:
            return {"success": False, "error": "Notification introuvable"}
        unread_count = await self.repo.count_unread(str(user_id))
        await self._broadcast_ws(str(user_id), "notification:updated", {
            "notification": updated,
            "unread_count": unread_count,
        })
        return {"success": True, "notification": updated, "unread_count": unread_count}

    async def delete_notification(self, notif_id: str, user_id: str) -> dict[str, Any]:
        deleted = await self.repo.delete_notification(notif_id, str(user_id))
        if not deleted:
            return {"success": False, "error": "Notification introuvable"}
        unread_count = await self.repo.count_unread(str(user_id))
        await self._broadcast_ws(str(user_id), "notification:deleted", {
            "id": notif_id,
            "unread_count": unread_count,
        })
        return {"success": True, "unread_count": unread_count}

    async def handle_user_before_delete(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Filter hook VirtualFK: supprime les notifications d'un utilisateur dans la transaction partagée."""
        user_id = payload.get("entity_id") or payload.get("user_id")
        session = payload.get("session")
        if user_id:
            await self.repo.delete_by_user_id(str(user_id), session=session)
        return payload

    async def _broadcast_ws(self, user_id: str, event: str, data: dict[str, Any]) -> None:
        """Diffusion temps réel best-effort via le serveur WebSocket si actif (aucune dépendance dure)."""
        try:
            ws_service = getattr(self.app, "websocket_service", None) or getattr(self.app, "websocket_server", None)
            if ws_service is None:
                return
            channel = f"notifications:user_{user_id}"
            message = {"type": event, "event": event, "channel": channel, "data": data}
            if hasattr(ws_service, "publish"):
                await ws_service.publish(channel, message)
            elif hasattr(ws_service, "broadcast_to_channel"):
                await ws_service.broadcast_to_channel(channel, message)
        except Exception as exc:
            logger.debug("WebSocket broadcast ignoré: %s", exc)
