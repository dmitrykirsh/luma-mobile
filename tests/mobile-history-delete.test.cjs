const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync(require('node:path').join(__dirname,'../app/src/main/assets/app.js'),'utf8');
const expression=src.match(/^const goneMark = .*;$/m)?.[0];
assert.ok(expression,'goneMark exists');
function mark(state,id){const context={S:state,Date};vm.runInNewContext(expression+';goneMark("h",'+JSON.stringify(id)+')',context);return state.gone['h:'+id];}
for(const key of ['123','123:1:2','vk~video~123:1:2','rutube~video~123'])test('history deletion is newer than retained progress '+key,()=>{const now=Date.now(),state={history:[{id:123,ts:now+1000}],progress:{[key]:{ts:now+2000}}};assert.ok(mark(state,'123')>now+2000);});
test('unrelated progress cannot delay history deletion',()=>{const now=Date.now(),state={history:[{id:'123',ts:now}],progress:{'1234:1:2':{ts:now+100000}}};assert.ok(mark(state,123)<now+100000);});
