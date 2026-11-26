// @ts-nocheck
import { createApp } from '/static/base/melodiJS/index.js';
import { store } from './store.js';
import { router } from './router.js';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mountNotificationsSpa() {
  const host = document.getElementById('melodi-notifications-app');
  if (!host) return;

  const labels = {
    title: host.dataset.title || 'Notifications',
    subtitle: host.dataset.subtitle || '',
    markAll: host.dataset.markAll || 'Tout marquer comme lu',
    refresh: host.dataset.refresh || 'Actualiser',
    filterAll: host.dataset.filterAll || 'Toutes',
    filterUnread: host.dataset.filterUnread || 'Non lues',
    filterRead: host.dataset.filterRead || 'Lues',
    filterArchived: host.dataset.filterArchived || 'Archivées',
    searchPlaceholder: host.dataset.searchPlaceholder || 'Rechercher...',
    severityAll: host.dataset.severityAll || 'Toutes les sévérités',
    severityInfo: host.dataset.severityInfo || 'Info',
    severitySuccess: host.dataset.severitySuccess || 'Succès',
    severityWarning: host.dataset.severityWarning || 'Avertissement',
    severityError: host.dataset.severityError || 'Erreur',
    emptyTitle: host.dataset.emptyTitle || 'Aucune notification',
    emptyDesc: host.dataset.emptyDesc || '',
    markRead: host.dataset.markRead || 'Marquer comme lu',
    markUnread: host.dataset.markUnread || 'Marquer comme non lu',
    archive: host.dataset.archive || 'Archiver',
    unarchive: host.dataset.unarchive || 'Désarchiver',
    deleteLabel: host.dataset.delete || 'Supprimer',
    openAction: host.dataset.openAction || 'Ouvrir',
    loadMore: host.dataset.loadMore || 'Charger plus',
  };

  let searchDebounce: any = null;

  const app = createApp({
    store,
    router,
    data() {
      return {
        labels,
      };
    },
    computed: {
      hasMore(): boolean {
        return this.$store.state.items.length < this.$store.state.total;
      },
    },
    template: `
      <div>
        <!-- En-tête Mobile-First -->
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-stretch align-items-md-center gap-3 mb-3">
          <div>
            <div class="d-flex align-items-center gap-2">
              <h1 class="h4 fw-bold mb-0">[[ labels.title ]]</h1>
              <span v-if="$store.state.unreadCount > 0" class="ds-badge ds-badge-danger ds-badge-pill">
                [[ $store.state.unreadCount ]]
              </span>
            </div>
            <p class="text-muted small mb-0 mt-1">[[ labels.subtitle ]]</p>
          </div>

          <div class="d-flex flex-column flex-sm-row gap-2">
            <button type="button"
                    class="ds-btn ds-btn-outline ds-btn-sm w-100 w-sm-auto"
                    :disabled="$store.state.loading"
                    @click="$store.dispatch('fetchNotifications', false)">
              <img src="/static_base_icons?name=refresh" alt="" width="16" height="16">
              <span>[[ labels.refresh ]]</span>
            </button>
            <button v-if="$store.state.unreadCount > 0"
                    type="button"
                    class="ds-btn ds-btn-primary ds-btn-sm w-100 w-sm-auto"
                    @click="$store.dispatch('markAllRead')">
              <img src="/static_base_icons?name=done_all&fill=white" alt="" width="16" height="16">
              <span>[[ labels.markAll ]]</span>
            </button>
          </div>
        </div>

        <!-- Erreur éventuelle -->
        <div v-if="$store.state.error" class="ds-alert ds-alert-danger mb-3 d-flex justify-content-between align-items-center">
          <span>[[ $store.state.error ]]</span>
          <button type="button" class="ds-close-btn" @click="$store.commit('SET_ERROR', null)">✕</button>
        </div>

        <!-- Filtres Mobile-First -->
        <div class="ds-card p-3 mb-3">
          <div class="notif-tabs-scroll mb-3">
            <button type="button"
                    class="ds-btn ds-btn-sm notif-tab-btn"
                    :class="$store.state.status === 'all' ? 'ds-btn-primary' : 'ds-btn-secondary'"
                    @click="setTab('all')">
              [[ labels.filterAll ]]
            </button>
            <button type="button"
                    class="ds-btn ds-btn-sm notif-tab-btn"
                    :class="$store.state.status === 'unread' ? 'ds-btn-primary' : 'ds-btn-secondary'"
                    @click="setTab('unread')">
              <span>[[ labels.filterUnread ]]</span>
              <span v-if="$store.state.unreadCount > 0" class="ds-badge ds-badge-danger ds-badge-pill">
                [[ $store.state.unreadCount ]]
              </span>
            </button>
            <button type="button"
                    class="ds-btn ds-btn-sm notif-tab-btn"
                    :class="$store.state.status === 'read' ? 'ds-btn-primary' : 'ds-btn-secondary'"
                    @click="setTab('read')">
              [[ labels.filterRead ]]
            </button>
            <button type="button"
                    class="ds-btn ds-btn-sm notif-tab-btn"
                    :class="$store.state.status === 'archived' ? 'ds-btn-primary' : 'ds-btn-secondary'"
                    @click="setTab('archived')">
              [[ labels.filterArchived ]]
            </button>
          </div>

          <div class="row g-2">
            <div class="col-12 col-md-7">
              <input type="search"
                     class="ds-input w-100"
                     :value="$store.state.query"
                     :placeholder="labels.searchPlaceholder"
                     @input="onSearchInput($event.target.value)" />
            </div>
            <div class="col-12 col-md-5">
              <select class="ds-input w-100"
                      :value="$store.state.severity"
                      @change="onSeverityChange($event.target.value)">
                <option value="">[[ labels.severityAll ]]</option>
                <option value="info">[[ labels.severityInfo ]]</option>
                <option value="success">[[ labels.severitySuccess ]]</option>
                <option value="warning">[[ labels.severityWarning ]]</option>
                <option value="error">[[ labels.severityError ]]</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Squelette pendant chargement -->
        <div v-if="$store.state.loading" class="d-flex flex-column gap-2">
          <div class="ds-card p-3"><div class="ds-skeleton-line" style="height: 64px;"></div></div>
          <div class="ds-card p-3"><div class="ds-skeleton-line" style="height: 64px;"></div></div>
          <div class="ds-card p-3"><div class="ds-skeleton-line" style="height: 64px;"></div></div>
        </div>

        <!-- État vide -->
        <div v-else-if="$store.state.items.length === 0" class="ds-card p-4 p-md-5 text-center">
          <img src="/static_base_icons?name=notifications_none" alt="" width="40" height="40" class="mb-2 opacity-50">
          <h2 class="h6 fw-bold mb-1">[[ labels.emptyTitle ]]</h2>
          <p class="text-muted small mb-0">[[ labels.emptyDesc ]]</p>
        </div>

        <!-- Liste des notifications -->
        <div v-else class="d-flex flex-column gap-2">
          <div v-for="item in $store.state.items"
               :key="item.id"
               class="ds-card p-3 notif-card"
               :class="['sev-' + (item.severity || 'info'), item.is_read ? 'is-read' : 'is-unread']">
            <div class="row g-2 align-items-start">
              <div class="col-12 col-md-8">
                <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
                  <span class="ds-badge ds-badge-pill" :class="badgeClass(item.severity)">
                    [[ item.severity || 'info' ]]
                  </span>
                  <span class="ds-badge ds-badge-neutral ds-badge-pill">[[ item.source_module ]]</span>
                  <span class="text-muted small ms-auto ms-md-0">[[ fmtDate(item.created_at) ]]</span>
                </div>
                <div class="fw-semibold mb-1">[[ item.title ]]</div>
                <p class="text-muted small mb-0">[[ item.message ]]</p>
              </div>

              <div class="col-12 col-md-4">
                <div class="notif-actions-row">
                  <a v-if="item.action_url"
                     :href="item.action_url"
                     class="ds-btn ds-btn-primary ds-btn-sm">
                    [[ item.action_label || labels.openAction ]]
                  </a>
                  <button type="button"
                          class="ds-btn ds-btn-secondary ds-btn-sm"
                          @click="$store.dispatch('toggleRead', item)">
                    [[ item.is_read ? labels.markUnread : labels.markRead ]]
                  </button>
                  <button type="button"
                          class="ds-btn ds-btn-outline ds-btn-sm"
                          @click="$store.dispatch('toggleArchive', item)">
                    [[ item.is_archived ? labels.unarchive : labels.archive ]]
                  </button>
                  <button type="button"
                          class="ds-btn ds-btn-ghost ds-btn-sm text-danger"
                          :aria-label="labels.deleteLabel"
                          @click="$store.dispatch('deleteItem', item)">
                    <img src="/static_base_icons?name=delete&fill=%23dc2626" alt="" width="16" height="16">
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="hasMore" class="text-center mt-2">
            <button type="button"
                    class="ds-btn ds-btn-outline w-100 w-md-auto"
                    :disabled="$store.state.loadingMore"
                    @click="$store.dispatch('fetchNotifications', true)">
              [[ labels.loadMore ]]
            </button>
          </div>
        </div>
      </div>
    `,
    methods: {
      fmtDate(iso: string | null) {
        return formatDate(iso);
      },
      badgeClass(sev: string) {
        if (sev === 'success') return 'ds-badge-success';
        if (sev === 'warning') return 'ds-badge-warning';
        if (sev === 'error') return 'ds-badge-danger';
        return 'ds-badge-info';
      },
      setTab(tab: string) {
        this.$store.commit('SET_STATUS', tab);
        this.$router.push('/' + tab);
        this.$store.dispatch('fetchNotifications', false);
      },
      onSearchInput(val: string) {
        this.$store.commit('SET_QUERY', val);
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          this.$store.dispatch('fetchNotifications', false);
        }, 250);
      },
      onSeverityChange(val: string) {
        this.$store.commit('SET_SEVERITY', val);
        this.$store.dispatch('fetchNotifications', false);
      },
    },
    mounted() {
      const hash = (window.location.hash || '').replace(/^#\/?/, '');
      if (['all', 'unread', 'read', 'archived'].includes(hash)) {
        this.$store.commit('SET_STATUS', hash);
      }
      this.$store.dispatch('fetchNotifications', false);

      window.addEventListener('melodi:notifications:sync', () => {
        this.$store.dispatch('fetchNotifications', false);
      });
    },
  });

  app.mount('#melodi-notifications-app');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountNotificationsSpa);
} else {
  mountNotificationsSpa();
}
