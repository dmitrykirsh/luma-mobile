const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('app/src/main/assets/app.js','utf8');
const code=src.slice(src.indexOf('function contCard('),src.indexOf('function secHtml('));
function render(h,progress){const context={S:{progress},resumeInfo:(id,s,e)=>progress[s?`${id}:${s}:${e}`:id]||null,mobileSourceProgressKey:(src,vid,id,s,e)=>`${src}~${vid}~${id}:${s}:${e}`,progressPct:()=>20,poster:()=>'',ico:()=>'',esc:String,TYPES:{}};vm.createContext(context);vm.runInContext(code,context);return context.contCard(h);}
test('home source progress never falls back to another source',()=>{const base={id:123,name:'fixture',season:1,episode:2,source:'vk'};assert.match(render({...base,vkId:'v'},{}),/width:0%/);assert.match(render(base,{}),/width:0%/);assert.match(render({...base,vkId:'v'},{'vk~v~123:1:2':{t:150,d:500}}),/width:30%/);});
