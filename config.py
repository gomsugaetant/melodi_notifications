from __future__ import annotations

from core import get_prefix_table
from core.db.base_module_tables import BaseModuleTables

MODULE_NAME = "melodi_notifications"
PREFIX_TABLE = get_prefix_table(MODULE_NAME)


class NotificationTables(BaseModuleTables):
    """Noms des tables PostgreSQL préfixées pour melodi_notifications."""

    NOTIFICATIONS = f"{PREFIX_TABLE}notifications"


class NotificationConfig:
    """Paramètres par défaut du module melodi_notifications."""

    SEVERITIES = ("info", "success", "warning", "error")
    DEFAULT_SEVERITY = "info"
    DEFAULT_CATEGORY = "system"
    DEFAULT_LIMIT = 20
    MAX_LIMIT = 100
    BELL_PREVIEW_LIMIT = 8
    POLLING_INTERVAL_MS = 30000
