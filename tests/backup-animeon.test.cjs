const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function context(channel = true) {
  const S={favs:[],history:[],seen:{},done:{},gone:{},progress:{},secrets:{},extra:{}};
  const ctx={S,window:channel?{LumaAnimeOnSecret:{}}:{},save(){},aoAdoptSecret(value){ctx.adopted=value;},console};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('app/src/main/assets/backup.js','utf8')+'\nthis.merge = mergeBackup;',ctx);
  return ctx;
}

test('preserves data from other devices and takes newer timestamps',()=>{
  const c=context();
  c.merge({data:{sourceHistory:{a:{ts:20,title:'new'}},sportFollows:{b:{ts:20,enabled:true}},tvEpgLinks:{c:{ts:20,name:'channel'}},trackedPremieres:[{id:'x'}],watchPrefs:{'ao:x':{ts:20,voice:'v'}},done:{'ao:x:1':['1']},progress:{'ao:x:1:1':{ts:20,t:30,d:1000}}}});
  c.merge({data:{sourceHistory:{a:{ts:10,title:'old'},other:{ts:10}},sportFollows:{b:{ts:10,enabled:false}},watchPrefs:{'ao:x':{ts:10,voice:'old'}},done:{'ao:x:1':['2']},progress:{'ao:x:1:1':{ts:10,t:10,d:1000}}}});
  assert.equal(c.S.extra.syncForeign.sourceHistory.a.title,'new');
  assert.ok(c.S.extra.syncForeign.sourceHistory.other);
  assert.equal(c.S.extra.syncForeign.sportFollows.b.enabled,true);
  assert.equal(c.S.extra.syncForeign.tvEpgLinks.c.name,'channel');
  assert.equal(c.S.extra.syncForeign.trackedPremieres[0].id,'x');
  assert.equal(c.S.extra.watchPrefs['ao:x'].voice,'v');
  assert.deepEqual(Array.from(c.S.done['ao:x:1']),['1','2']);
  assert.equal(c.S.progress['ao:x:1:1'].t,30);
});

test('moves AnimeOn secret to secure channel and refuses unsafe merge',()=>{
  const c=context();c.merge({secrets:{animeon:'example'},data:{}});
  assert.equal(c.adopted,'example');assert.equal(c.S.secrets.animeon,undefined);
  const unsafe=context(false);
  assert.throws(()=>unsafe.merge({secrets:{animeon:'example'},data:{favs:[{id:1}]}}),/SECURE_CHANNEL/);
  assert.equal(unsafe.S.favs.length,0);
});


test('keeps history when a source has newer viewing progress than its deletion',()=>{
  const now=Date.now(),c=context();c.S.history=[{id:123,name:'test',ts:now-30000}];c.S.gone={'h:123':now-20000};
  c.merge({data:{progress:{'vk~video~123:1:2':{ts:now-10000,t:30,d:1000}}}});
  assert.equal(c.S.history.length,1);
  const older=context();older.S.history=[{id:123,name:'test',ts:now-30000}];older.S.gone={'h:123':now-20000};
  older.merge({data:{progress:{'vk~video~123:1:2':{ts:now-40000,t:30,d:1000}}}});
  assert.equal(older.S.history.length,0);
});

test('list removals survive stale devices and newer saves are restored',()=>{
  const now=Date.now(),c=context(),url='https://example.test/list';
  c.S.extra.lists=[{url,title:'older',at:now-30000}];
  c.merge({data:{gone:{['l:'+url]:now-20000},lists:[{url,title:'stale',at:now-25000}]}});
  assert.equal(c.S.extra.lists.length,0);
  c.merge({data:{lists:[{url,title:'saved again',at:now-10000}]}});
  assert.equal(c.S.extra.lists.length,1);
  assert.equal(c.S.extra.lists[0].title,'saved again');
  c.merge({data:{lists:[{url,title:'old copy',at:now-30000}]}});
  assert.equal(c.S.extra.lists[0].title,'saved again');
  c.merge({data:{gone:{['l:'+url]:now-5000}}});
  assert.equal(c.S.extra.lists.length,0);
});

test('newer favorite and history survive deletion with mixed numeric ids',()=>{
  const now=Date.now(),c=context();c.S.favs=[{id:'42',at:now-30000}];c.S.history=[{id:'42',ts:now-30000}];
  c.merge({data:{gone:{'f:42':now-20000,'h:42':now-20000},favs:[{id:42,at:now-10000}],history:[{id:42,ts:now-10000}]}});
  assert.equal(c.S.favs.length,1);assert.equal(c.S.favs[0].at,now-10000);
  assert.equal(c.S.history.length,1);assert.equal(c.S.history[0].ts,now-10000);
});
