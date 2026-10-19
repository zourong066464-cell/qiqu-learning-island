'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const IslandCloud=require('../cloud.js');
const config={url:'https://test-project.supabase.co',publishableKey:'sb_publishable_test'};
const clone=value=>JSON.parse(JSON.stringify(value));
const initial=(nickname='Explorer')=>({v:1,nickname,stars:0});
const validate=value=>{assert.equal(value.v,1);assert.equal(typeof value.nickname,'string');return clone(value);};
function storage(){const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),values};}
function server(){
  const rows=new Map(), users={a:{id:'user-a',email:'a@example.test',user_metadata:{nickname:'Apple'}},b:{id:'user-b',email:'b@example.test',user_metadata:{nickname:'Banana'}}};
  let offline=false, hold=null, writes=0;
  const response=(status,data)=>({ok:status<400,status,text:async()=>JSON.stringify(data)});
  const fetch=async(input,options)=>{
    if(offline)throw new TypeError('network offline');
    const url=new URL(input),body=options.body?JSON.parse(options.body):{}, token=options.headers.Authorization?.split(' ')[1];
    const owner=token?.split(':')[0];
    if(url.pathname.endsWith('/token')){
      const id=body.email?.[0]||body.refresh_token?.[0];
      if(!users[id]||body.password==='bad')return response(400,{error_code:'invalid_credentials'});
      return response(200,{access_token:id+':access',refresh_token:id+':refresh',expires_in:3600,user:users[id]});
    }
    if(url.pathname.endsWith('/user'))return response(200,users[owner]);
    if(url.pathname.endsWith('/logout'))return response(204,null);
    assert.ok(owner,'records must carry authenticated token');
    const user=users[owner],row=rows.get(user.id);
    if(options.method==='GET')return response(200,row?[clone(row)]:[]);
    writes++;
    if(hold){const release=hold;hold=null;await release;}
    if(options.method==='POST'){
      assert.equal(body.user_id,user.id,'write owner must match user');
      if(row)return response(409,{code:'23505'});
      const next={state:clone(body.state),version:1};rows.set(user.id,next);return response(201,[clone(next)]);
    }
    assert.equal(url.searchParams.get('user_id'),'eq.'+user.id);
    if(!row||url.searchParams.get('version')!=='eq.'+row.version)return response(200,[]);
    const next={state:clone(body.state),version:row.version+1};rows.set(user.id,next);return response(200,[clone(next)]);
  };
  return {fetch,rows,users,set offline(v){offline=v;},hold(p){hold=p;},get writes(){return writes;}};
}
function client(s,local=storage(),tokens=storage()){
  let displayed=null,guestCalls=0;
  const cloud=new IslandCloud(config,{initial,validate,state:s=>displayed=clone(s),guest:()=>{displayed=null;guestCalls++;}}, {fetch:s.fetch,local,tokens});
  return {cloud,local,tokens,get displayed(){return displayed;},get guestCalls(){return guestCalls;}};
}
test('two accounts keep distinct profiles, logout clears account session and cache',async()=>{
  const s=server(),c=client(s),cloud=c.cloud;
  await cloud.signIn('a@example.test','correct');
  assert.equal(c.displayed.nickname,'Apple');cloud.save({...initial('Apple'),stars:5});await cloud.flush();
  assert.equal(s.rows.get('user-a').state.stars,5);
  await cloud.signOut();assert.equal(cloud.auth,null);assert.equal(c.displayed,null);assert.equal(c.tokens.values.size,0);assert.equal(c.local.values.size,0);
  await cloud.signIn('b@example.test','correct');assert.equal(c.displayed.stars,0);assert.equal(c.displayed.nickname,'Banana');
  cloud.save({...initial('Banana'),stars:2});await cloud.flush();await cloud.signOut();
  await cloud.signIn('a@example.test','correct');assert.equal(c.displayed.stars,5);await cloud.signOut();
});
test('offline changes are retained and flushed after reconnect, dirty logout is blocked',async()=>{
  const s=server(),c=client(s);await c.cloud.signIn('a@example.test','correct');s.offline=true;
  c.cloud.save({...initial('Apple'),stars:3});await c.cloud.flush();assert.equal(c.cloud.status,'offline');
  await assert.rejects(c.cloud.signOut(),/未同步/);assert.ok(c.cloud.auth);
  s.offline=false;await c.cloud.flush();assert.equal(c.cloud.status,'synced');assert.equal(s.rows.get('user-a').state.stars,3);await c.cloud.signOut();
});
test('simultaneous devices detect conflict and require an explicit choice',async()=>{
  const s=server(),a=client(s),b=client(s);await a.cloud.signIn('a@example.test','correct');await b.cloud.signIn('a@example.test','correct');
  a.cloud.save({...initial('Apple'),stars:10});await a.cloud.flush();
  b.cloud.save({...initial('Apple'),stars:2});await b.cloud.flush();assert.equal(b.cloud.status,'conflict');assert.equal(s.rows.get('user-a').state.stars,10);
  await b.cloud.resolve(false);assert.equal(b.displayed.stars,10);assert.equal(b.cloud.dirty,false);
  a.cloud.save({...initial('Apple'),stars:11});await a.cloud.flush();
  b.cloud.save({...initial('Apple'),stars:12});await b.cloud.flush();assert.equal(b.cloud.status,'conflict');
  await b.cloud.resolve(true);assert.equal(s.rows.get('user-a').state.stars,12);await a.cloud.signOut();await b.cloud.signOut();
});
test('changes made during a slow write are sent in a second write',async()=>{
  const s=server(),c=client(s);await c.cloud.signIn('a@example.test','correct');
  let release;const wait=new Promise(resolve=>release=resolve);s.hold(wait);
  c.cloud.save({...initial('Apple'),stars:1});const writing=c.cloud.flush();
  await new Promise(resolve=>setImmediate(resolve));c.cloud.save({...initial('Apple'),stars:2});release();await writing;
  assert.equal(s.rows.get('user-a').state.stars,2);assert.equal(s.writes,2);assert.equal(c.cloud.dirty,false);await c.cloud.signOut();
});
test('logout during an in-flight request cannot restore the old account',async()=>{
  const s=server(),c=client(s);await c.cloud.signIn('a@example.test','correct');let release;const wait=new Promise(resolve=>release=resolve);s.hold(wait);
  c.cloud.save({...initial('Apple'),stars:8});const writing=c.cloud.flush();await new Promise(resolve=>setImmediate(resolve));await c.cloud.signOut(true);
  await c.cloud.signIn('b@example.test','correct');release();await writing;
  assert.equal(c.cloud.auth.user.id,'user-b');assert.equal(c.displayed.nickname,'Banana');assert.equal(c.cloud.version,0);await c.cloud.signOut();
});
test('invalid credentials do not reveal another account or store a password',async()=>{
  const s=server(),c=client(s);await assert.rejects(c.cloud.signIn('a@example.test','bad'),/邮箱或密码/);
  assert.equal(c.cloud.auth,null);assert.equal(c.displayed,null);
  await c.cloud.signIn('a@example.test','a-secret-password');assert.ok(!JSON.stringify([...c.tokens.values]).includes('a-secret-password'));await c.cloud.signOut();
});
test('expired session refreshes once for concurrent authenticated requests',async()=>{
  const s=server(),c=client(s);await c.cloud.signIn('a@example.test','correct');c.cloud.auth.expires_at=0;
  const tokens=await Promise.all([c.cloud.access(),c.cloud.access()]);assert.deepEqual(tokens,['a:access','a:access']);await c.cloud.signOut();
});
test('an old account write finishing cannot clear the new account write',async()=>{
  const s=server(),c=client(s);await c.cloud.signIn('a@example.test','correct');
  let releaseA,releaseB;
  s.hold(new Promise(resolve=>releaseA=resolve));
  c.cloud.save({...initial('Apple'),stars:8});const oldWrite=c.cloud.flush();
  await new Promise(resolve=>setImmediate(resolve));await c.cloud.signOut(true);
  await c.cloud.signIn('b@example.test','correct');
  s.hold(new Promise(resolve=>releaseB=resolve));
  c.cloud.save({...initial('Banana'),stars:4});const newWrite=c.cloud.flush();
  await new Promise(resolve=>setImmediate(resolve));const currentFlight=c.cloud.flight;
  releaseA();await oldWrite;assert.equal(c.cloud.flight,currentFlight);
  releaseB();await newWrite;assert.equal(s.rows.get('user-b').state.stars,4);assert.equal(c.cloud.status,'synced');await c.cloud.signOut();
});
test('reloading offline restores only the authenticated account and later syncs edits',async()=>{
  const s=server(),first=client(s);await first.cloud.signIn('a@example.test','correct');
  first.cloud.save({...initial('Apple'),stars:6});await first.cloud.flush();
  s.offline=true;const reopened=client(s,first.local,first.tokens);await reopened.cloud.start();
  assert.equal(reopened.cloud.status,'offline');assert.equal(reopened.displayed.stars,6);assert.equal(reopened.cloud.auth.user.id,'user-a');
  reopened.cloud.save({...initial('Apple'),stars:7});await reopened.cloud.flush();
  s.offline=false;await reopened.cloud.flush();assert.equal(s.rows.get('user-a').state.stars,7);await reopened.cloud.signOut();first.cloud.clear();
});
test('recovery callback strips URL credentials and validates identity before opening reset form',async()=>{
  const s=server(),local=storage(),tokens=storage();let recovered=0;const navigations=[];
  const cloud=new IslandCloud(config,{initial,validate,recovery:()=>recovered++},{fetch:s.fetch,local,tokens,
    location:{origin:'https://example.test',protocol:'https:',pathname:'/island/',search:'',hash:'#access_token=a:access&refresh_token=a:refresh&expires_in=3600&type=recovery'},
    history:{replaceState:(_state,_title,url)=>navigations.push(url)}});
  await cloud.start();assert.deepEqual(navigations,['/island/']);assert.equal(cloud.auth.user.id,'user-a');assert.equal(recovered,1);await cloud.signOut();
});
test('mail setup gate blocks registration and recovery without sending network requests',async()=>{
  let calls=0;const cloud=new IslandCloud({...config,registrationEnabled:false},{initial,validate},{local:storage(),tokens:storage(),fetch:async()=>{calls++;throw Error('should not send');}});
  await assert.rejects(cloud.signUp('a@example.test','password123','Apple'),/邮件服务尚未启用/);
  await assert.rejects(cloud.recover('a@example.test'),/邮件找回功能尚未启用/);assert.equal(calls,0);
});
test('returning to an idle signed-in device refreshes its clean cloud profile',async()=>{
  const s=server(),a=client(s),b=client(s);await a.cloud.signIn('a@example.test','correct');await b.cloud.signIn('a@example.test','correct');
  a.cloud.save({...initial('Apple'),stars:9});await a.cloud.flush();await b.cloud.sync();assert.equal(b.displayed.stars,9);
  await a.cloud.signOut();await b.cloud.signOut();
});
