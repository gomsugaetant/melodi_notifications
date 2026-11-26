import{createApp as u}from"/static/base/melodiJS/index.js";function r(e,a=null){return e?typeof e=="object"&&"data"in e&&e.data!==void 0?e.data:e:a}function m(e){if(!e)return"";const a=new Date(e);if(Number.isNaN(a.getTime()))return"";const d=Math.max(0,Math.floor((Date.now()-a.getTime())/1e3));if(d<60)return"\xC0 l'instant";const s=Math.floor(d/60);if(s<60)return`${s} min`;const l=Math.floor(s/60);return l<24?`${l} h`:`${Math.floor(l/24)} j`}function c(){const e=document.getElementById("melodi-notif-bell-app");if(!e)return;const a=e.dataset.userId||"",d=e.dataset.spaUrl||"/admin/melodi_notifications/",s={title:e.dataset.title||"Notifications",upToDate:e.dataset.upToDate||"\xC0 jour",markAll:e.dataset.markAll||"Tout marquer comme lu",empty:e.dataset.empty||"Vous \xEAtes \xE0 jour.",viewAll:e.dataset.viewAll||"Voir toutes les notifications"};u({data(){return{unreadCount:0,items:[],loading:!1,loadedOnce:!1,labels:s,spaUrl:d,pollTimer:null,wsSubscribed:!1}},template:`
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
    `,methods:{relTime(t){return m(t)},async fetchUnreadCount(){try{const t=window.melodi?.api;if(!t)return;const i=r(await t.get("/api/melodi_notifications/unread-count"),{});typeof i?.unread_count=="number"&&(this.unreadCount=i.unread_count)}catch{}},async fetchPreview(){const t=window.melodi?.api;if(t){this.loading=!0;try{const i=r(await t.get("/api/melodi_notifications/?status=all&limit=8"),{});this.items=Array.isArray(i?.items)?i.items:[],typeof i?.unread_count=="number"&&(this.unreadCount=i.unread_count),this.loadedOnce=!0}catch{}finally{this.loading=!1}}},onToggleDropdown(){this.fetchPreview()},async markAllRead(){const t=window.melodi?.api;if(t)try{await t.post("/api/melodi_notifications/read-all",{}),this.unreadCount=0,this.items=this.items.map(i=>({...i,is_read:!0})),window.dispatchEvent(new CustomEvent("melodi:notifications:sync"))}catch{}},async openItem(t){const i=window.melodi?.api;if(i&&!t.is_read)try{const o=r(await i.post(`/api/melodi_notifications/${t.id}/read`,{read:!0}),{});t.is_read=!0,typeof o?.unread_count=="number"&&(this.unreadCount=o.unread_count),window.dispatchEvent(new CustomEvent("melodi:notifications:sync"))}catch{}t.action_url?window.location.href=t.action_url:window.location.href=this.spaUrl},setupRealtime(){const t=window.wsManager;if(t&&a){const i=`notifications:user_${a}`,o=()=>{this.wsSubscribed||(t.subscribe(i),t.on("notification:new",n=>{typeof n?.unread_count=="number"?this.unreadCount=n.unread_count:this.unreadCount+=1,n?.notification&&(this.items=[n.notification,...this.items].slice(0,8),typeof window.showDsToast=="function"&&window.showDsToast(n.notification.message,n.notification.severity||"info",n.notification.title)),window.dispatchEvent(new CustomEvent("melodi:notifications:sync"))}),t.on("notification:updated",n=>{typeof n?.unread_count=="number"&&(this.unreadCount=n.unread_count)}),t.on("notification:read_all",()=>{this.unreadCount=0,this.items=this.items.map(n=>({...n,is_read:!0}))}),this.wsSubscribed=!0)};t.is_available?o():window.addEventListener("melodi:websocket:available",o)}this.pollTimer=window.setInterval(()=>{const i=window.wsManager;document.hidden||i&&i.is_available&&this.wsSubscribed||this.fetchUnreadCount()},3e4),window.addEventListener("melodi:notifications:sync",()=>{this.fetchUnreadCount()})}},mounted(){this.fetchUnreadCount(),this.setupRealtime()},beforeUnmount(){this.pollTimer&&clearInterval(this.pollTimer)}}).mount("#melodi-notif-bell-app")}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",c):c();
//# sourceMappingURL=bell.js.map
