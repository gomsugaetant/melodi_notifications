from __future__ import annotations

from typing import Any
from core.module import ApplicationModule, Permission
from modules.melodi_notifications.controllers.api import NotificationAPIController
from modules.melodi_notifications.controllers.web import NotificationWebController
from modules.melodi_notifications.services import NotificationService


class MelodiNotificationsModule(ApplicationModule):
    """Module centralisé de gestion et diffusion des notifications In-App."""

    def __init__(self):
        super().__init__(name="melodi_notifications", router_name="melodi_notifications")
        self.notification_service: NotificationService | None = None

    def _get_permissions(self):
        return [
            Permission(self, "notifications:read", description="Consulter et gérer ses notifications"),
            Permission(self, "notifications:write", description="Envoyer des notifications via API ou modules"),
        ]

    async def run_dev_migrations(self):
        from modules.melodi_notifications.models import NotificationModel
        await self.app.db.create_all([NotificationModel])

    async def load(self):
        self.permissions = self._get_permissions()
        self.notification_service = NotificationService(self)

        if getattr(getattr(self.app, "server", None), "app", None) and self.app.server.app.debug:
            await self.run_dev_migrations()

        # Routes API REST
        for router in (self.api_router, self.api_admin_router):
            router.add_route("/unread-count", NotificationAPIController.unread_count, methods=["GET"])
            router.add_route("/", NotificationAPIController.list_notifications, methods=["GET"])
            router.add_route("/send", NotificationAPIController.send_notification, methods=["POST"])
            router.add_route("/read-all", NotificationAPIController.mark_all_read, methods=["POST"])
            router.add_route("/<notif_id>/read", NotificationAPIController.mark_read, methods=["POST"])
            router.add_route("/<notif_id>/archive", NotificationAPIController.archive, methods=["POST"])
            router.add_route("/<notif_id>", NotificationAPIController.delete_notification, methods=["DELETE"])

        # Route Web SPA
        self.admin_router.add_route("/", NotificationWebController.index, methods=["GET"])

        # Action hooks exposés aux autres modules (découplage strict)
        self.add_action("notify", self.action_notify)
        self.add_action("notify_many", self.action_notify_many)
        self.add_action("mark_read", self.action_mark_read)

        # Intégration découplée avec base (VirtualFK cleanup lors de la suppression d'un utilisateur)
        await self.integration_with_module("base", self._register_base_integrations)

        # Widgets & Navigation
        self.add_widgets()
        self.add_navigation()

    async def _register_base_integrations(self):
        """Enregistre le nettoyage transactionnel des notifications lors de la suppression d'un utilisateur."""
        if self.notification_service:
            self.add_filter(
                "base",
                "user.before_delete",
                self.notification_service.handle_user_before_delete,
            )

    def add_widgets(self):
        self.register_statusbar_item(
            component=self.render_widget_template("notification_bell"),
            priority=90,
            required_role=None,
        )

    def add_navigation(self):
        self.register_navigation(
            label="Notifications",
            icon="name=notifications&fill=white",
            url="/admin/melodi_notifications/",
            priority=20,
            required_permission="melodi_notifications.notifications:read",
        )

    async def action_notify(self, payload: dict[str, Any]):
        if not self.notification_service:
            return {"success": False, "error": "NotificationService non initialisé"}
        return await self.notification_service.notify(payload)

    async def action_notify_many(self, payload: dict[str, Any]):
        if not self.notification_service:
            return {"success": False, "error": "NotificationService non initialisé"}
        return await self.notification_service.notify_many(payload)

    async def action_mark_read(self, payload: dict[str, Any]):
        if not self.notification_service:
            return {"success": False, "error": "NotificationService non initialisé"}
        notif_id = payload.get("id") or payload.get("notif_id")
        user_id = payload.get("user_id")
        if not notif_id or not user_id:
            return {"success": False, "error": "Champs 'notif_id' et 'user_id' requis"}
        return await self.notification_service.mark_read(str(notif_id), str(user_id), read=bool(payload.get("read", True)))


module = MelodiNotificationsModule()
