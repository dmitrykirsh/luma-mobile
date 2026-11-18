const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('app/src/main/assets/sport.js','utf8');
const start=src.indexOf('function mobileSportTransliterate('),end=src.indexOf('let mobileTwitchSeq=',start);
assert.ok(start>=0&&end>start);
const ctx={};vm.createContext(ctx);vm.runInContext(src.slice(start,end)+'\nthis.matches=mobileEsportsTeamsInMatchTitle;',ctx);
test('Twitch match titles require both distinct teams and a match delimiter',()=>{
  assert.equal(ctx.matches('Alpha vs Beta | LIVE','Alpha','Beta'),true);
  assert.equal(ctx.matches('Beta vs Alpha | LIVE','Alpha','Beta'),true);
  assert.equal(ctx.matches('Alpha vs Gamma | LIVE','Alpha','Beta'),false);
  assert.equal(ctx.matches('Alpha Beta stream','Alpha','Beta'),false);
  assert.equal(ctx.matches('Alpha vs Alpha','Alpha','Alpha'),false);
});

test('programme matching requires two different teams',()=>{
  const c={};vm.createContext(c);vm.runInContext(src.slice(start,end)+'\nthis.programme=mobileEsportsTeamsInTitle;',c);
  assert.equal(c.programme('Alpha vs Beta · live','Alpha','Beta'),true);
  assert.equal(c.programme('Alpha vs Gamma · live','Alpha','Beta'),false);
  assert.equal(c.programme('Alpha vs Alpha','Alpha','Alpha'),false);
});
