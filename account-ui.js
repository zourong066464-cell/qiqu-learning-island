(function() {
  'use strict';
  const labels = {unconfigured:'云端账号尚未启用，当前为游客模式。',guest:'游客模式 · 仅保存在本机',synced:'✓ 已与云端同步',
    pending:'有新记录，等待同步…',syncing:'正在同步…',offline:'离线模式 · 本机记录待联网同步',conflict:'两台设备的记录不同，请处理同步冲突。',error:'同步未完成，记录已暂存本机。'};
  let busy = false;
  const cloud = window.qiquCloud = new IslandCloud(window.QIQU_CLOUD, {
    initial, validate,
    state(value) { state = value; render(); },
    guest() { try { state=validate(JSON.parse(localStorage.getItem(KEY))); } catch { state=initial(); } render(); },
    status() { renderAccount(); },
    warning:toast,
    busy(value) { busy=value; const main=$('main'); main.inert=value; main.classList.toggle('cloud-busy',value); },
    recovery() { passwordForm(); }
  });
  window.renderAccount = renderAccount;
  function renderAccount() {
    $('#nickname-display').textContent=state.nickname;
    $('#profile-avatar').textContent=state.avatar;
    $('#profile-avatar-select').value=state.avatar;
    if(document.activeElement!==$('#nickname')) $('#nickname').value=state.nickname;
    $('#account').textContent=cloud.auth ? state.avatar+' '+state.nickname : '♙ 我的账号';
    $('#account-description').textContent=cloud.auth ? '已登录 · '+cloud.auth.user.email : '游客模式，记录保存在本机。';
    $('#sync-status').textContent=cloud.status==='guest'&&cloud.enabled&&cloud.config.registrationEnabled===false?'云端已连接 · 邮件注册待启用':labels[cloud.status] || '';
    const live=$('#account-live-status'); if(live)live.textContent=labels[cloud.status] || '';
  }
  function accountDialog() {
    if(busy) { toast('正在读取账号档案，请稍候。'); return; }
    if(!cloud.enabled) {
      show('账号功能待启用','<div class="account-card"><strong>每个人，都可以有自己的学习岛</strong><p>账号页面和云端同步代码已准备好，管理员还需连接云端服务，才能开放注册。</p><p>启用后，每个账号分别保存昵称、年级、星星、错题和学习记录，并可在手机与电脑之间同步。</p></div><p class="account-tip">现在可以继续以游客身份学习，原有记录仍保存在这台设备上。账号启用后，可选择把游客记录复制到自己的账号。</p><button class="primary" id="continue-guest">继续游客探索</button>');
      $('#continue-guest').onclick=hide;return;
    }
    if(!cloud.auth) { authForm('login'); return; }
    show('我的学习账号',`<div class="account-card"><strong>${esc(state.nickname)}的学习岛</strong><p>${esc(cloud.auth.user.email)}</p><p id="account-live-status" role="status">${esc(labels[cloud.status])}</p><p>${state.grade} 年级 · ${state.stars} 颗星星 · ${state.mistakes.length} 道待复习错题</p></div><div class="account-actions"><button class="primary" id="sync-now">立即同步</button><button class="secondary" id="edit-profile">修改昵称和目标</button><button class="secondary" id="change-password">修改密码</button><button class="secondary" id="copy-guest">复制本机游客记录</button><button class="secondary" id="sign-out">退出账号</button></div><p class="account-tip">每个家长邮箱对应一个孩子的独立学习档案。账号登录仅保留在当前标签页会话中。共用设备请退出账号。</p>`);
    $('#sync-now').onclick=async()=>{if(cloud.conflict)conflictDialog();else {await cloud.sync();if(cloud.conflict)conflictDialog();}};
    $('#edit-profile').onclick=()=>{hide();go('parent');$('#nickname').focus();};
    $('#change-password').onclick=passwordForm;
    $('#copy-guest').onclick=copyGuest;
    $('#sign-out').onclick=signOutDialog;
  }
  function authForm(mode) {
    if((mode==='signup'||mode==='recover')&&cloud.config.registrationEnabled===false){
      show('邮件服务待启用','<div class="account-card"><strong>云端学习档案已准备好</strong><p>管理员还在配置注册验证邮件，暂时无法注册新账号或发送密码重置邮件。现有账号可以继续登录。</p><p>现在可以先以游客身份探索；原有游客记录会保留，之后可以选择复制到自己的账号。</p></div><div class="account-actions"><button class="primary" id="service-guest">先以游客探索</button><button class="secondary" id="service-login">已有账号，去登录</button></div>');
      $('#service-guest').onclick=hide;$('#service-login').onclick=()=>authForm('login');return;
    }
    const signup=mode==='signup', recover=mode==='recover';
    show(signup?'注册一个学习账号':recover?'找回密码':'欢迎回到学习岛',`<p class="account-tip">请由家长使用邮箱操作。孩子使用昵称即可，无需填写真实姓名。</p><form class="account-form" id="auth-form"><label>家长邮箱<input type="email" id="auth-email" autocomplete="email" maxlength="254" required></label>${signup?'<label>孩子的昵称<input id="auth-nickname" autocomplete="nickname" minlength="1" maxlength="20" required placeholder="例如：小橙子"></label>':''}${recover?'':`<label>密码<input type="password" id="auth-password" autocomplete="${signup?'new-password':'current-password'}" minlength="${signup?'8':'1'}" maxlength="128" required ${signup?'placeholder="至少 8 位，建议混合字母和数字"':''}></label>`}${signup?'<label>再次输入密码<input type="password" id="auth-confirm" autocomplete="new-password" minlength="8" maxlength="128" required></label>':''}<div id="auth-message" class="account-message" role="status"></div><button class="primary" type="submit" id="auth-submit">${signup?'注册账号':recover?'发送重置邮件':'登录我的小岛'}</button></form><div class="account-actions"><button class="text-btn" id="switch-auth">${signup||recover?'已有账号，去登录':'没有账号，去注册'}</button>${!signup&&!recover?'<button class="text-btn" id="forgot-password">忘记密码</button>':''}<button class="text-btn" id="guest-mode">先以游客探索</button></div>`);
    $('#switch-auth').onclick=()=>authForm(signup||recover?'login':'signup');
    if(!signup&&!recover&&cloud.config.registrationEnabled===false){
      $('#auth-message').textContent='云端已连接。注册验证邮件仍在配置，当前仅供已有账号登录。';
    }
    if($('#forgot-password'))$('#forgot-password').onclick=()=>authForm('recover');
    $('#guest-mode').onclick=hide;
    const form=$('#auth-form'), message=$('#auth-message'), submit=$('#auth-submit');
    form.onsubmit=async event=>{
      event.preventDefault(); if(submit.disabled)return;
      const email=$('#auth-email').value.trim(), password=$('#auth-password')?.value;
      const nickname=$('#auth-nickname')?.value.trim();
      if(signup&&(!nickname||password!==$('#auth-confirm').value)){message.textContent=!nickname?'请填写孩子的昵称。':'两次输入的密码不一致。';return;}
      submit.disabled=true;message.textContent='正在处理，请稍候…';
      try {
        if(recover){await cloud.recover(email);message.textContent='如果邮箱已注册，你会收到重置邮件。请检查收件箱和垃圾邮件。';return;}
        if(signup){const signedIn=await cloud.signUp(email,password,nickname);if(!signedIn){form.reset();message.textContent='请检查邮箱并完成验证，然后回到这里登录。若未收到邮件，请联系管理员检查邮件服务。';return;}}
        else await cloud.signIn(email,password);
        if(form.isConnected){hide();toast('欢迎来到自己的学习岛！');if(cloud.conflict)conflictDialog();}
      }catch(err){message.textContent=err.message;}
      finally{submit.disabled=false;}
    };
  }
  function passwordForm() {
    show('设置新密码','<form class="account-form" id="password-form"><label>新密码<input id="new-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>再次输入新密码<input id="confirm-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><div id="password-message" class="account-message" role="status"></div><button class="primary" type="submit" id="password-submit">保存新密码</button></form>');
    const message=$('#password-message'), submit=$('#password-submit');
    $('#password-form').onsubmit=async e=>{e.preventDefault();if(submit.disabled)return;const password=$('#new-password').value;if(password!==$('#confirm-password').value){message.textContent='两次输入的密码不一致。';return;}submit.disabled=true;try{await cloud.changePassword(password);hide();toast('密码已修改，请妥善保管。');}catch(err){message.textContent=err.message;}finally{submit.disabled=false;}};
  }
  function conflictDialog() {
    const other=cloud.conflict;if(!other)return;
    show('选择要保留的学习记录',`<p class="account-tip">这份档案在另一台设备上也有更新。请选择保留哪一份；不会自动相加或覆盖。可以先导出本机备份。</p><div class="account-card"><p>本机：${state.stars} 颗星星，${state.total} 次尝试</p><p>云端：${other.state.stars} 颗星星，${other.state.total} 次尝试</p></div><div class="account-actions"><button class="secondary" id="conflict-backup">先导出本机备份</button><button class="primary" id="use-cloud">使用云端记录</button><button class="secondary" id="use-device">用本机记录替换云端</button></div>`);
    $('#conflict-backup').onclick=()=>download('qiqu-unsynced-'+dayKey()+'.json',JSON.stringify(state,null,2),'application/json');
    const choose=async local=>{hide();await cloud.resolve(local);toast(cloud.status==='synced'?'已保留所选记录。':'请查看家长设置中的同步状态。');};
    $('#use-cloud').onclick=()=>choose(false);$('#use-device').onclick=()=>choose(true);
  }
  function copyGuest() {
    let guest;try{guest=validate(JSON.parse(localStorage.getItem(KEY)));}catch{toast('本机还没有游客学习记录。');return;}
    show('将游客记录复制到此账号？',`<p class="account-tip">游客记录有 ${guest.stars} 颗星星、${guest.total} 次尝试。复制会替换当前账号的记录，并在联网时同步。请先备份当前账号记录。</p><div class="account-actions"><button class="secondary" id="before-copy">备份当前账号</button><button class="primary" id="confirm-copy">确认替换此账号记录</button><button class="secondary" id="cancel-copy">取消</button></div>`);
    $('#before-copy').onclick=()=>download('qiqu-before-copy-'+dayKey()+'.json',JSON.stringify(state,null,2),'application/json');
    $('#confirm-copy').onclick=()=>{state=guest;save();hide();toast('已复制到当前账号，正在等待同步。');};$('#cancel-copy').onclick=accountDialog;
  }
  function signOutDialog() {
    if(!cloud.dirty){hide();cloud.signOut();return;}
    show('还有未同步的记录','<p class="account-tip">先联网同步，或导出备份。直接退出会清除这个账号在本机的缓存，未同步的进度将丢失。</p><div class="account-actions"><button class="primary" id="stay-signed-in">返回继续同步</button><button class="secondary" id="logout-backup">导出备份</button><button class="secondary" id="discard-signout">放弃未同步进度并退出</button></div>');
    $('#stay-signed-in').onclick=accountDialog;$('#logout-backup').onclick=()=>download('qiqu-unsynced-'+dayKey()+'.json',JSON.stringify(state,null,2),'application/json');
    $('#discard-signout').onclick=()=>{hide();cloud.signOut(true);};
  }
  $('#account').onclick=accountDialog;$('#manage-account').onclick=accountDialog;
  $('#nickname').onchange=event=>{const value=event.target.value.trim();if(!value){event.target.value=state.nickname;toast('昵称不能为空。');return;}state.nickname=value.slice(0,20);save();};
  $('#profile-avatar-select').onchange=event=>{if(avatars.includes(event.target.value)){state.avatar=event.target.value;save();}};
  window.addEventListener('online',()=>{if(cloud.auth)cloud.flush();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&cloud.auth&&cloud.loaded&&!session&&!busy)cloud.sync();});
  renderAccount();cloud.start();
})();
