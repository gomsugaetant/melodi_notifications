from __future__ import annotations

from core.routing import Request, Response
from core.routing.decorator import require_permission
from core.page_builder import Component, Page
from base.components import admin_layout


class NotificationWebController:
    """Contrôleur Web SPA pour MELODI Notifications (/admin/melodi_notifications/)."""

    @staticmethod
    @require_permission("melodi_notifications.notifications:read")
    async def index(request: Request, response: Response):
        content = Component(module_name="melodi_notifications", name="notifications_shell")
        content.add_template("spa/notifications_shell.html")
        page = Page("Notifications", admin_layout(content))
        return await response.render_page(page)
