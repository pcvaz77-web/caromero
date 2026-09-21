const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i=0; i<12; i++) await new Promise(resolve => setImmediate(resolve)); };
function element() {
  const classes = new Set();
  return { value:'', textContent:'', innerHTML:'', dataset:{}, style:{setProperty(){},removeProperty(){}}, disabled:false,
    classList:{ add:(...names)=>names.forEach(name=>classes.add(name)), remove:(...names)=>names.forEach(name=>classes.delete(name)), contains:name=>classes.has(name), toggle(name,force){const add=force??!classes.has(name);add?classes.add(name):classes.delete(name);return add;} },
    append(){}, appendChild(){}, prepend(){}, before(){}, after(){}, setAttribute(){}, addEventListener(){}, insertAdjacentHTML(){},
    querySelector:()=>element(),querySelectorAll:()=>[], closest:()=>element()
  };
}
function harness(file, { permission='default', storage=new Map(), query, rpc }={}) {
  const nodes=new Map(), events=new Map(), windowEvents=new Map(), channels=[], observers=[], calls=[], messages=[];
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const on=(map,name,fn)=>map.set(name,[...(map.get(name)||[]),fn]);
  const emit=async(map,name,arg={})=>{await Promise.all((map.get(name)||[]).map(fn=>fn(arg)));await flush();};
  let subscription=null;
  const registration={active:true,pushManager:{ getSubscription:async()=>subscription, subscribe:async()=>{
    calls.push('subscribe'); subscription={endpoint:'https://push.test/one',toJSON:()=>({endpoint:'https://push.test/one',keys:{p256dh:'key',auth:'auth'}}),unsubscribe:async()=>{calls.push('unsubscribe');subscription=null;return true;}};return subscription;
  }}};
  const context={user:{id:'user-a'},permission:{role:'viewer'},school:'school-a',document:{ hidden:false,createElement:()=>element(),getElementById:get,querySelector:()=>element(),querySelectorAll:()=>[],head:element(),body:element(),addEventListener:(name,fn)=>on(events,name,fn),dispatchEvent:event=>{for(const fn of events.get(event.type)||[])fn(event);}},
    window:{isSecureContext:true,CAROMETRO_RUNTIME_CONFIG:{vapidPublicKey:'YQ'},PushManager:{},addEventListener:(name,fn)=>on(windowEvents,name,fn)},
    navigator:{userAgent:'Chrome',serviceWorker:{register:async()=>registration,ready:Promise.resolve(registration)}},
    Notification:{permission,requestPermission:()=>{calls.push('permission');context.Notification.permission='granted';return Promise.resolve('granted');}},
    matchMedia:()=>({matches:false,addEventListener(){}}),MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}},
    location:{protocol:'https:'},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},sessionStorage:{setItem(){},removeItem(){}},
    setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},console,Uint8Array,atob:value=>Buffer.from(value,'base64').toString('binary'),
    toast:message=>messages.push(message),alert:message=>messages.push(message),confirm:()=>true,esc:value=>String(value??''),Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type){this.type=type;}},
    db:{auth:{getUser:async()=>({data:{user:context.user}}),onAuthStateChange:fn=>on(events,'auth',fn)},rpc:async(name,args)=>{calls.push(name);return rpc?rpc(name,args):{error:null};},removeChannel:async()=>{},channel:name=>{
      const channel={name,handlers:[],on(event,filter,fn){this.handlers.push({filter,fn});return this;},subscribe(fn){this.status=fn;return this;}};channels.push(channel);return channel;
    },from:table=>{
      const operations=[];const builder={then(resolve,reject){calls.push({table,operations});return Promise.resolve(query?query(table,operations):{data:[],error:null,count:0}).then(resolve,reject);}};
      for(const method of ['select','eq','is','in','order','limit','range','update','insert','upsert','delete','maybeSingle','single','gte','lte','gt'])builder[method]=(...args)=>{operations.push([method,...args]);return builder;};return builder;
    }}
  };
  context.window.Notification=context.Notification;
  context.window.getActiveSchoolId=()=>context.school;
  // Registered ids created by the script must resolve to the same fake node.
  context.document.createElement=()=>{const node=element();Object.defineProperty(node,'id',{set(id){nodes.set(id,node);},get(){return [...nodes].find(([,n])=>n===node)?.[0];}});return node;};
  vm.createContext(context);
  let source=fs.readFileSync(path.join(__dirname,'../..',file),'utf8');
  if(file==='notification-center.js')source=source.replace(/\}\);\s*$/, 'window.testCenter={loadNotifications,refreshUnreadCount,startNotificationCenter,stopNotificationCenter,openNotificationById,getItems:()=>notifications};\n});');
  vm.runInContext(source,context,{filename:file});
  return {context,get,events,windowEvents,channels,observers,calls,messages,storage,registration,emit,ready:()=>emit(events,'DOMContentLoaded'),setSubscription:value=>{subscription=value;}};
}
module.exports={harness,element,deferred,flush};
