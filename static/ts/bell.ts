// @ts-nocheck
import { createApp } from '/static/base/melodiJS/index.js';

function unwrap(res: any, fallback: any = null) {
  if (!res) return fallback;
  if (typeof res === 'object' && 'data' in res && res.data !== undefined) {
    return res.data;
  }
  return res;
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return "À l'instant";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} j`;
}

function mountNotificationBell() {
  const host = document.getElementById('melodi-notif-bell-app');
  if (!host) return;

  const userId = host.dataset.userId || '';
  const spaUrl = host.dataset.spaUrl || '/admin/melodi_notifications/';
  const labels = {
    title: host.dataset.title || 'Notifications',
    upToDate: host.dataset.upToDate || 'À jour',
    markAll: host.dataset.markAll || 'Tout marquer comme lu',
    empty: host.dataset.empty || 'Vous êtes à jour.',
    viewAll: host.dataset.viewAll || 'Voir toutes les notifications',
  };

  const app = createApp({
    data() {
      return {
        unreadCount: 0,
        items: [] as any[],
        loading: false,
        loadedOnce: false,
        labels,
        spaUrl,
        pollTimer: null as any,
        wsSubscribed: false,
      };
    },
    template: `
      <div class="dropdown">
        <button class="ds-icon-btn ds-icon-btn-ghost position-relative melodi-notif-trigger"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                aria-haspopup="true"
                :aria-label="labels.title"
                @click="onToggleDropdown">
          <img :src="unreadCount > 0 ? '/static_base_icons?name=notifications_active' : '/static_base_icons?name=notifications_none'"
               alt="" width="20" height="20">
          <span v-if="unreadCount > 0" class="melodi-notif-badge">
            [[ unreadCount > 99 ? '99+' : unreadCount ]]
          </span>
        </button>

        <div class="dropdown-menu dropdown-menu-end ds-notification-menu melodi-notif-dropdown shadow-sm border mt-2 p-0">
          <div class="px-3 py-2 border-bottom d-flex justify-content-between align-items-center gap-2">
            <span class="fw-semibold small">[[ labels.title ]]</span>
            <button v-if="unreadCount > 0"
                    type="button"
                    class="ds-btn ds-btn-ghost ds-btn-sm py-1 px-2"
                    style="font-size: 0.72rem;"
                    @click.stop="markAllRead">
              [[ labels.markAll ]]
            </button>
            <span v-else class="ds-badge ds-badge-neutral ds-badge-pill" style="font-size: 0.65rem;">
              [[ labels.upToDate ]]
            </span>
          </div>

          <div class="melodi-notif-list">
            <div v-if="loading && !loadedOnce" class="p-3">
              <div class="ds-skeleton-line mb-2" style="height: 38px;"></div>
              <div class="ds-skeleton-line" style="height: 38px;"></div>
            </div>

            <div v-else-if="items.length === 0" class="p-4 text-center text-muted small">
              [[ labels.empty ]]
            </div>

            <div v-else>
              <div v-for="item in items"
                   :key="item.id"
                   class="melodi-notif-item"
                   :class="{ 'is-unread': !item.is_read }"
                   @click="openItem(item)">
                <span class="melodi-notif-dot" :class="'sev-' + (item.severity || 'info')"></span>
                <div class="flex-grow-1 min-w-0">
                  <div class="d-flex justify-content-between align-items-start gap-2">
                    <span class="fw-semibold small text-truncate">[[ item.title ]]</span>
                    <span class="text-muted flex-shrink-0" style="font-size: 0.7rem;">[[ relTime(item.created_at) ]]</span>
                  </div>
                  <p class="text-muted small mb-0 mt-1 text-truncate">[[ item.message ]]</p>
                </div>
              </div>
            </div>
          </div>

          <div class="p-2 border-top text-center">
            <a :href="spaUrl" class="small fw-semibold text-decoration-none d-block py-1">
              [[ labels.viewAll ]]
            </a>
          </div>
        </div>
      </div>
    `,
    methods: {
      relTime(iso: string | null) {
        return formatRelativeTime(iso);
      },
      async fetchUnreadCount() {
        try {
          const api = (window as any).melodi?.api;
          if (!api) return;
          const res = unwrap(await api.get('/api/melodi_notifications/unread-count'), {});
          if (typeof res?.unread_count === 'number') {
            this.unreadCount = res.unread_count;
          }
        } catch {
          // Silencieux pour ne pas perturber la navigation globale
        }
      },
      async fetchPreview() {
        const api = (window as any).melodi?.api;
        if (!api) return;
        this.loading = true;
        try {
          const res = unwrap(await api.get('/api/melodi_notifications/?status=all&limit=8'), {});
          this.items = Array.isArray(res?.items) ? res.items : [];
          if (typeof res?.unread_count === 'number') {
            this.unreadCount = res.unread_count;
          }
          this.loadedOnce = true;
        } catch {
          // Ignoré
        } finally {
          this.loading = false;
        }
      },
      onToggleDropdown() {
        this.fetchPreview();
      },
      async markAllRead() {
        const api = (window as any).melodi?.api;
        if (!api) return;
        try {
          await api.post('/api/melodi_notifications/read-all', {});
          this.unreadCount = 0;
          this.items = this.items.map((n: any) => ({ ...n, is_read: true }));
          window.dispatchEvent(new CustomEvent('melodi:notifications:sync'));
        } catch {
          // Ignoré
        }
      },
      async openItem(item: any) {
        const api = (window as any).melodi?.api;
        if (api && !item.is_read) {
          try {
            const res = unwrap(await api.post(`/api/melodi_notifications/${item.id}/read`, { read: true }), {});
            item.is_read = true;
            if (typeof res?.unread_count === 'number') {
              this.unreadCount = res.unread_count;
            }
            window.dispatchEvent(new CustomEvent('melodi:notifications:sync'));
          } catch {
            // Ignoré
          }
        }
        if (item.action_url) {
          window.location.href = item.action_url;
        } else {
          window.location.href = this.spaUrl;
        }
      },
      setupRealtime() {
        const ws = (window as any).wsManager;
        if (ws && userId) {
          const channel = `notifications:user_${userId}`;
          const bindWs = () => {
            if (this.wsSubscribed) return;
            ws.subscribe(channel);
            ws.on('notification:new', (payload: any) => {
              if (typeof payload?.unread_count === 'number') {
                this.unreadCount = payload.unread_count;
              } else {
                this.unreadCount += 1;
              }
              if (payload?.notification) {
                this.items = [payload.notification, ...this.items].slice(0, 8);
                if (typeof (window as any).showDsToast === 'function') {
                  (window as any).showDsToast(
                    payload.notification.message,
                    payload.notification.severity || 'info',
                    payload.notification.title
                  );
                }
              }
              window.dispatchEvent(new CustomEvent('melodi:notifications:sync'));
            });
            ws.on('notification:updated', (payload: any) => {
              if (typeof payload?.unread_count === 'number') this.unreadCount = payload.unread_count;
            });
            ws.on('notification:read_all', () => {
              this.unreadCount = 0;
              this.items = this.items.map((n: any) => ({ ...n, is_read: true }));
            });
            this.wsSubscribed = true;
          };

          if (ws.is_available) {
            bindWs();
          } else {
            window.addEventListener('melodi:websocket:available', bindWs);
          }
        }

        // Fallback polling léger (30s) uniquement si WS non disponible et onglet actif
        this.pollTimer = window.setInterval(() => {
          const wsMgr = (window as any).wsManager;
          if (document.hidden) return;
          if (wsMgr && wsMgr.is_available && this.wsSubscribed) return;
          this.fetchUnreadCount();
        }, 30000);

        window.addEventListener('melodi:notifications:sync', () => {
          this.fetchUnreadCount();
        });
      },
    },
    mounted() {
      this.fetchUnreadCount();
      this.setupRealtime();
    },
    beforeUnmount() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
      }
    },
  });

  app.mount('#melodi-notif-bell-app');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountNotificationBell);
} else {
  mountNotificationBell();
}
