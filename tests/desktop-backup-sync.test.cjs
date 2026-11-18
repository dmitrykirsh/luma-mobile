const test=require('node:test');
const assert=require('node:assert/strict');
const initBackup=require('../../app/backup.js');
function setup(){const now=Date.now(),store={history:[{id:123,name:'fixture',ts:now-30000}],gone:{'h:123':now-20000},progress:{}};const backup=initBackup({ipcMain:{handle(){}},app:{getVersion:()=> 'test'},getStore:()=>store,saveStore(){},getWindow(){return null},secrets:{}});return {now,store,backup};}
for(const key of ['123','123:1:2','vk~video~123:1:2','rutube~video~123'])test('desktop merge respects newer progress '+key,()=>{const {now,store,backup}=setup();backup.applyObj({app:'Luma',data:{progress:{[key]:{ts:now-10000,t:50,d:500}}}});assert.equal(store.history.length,1);});
test('desktop merge does not restore history from older progress',()=>{const {now,store,backup}=setup();backup.applyObj({app:'Luma',data:{progress:{'vk~video~123:1:2':{ts:now-40000,t:50,d:500}}}});assert.equal(store.history.length,0);});
test('desktop keeps newer mobile position despite clock skew',()=>{const {now,store,backup}=setup(),future=now+120000;store.progress={'123:1:2':{ts:future,t:10,d:500}};backup.applyObj({app:'Luma',data:{progress:{'123:1:2':{ts:future+1,t:35,d:500}}}});assert.equal(store.progress['123:1:2'].t,35);});
