from __future__ import annotations

from typing import Any
from core.routing import Request, Response
from core.routing.decorator import require_permission
from modules.melodi_notifications.config import NotificationConfig
from modules.melodi_notifications.services.notification_service import NotificationService


class NotificationAPIController:
    """Contrôleur API REST pour la gestion des notifications In-App."""

    @staticmethod
    def _get_service(request: Request) -> NotificationService:
        module = getattr(request, "module", None) or request.app.module_manager.modules.get("melodi_notifications")
        if module and getattr(module, "notification_service", None):
            return module.notification_service
        return NotificationService(module)

    @staticmethod
    def _resolve_user_id(request: Request) -> str | None:
        user = getattr(request, "user", None)
        if user is not None:
            uid = getattr(user, "id", None) if not isinstance(user, dict) else user.get("id")
            if uid:
                return str(uid)
        if hasattr(request, "get_session"):
            uid = request.get_session("user_id")
            if uid:
                return str(uid)
            payload = request.get_session("user_payload")
            if isinstance(payload, dict) and payload.get("id"):
                return str(payload["id"])
        return None

    @staticmethod
    async def _read_json_body(request: Request) -> dict[str, Any]:
        if hasattr(request, "get_json"):
            data = await request.get_json()
            return data if isinstance(data, dict) else {}
        data = getattr(request, "json", None)
        return data if isinstance(data, dict) else {}

    @staticmethod
    @require_permission("melodi_notifications.notifications:read")
    async def unread_count(request: Request, response: Response):
        user_id = NotificationAPIController._resolve_user_id(request)
        if not user_id:
            return response.render_json({"success": False, "error": "Utilisateur non authentifié"}, status_code=401)
        service = NotificationAPIController._get_service(request)
        count = await service.get_unread_count(user_id)
        return response.render_json({"success": True, "unread_count": count})

    @staticmethod
    @require_permission("melodi_notifications.notifications:read")
    async def list_notifications(request: Request, response: Response):
        user_id = NotificationAPIController._resolve_user_id(request)
        if not user_id:
            return response.render_json({"success": False, "error": "Utilisateur non authentifié"}, status_code=401)

        query = getattr(request, "args", None) or getattr(request, "query", None) or {}
        status = query.get("status", "all")
        category = query.get("category") or None
        severity = query.get("severity") or None
        q = query.get("q") or None
        try:
            limit = int(query.get("limit", NotificationConfig.DEFAULT_LIMIT))
        except (TypeError, ValueError):
            limit = NotificationConfig.DEFAULT_LIMIT
        try:
            offset = int(query.get("offset", 0))
        except (TypeError, ValueError):
            offset = 0

        service = NotificationAPIController._get_service(request)
        result = await service.list_notifications(
            user_id,
            status=status,
            category=category,
            severity=severity,
            query_text=q,
            limit=limit,
            offset=offset,
        )
        return response.render_json({"success": True, **result})

    @staticmethod
    @require_permission("melodi_notifications.notifications:write")
    async def send_notification(request: Request, response: Response):
        body = await NotificationAPIController._read_json_body(request)
        current_user_id = NotificationAPIController._resolve_user_id(request)
        if not body.get("user_id") and not body.get("user_ids") and current_user_id:
            body["user_id"] = current_user_id

        service = NotificationAPIController._get_service(request)
        if body.get("user_ids"):
            result = await service.notify_many(body)
        else:
            result = await service.notify(body)

        status_code = 201 if result.get("success") else 400
        return response.render_json(result, status_code=status_code)

    @staticmethod
    @require_permission("melodi_notifications.notifications:read")
    async def mark_read(request: Request, response: Response, notif_id: str | None = None):
        user_id = NotificationAPIController._resolve_user_id(request)
        if not user_id:
            return response.render_json({"success": False, "error": "Utilisateur non authentifié"}, status_code=401)

        target_id = notif_id or (getattr(request, "path_params", {}) or {}).get("notif_id")
        body = await NotificationAPIController._read_json_body(request)
        read_flag = bool(body.get("read", True))

        service = NotificationAPIController._get_service(request)
        result = await service.mark_read(str(target_id), user_id, read=read_flag)
        status_code = 200 if result.get("success") else 404
        return response.render_json(result, status_code=status_code)

    @staticmethod
    @require_permission("melodi_notifications.notifications:read")
    async def mark_all_read(request: Request, response: Response):
        user_id = NotificationAPIController._resolve_user_id(request)
        if not user_id:
            return response.render_json({"success": False, "error": "Utilisateur non authentifié"}, status_code=401)

        service = NotificationAPIController._get_service(request)
        result = await service.mark_all_read(user_id)
        return response.render_json(result)

    @staticmethod
    @require_permission("melodi_notifications.notifications:read")
    async def archive(request: Request, response: Response, notif_id: str | None = None):
        user_id = NotificationAPIController._resolve_user_id(request)
        if not user_id:
            return response.render_json({"success": False, "error": "Utilisateur non authentifié"}, status_code=401)

        target_id = notif_id or (getattr(request, "path_params", {}) or {}).get("notif_id")
        body = await NotificationAPIController._read_json_body(request)
        archived_flag = bool(body.get("archived", True))

        service = NotificationAPIController._get_service(request)
        result = await service.archive(str(target_id), user_id, archived=archived_flag)
        status_code = 200 if result.get("success") else 404
        return response.render_json(result, status_code=status_code)

    @staticmethod
    @require_permission("melodi_notifications.notifications:read")
    async def delete_notification(request: Request, response: Response, notif_id: str | None = None):
        user_id = NotificationAPIController._resolve_user_id(request)
        if not user_id:
            return response.render_json({"success": False, "error": "Utilisateur non authentifié"}, status_code=401)

        target_id = notif_id or (getattr(request, "path_params", {}) or {}).get("notif_id")
        service = NotificationAPIController._get_service(request)
        result = await service.delete_notification(str(target_id), user_id)
        status_code = 200 if result.get("success") else 404
        return response.render_json(result, status_code=status_code)
