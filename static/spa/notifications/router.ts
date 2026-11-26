// @ts-nocheck
import { MelodiRouter } from '/static/base/melodiJS/index.js';

const EmptyView = { template: '<div></div>' };

export const router = new MelodiRouter({
  mode: 'hash',
  routes: [
    { path: '/', name: 'notifications-all', component: EmptyView },
    { path: '/all', name: 'notifications-all-tab', component: EmptyView },
    { path: '/unread', name: 'notifications-unread', component: EmptyView },
    { path: '/read', name: 'notifications-read', component: EmptyView },
    { path: '/archived', name: 'notifications-archived', component: EmptyView },
    { path: '*', name: 'notifications-fallback', component: EmptyView },
  ],
});
