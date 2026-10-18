/* Supabase Auth + PostgREST. Passwords are sent to Auth over HTTPS, never stored. */
(function(root) {
  'use strict';
  class IslandCloud {
    constructor(config, hooks = {}, deps = {}) {
      this.config = config || {};
      this.hooks = hooks;
      this.fetch = deps.fetch || root.fetch.bind(root);
      this.local = deps.local || root.localStorage;
      this.tokens = deps.tokens || root.sessionStorage;
      this.auth = null; this.doc = null; this.version = 0;
      this.dirty = false; this.revision = 0; this.epoch = 0;
      this.conflict = null; this.loaded = false; this.flight = null;
      this.refreshFlight = null; this.status = 'guest';
      this.enabled = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(this.config.url || '') &&
        /^sb_publishable_[A-Za-z0-9_-]+$/.test(this.config.publishableKey || '');
      this.base = (this.config.url || '').replace(/\/$/, '');
      this.namespace = 'qiqu-cloud:' + this.base + ':';
      this.authKey = this.namespace + 'session';
    }
    emit(status) { this.status = status; this.hooks.status?.(status, this); }
    cacheKey() { return this.namespace + this.auth.user.id; }
    cache() {
      if (!this.auth || !this.loaded) return;
      try { this.local.setItem(this.cacheKey(), JSON.stringify({state:this.doc,version:this.version,dirty:this.dirty})); }
      catch { this.hooks.warning?.('此浏览器无法保存离线记录，请保持联网并等待同步完成。'); }
    }
    setAuth(data) {
      if (!data.access_token || !data.refresh_token || !data.user?.id) throw Error('登录信息不完整，请重新登录。');
      this.auth = {access_token:data.access_token, refresh_token:data.refresh_token,
        expires_at:data.expires_at || Math.floor(Date.now()/1000)+(data.expires_in || 3600), user:data.user};
      try { this.tokens.setItem(this.authKey, JSON.stringify(this.auth)); } catch { /* this tab still works */ }
    }
    async request(path, {method='GET', body, token, headers={}} = {}) {
      const controller = new AbortController(), timer = setTimeout(()=>controller.abort(), 15000);
      try {
        const response = await this.fetch(this.base + path, {method, signal:controller.signal,
          headers:{apikey:this.config.publishableKey, 'Content-Type':'application/json',
            ...(token ? {Authorization:'Bearer '+token} : {}), ...headers},
          ...(body === undefined ? {} : {body:JSON.stringify(body)})});
        const text = await response.text();
        let data; try { data = text ? JSON.parse(text) : null; } catch { throw Error('账号服务返回了无效内容。'); }
        if (!response.ok) {
          const err = Error(IslandCloud.message(data, response.status));
          err.status = response.status; err.code = data?.code || data?.error_code; throw err;
        }
        return data;
      } catch (err) {
        if (!err.status && (err.name === 'AbortError' || err instanceof TypeError)) {
          const offline = Error('暂时无法连接账号服务，请检查网络后重试。'); offline.offline = true; throw offline;
        }
        throw err;
      } finally { clearTimeout(timer); }
    }
    static message(data, status) {
      const code = data?.code || data?.error_code;
      if (code === 'invalid_credentials') return '邮箱或密码不正确。';
      if (code === 'email_not_confirmed') return '请先打开注册邮件，完成邮箱验证后再登录。';
      if (code === 'user_already_exists') return '注册请求未完成，请尝试登录或找回密码。';
      if (code === 'weak_password') return '密码强度不足，请使用更长的密码。';
      if (status === 429) return '操作太频繁，请稍后重试。';
      if (status === 401 || status === 403) return '登录已失效或没有访问权限，请重新登录。';
      if (code === '42P01' || code === 'PGRST205') return '云端数据表尚未初始化，请联系应用管理员。';
      if (code === '23505') return '另一台设备已创建了档案，请重新同步。';
      return '账号服务暂时无法完成操作，请稍后重试。';
    }
    async access() {
      if (!this.auth) throw Error('请先登录。');
      if (this.auth.expires_at > Date.now()/1000+60) return this.auth.access_token;
      if (!this.refreshFlight) {
        const epoch = this.epoch, refresh = this.auth.refresh_token;
        this.refreshFlight = this.request('/auth/v1/token?grant_type=refresh_token', {method:'POST',body:{refresh_token:refresh}})
          .then(data=>{if(epoch !== this.epoch) throw Error('账号已切换。'); this.setAuth(data); return data.access_token;})
          .finally(()=>{this.refreshFlight = null;});
      }
      return this.refreshFlight;
    }
    async start() {
      if (!this.enabled) { this.emit('unconfigured'); return; }
      const fragment = new URLSearchParams(root.location?.hash?.slice(1) || '');
      const callback = fragment.get('access_token') && fragment.get('refresh_token');
      let saved;
      if (callback) {
        saved = {access_token:fragment.get('access_token'),refresh_token:fragment.get('refresh_token'),
          expires_at:Date.now()/1000+Number(fragment.get('expires_in') || 3600)};
        // Strip credentials before any UI or further navigation.
        root.history?.replaceState(null, '', root.location.pathname + root.location.search);
      } else {
        try { saved = JSON.parse(this.tokens.getItem(this.authKey)); } catch { /* signed out */ }
      }
      if (!saved?.access_token || !saved?.refresh_token) { this.emit('guest'); return; }
      this.hooks.busy?.(true);
      try {
        this.auth = saved;
        const token = await this.access();
        const user = await this.request('/auth/v1/user', {token});
        this.setAuth({...this.auth,user});
        await this.load();
        if (callback && fragment.get('type') === 'recovery') this.hooks.recovery?.();
      } catch (err) {
        if (err.offline && this.auth?.user?.id && this.loadCache()) this.emit('offline');
        else { this.clear(); this.emit('guest'); this.hooks.warning?.(err.message); }
      } finally { this.hooks.busy?.(false); }
    }
    loadCache() {
      try {
        const cached = JSON.parse(this.local.getItem(this.cacheKey()));
        if (!cached || !Number.isSafeInteger(cached.version) || cached.version < 0) return false;
        this.doc = this.hooks.validate(cached.state); this.version = cached.version;
        this.dirty = cached.dirty === true; this.loaded = true;
        this.hooks.state?.(this.doc); return true;
      } catch { return false; }
    }
    async signIn(email, password) {
      if (!this.enabled) throw Error('管理员尚未启用云端账号。');
      if (this.auth) throw Error('请先退出当前账号。');
      this.hooks.busy?.(true); this.epoch++;
      try {
        const data = await this.request('/auth/v1/token?grant_type=password', {method:'POST',body:{email,password}});
        this.setAuth(data);
        await this.load();
      } catch (err) { this.clear(); this.emit('guest'); throw err; }
      finally { this.hooks.busy?.(false); }
    }
    redirect() { return root.location.origin + root.location.pathname; }
    async signUp(email, password, nickname) {
      if (!this.enabled) throw Error('管理员尚未启用云端账号。');
      const data = await this.request('/auth/v1/signup?redirect_to='+encodeURIComponent(this.redirect()),
        {method:'POST',body:{email,password,data:{nickname}}});
      // Account creation never copies the guest's record into a new user implicitly.
      if (data?.access_token) { await this.signIn(email,password); return true; }
      return false;
    }
    async recover(email) {
      return this.request('/auth/v1/recover?redirect_to='+encodeURIComponent(this.redirect()), {method:'POST',body:{email}});
    }
    async changePassword(password) {
      return this.request('/auth/v1/user', {method:'PUT',token:await this.access(),body:{password}});
    }
    async read() {
      const token = await this.access();
      const rows = await this.request('/rest/v1/learning_progress?user_id=eq.'+encodeURIComponent(this.auth.user.id)+'&select=state,version', {token});
      if (!Array.isArray(rows)) throw Error('无法读取学习档案。');
      if (!rows.length) return {state:this.hooks.initial(this.auth.user.user_metadata?.nickname),version:0};
      if(!Number.isSafeInteger(rows[0].version) || rows[0].version < 1) throw Error('云端档案版本无效，请联系管理员。');
      return {state:this.hooks.validate(rows[0].state),version:rows[0].version};
    }
    async load() {
      const epoch = this.epoch;
      const hasCache = this.loadCache();
      let remote;
      try { remote = await this.read(); }
      catch (err) { if(err.offline && hasCache) { this.emit('offline'); return; } throw err; }
      if (epoch !== this.epoch) return;
      if (hasCache && this.dirty) {
        if (this.version !== remote.version) { this.conflict = remote; this.emit('conflict'); return; }
      } else {
        this.doc = remote.state; this.version = remote.version; this.loaded = true;
        this.hooks.state?.(this.doc); this.cache();
      }
      if (this.dirty) await this.flush(); else this.emit('synced');
    }
    save(state) {
      if (!this.auth || !this.loaded) return;
      this.doc = this.hooks.validate(JSON.parse(JSON.stringify(state)));
      this.dirty = true; this.revision++; this.cache();
      if (this.conflict) { this.emit('conflict'); return; }
      this.emit('pending'); clearTimeout(this.timer);
      this.timer = setTimeout(()=>this.flush(), 500);
    }
    async flush() {
      if (this.flight) return this.flight;
      if (!this.auth || !this.loaded || !this.dirty || this.conflict) return;
      this.flight = this.push().finally(()=>{this.flight = null;});
      return this.flight;
    }
    async push() {
      const epoch = this.epoch;
      this.emit('syncing');
      try {
        while (this.dirty && epoch === this.epoch && !this.conflict) {
          const revision = this.revision, version = this.version;
          const token = await this.access();
          if (epoch !== this.epoch) return;
          const path = '/rest/v1/learning_progress' + (version ? '?user_id=eq.'+encodeURIComponent(this.auth.user.id)+'&version=eq.'+version : '');
          let rows;
          try {
            rows = await this.request(path,{method:version?'PATCH':'POST',token,
              body:version?{state:this.doc}:{user_id:this.auth.user.id,state:this.doc},headers:{Prefer:'return=representation'}});
          } catch (err) {
            if (err.status === 409) rows = []; else throw err;
          }
          if (epoch !== this.epoch) return;
          if (!Array.isArray(rows) || !rows.length) {
            this.conflict = await this.read();
            if (epoch === this.epoch) this.emit('conflict'); return;
          }
          this.version = rows[0].version;
          this.dirty = revision !== this.revision; this.cache();
        }
        if (epoch === this.epoch) this.emit('synced');
      } catch (err) {
        if (epoch !== this.epoch) return;
        this.emit(err.offline?'offline':'error'); this.hooks.warning?.(err.message);
      }
    }
    async sync() {
      if (this.conflict) return;
      if (this.dirty) return this.flush();
      this.hooks.busy?.(true);
      try { await this.load(); } catch(err) { this.emit(err.offline?'offline':'error'); this.hooks.warning?.(err.message); }
      finally { this.hooks.busy?.(false); }
    }
    async resolve(useLocal) {
      if (!this.conflict) return;
      const remote = this.conflict; this.conflict = null; this.version = remote.version;
      if (useLocal) { this.dirty = true; this.cache(); return this.flush(); }
      this.doc = remote.state; this.dirty = false; this.revision++;
      this.cache(); this.hooks.state?.(this.doc); this.emit('synced');
    }
    clear() {
      clearTimeout(this.timer); this.epoch++; this.auth=null; this.loaded=false;
      this.doc=null; this.version=0; this.dirty=false; this.conflict=null;
      try { this.tokens.removeItem(this.authKey); } catch { /* no session persistence */ }
      this.hooks.guest?.();
    }
    async signOut(discard=false) {
      if (this.dirty && !discard) throw Error('还有未同步的记录，请先同步或导出备份。');
      const auth = this.auth, key = auth ? this.cacheKey() : null;
      this.clear();
      if (key) try { this.local.removeItem(key); } catch { /* ignore */ }
      this.emit('guest');
      if (auth) try { await this.request('/auth/v1/logout?scope=local',{method:'POST',token:auth.access_token}); } catch { /* locally signed out regardless */ }
    }
  }
  root.IslandCloud = IslandCloud;
  if (typeof module !== 'undefined') module.exports = IslandCloud;
})(typeof window !== 'undefined' ? window : globalThis);
