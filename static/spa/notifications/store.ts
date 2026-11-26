// @ts-nocheck
import { MelodiStore } from '/static/base/melodiJS/index.js';

function unwrap(res: any, fallback: any = null) {
  if (!res) return fallback;
  if (typeof res === 'object' && 'data' in res && res.data !== undefined) {
    return res.data;
  }
  return res;
}

export const store = new MelodiStore({
  state: {
    items: [] as any[],
    total: 0,
    unreadCount: 0,
    status: 'all', // all | unread | read | archived
    severity: '',
    query: '',
    limit: 20,
    offset: 0,
    loading: false,
    loadingMore: false,
    error: null as string | null,
  },

  mutations: {
    SET_STATUS(state, status: string) {
      state.status = status || 'all';
      state.offset = 0;
    },
    SET_SEVERITY(state, severity: string) {
      state.severity = severity || '';
      state.offset = 0;
    },
    SET_QUERY(state, query: string) {
      state.query = query || '';
      state.offset = 0;
    },
    SET_LOADING(state, flag: boolean) {
      state.loading = Boolean(flag);
    },
    SET_LOADING_MORE(state, flag: boolean) {
      state.loadingMore = Boolean(flag);
    },
    SET_ERROR(state, err: string | null) {
      state.error = err;
    },
    SET_DATA(state, { payload, append }: { payload: any; append: boolean }) {
      const nextItems = Array.isArray(payload?.items) ? payload.items : [];
      state.items = append ? [...state.items, ...nextItems] : nextItems;
      state.total = Number(payload?.total ?? state.items.length);
      if (typeof payload?.unread_count === 'number') {
        state.unreadCount = payload.unread_count;
      }
    },
    UPDATE_ITEM(state, updated: any) {
      state.items = state.items.map((item: any) => (item.id === updated.id ? updated : item));
    },
    REMOVE_ITEM(state, id: string) {
      state.items = state.items.filter((item: any) => item.id !== id);
      state.total = Math.max(0, state.total - 1);
    },
    SET_UNREAD_COUNT(state, count: number) {
      state.unreadCount = Math.max(0, Number(count) || 0);
    },
    MARK_ALL_LOCAL(state) {
      state.unreadCount = 0;
      state.items = state.items.map((item: any) => ({ ...item, is_read: true }));
    },
  },

  actions: {
    async fetchNotifications({ state, commit }: any, append = false) {
      const api = (window as any).melodi?.api;
      if (!api) return;

      commit('SET_ERROR', null);
      if (append) {
        commit('SET_LOADING_MORE', true);
      } else {
        commit('SET_LOADING', true);
        state.offset = 0;
      }

      try {
        const params = new URLSearchParams();
        params.set('status', state.status || 'all');
        params.set('limit', String(state.limit));
        params.set('offset', String(append ? state.items.length : 0));
        if (state.severity) params.set('severity', state.severity);
        if (state.query.trim()) params.set('q', state.query.trim());

        const res = unwrap(await api.get(`/api/melodi_notifications/?${params.toString()}`), {});
        commit('SET_DATA', { payload: res, append });
      } catch (err: any) {
        commit('SET_ERROR', err?.message || 'Erreur lors du chargement des notifications.');
      } finally {
        commit('SET_LOADING', false);
        commit('SET_LOADING_MORE', false);
      }
    },

    async toggleRead({ state, commit }: any, item: any) {
      const api = (window as any).melodi?.api;
      if (!api || !item?.id) return;
      const nextRead = !item.is_read;
      try {
        const res = unwrap(await api.post(`/api/melodi_notifications/${item.id}/read`, { read: nextRead }), {});
        if (res?.notification) {
          if (state.status === 'unread' && nextRead) {
            commit('REMOVE_ITEM', item.id);
          } else {
            commit('UPDATE_ITEM', res.notification);
          }
        }
        if (typeof res?.unread_count === 'number') {
          commit('SET_UNREAD_COUNT', res.unread_count);
        }
        window.dispatchEvent(new CustomEvent('melodi:notifications:sync'));
      } catch (err: any) {
        commit('SET_ERROR', err?.message || 'Action impossible.');
      }
    },

    async markAllRead({ state, commit, dispatch }: any) {
      const api = (window as any).melodi?.api;
      if (!api) return;
      try {
        await api.post('/api/melodi_notifications/read-all', {});
        commit('MARK_ALL_LOCAL');
        if (state.status === 'unread') {
          await dispatch('fetchNotifications', false);
        }
        window.dispatchEvent(new CustomEvent('melodi:notifications:sync'));
      } catch (err: any) {
        commit('SET_ERROR', err?.message || 'Action impossible.');
      }
    },

    async toggleArchive({ commit }: any, item: any) {
      const api = (window as any).melodi?.api;
      if (!api || !item?.id) return;
      const nextArchived = !item.is_archived;
      try {
        const res = unwrap(
          await api.post(`/api/melodi_notifications/${item.id}/archive`, { archived: nextArchived }),
          {}
        );
        commit('REMOVE_ITEM', item.id);
        if (typeof res?.unread_count === 'number') {
          commit('SET_UNREAD_COUNT', res.unread_count);
        }
        window.dispatchEvent(new CustomEvent('melodi:notifications:sync'));
      } catch (err: any) {
        commit('SET_ERROR', err?.message || 'Action impossible.');
      }
    },

    async deleteItem({ commit }: any, item: any) {
      const api = (window as any).melodi?.api;
      if (!api || !item?.id) return;
      try {
        const res = unwrap(await api.delete(`/api/melodi_notifications/${item.id}`), {});
        commit('REMOVE_ITEM', item.id);
        if (typeof res?.unread_count === 'number') {
          commit('SET_UNREAD_COUNT', res.unread_count);
        }
        window.dispatchEvent(new CustomEvent('melodi:notifications:sync'));
      } catch (err: any) {
        commit('SET_ERROR', err?.message || 'Suppression impossible.');
      }
    },
  },
});
