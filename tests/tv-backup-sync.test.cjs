const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('../tv/app/src/main/assets/app.js','utf8');
const line=src.split(/\r?\n/).find(x=>x.includes('const seenAfter = (id, ts)'));
assert.ok(line);
function newer(key,t){const c={S:{progress:{}},d:{progress:{[key]:{ts:t}}}};vm.createContext(c);vm.runInContext(line+'\nthis.check=seenAfter;',c);return c.check(123,200);}
test('TV recognizes source-specific newer progress',()=>{for(const k of ['123','123:1:2','vk~video~123:1:2','rutube~video~123'])assert.equal(newer(k,300),true);assert.equal(newer('vk~video~123:1:2',100),false);});
