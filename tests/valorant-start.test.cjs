const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/src/main/assets/sport.js','utf8'),start=source.indexOf('function mobileValorantConfirmedStart('),end=source.indexOf('let mobileTwitchSeq=',start),ctx={};
vm.createContext(ctx);vm.runInContext(source.slice(start,end)+';this.parse=mobileValorantConfirmedStart',ctx);
const now=Date.parse('2026-11-18T12:47:00Z'),date='Thursday, November 19',time='10:00 AM +04',raw='2026-11-19 01:00:00';
test('accepts the explicit timezone only when the countdown agrees',()=>{assert.equal(ctx.parse(date,time,raw,'17h 13m',now),Date.parse('2026-11-19T06:00:00Z'));assert.equal(ctx.parse(date,time,raw,'12h 13m',now),null);});
test('rejects uncertain or malformed times rather than scheduling a wrong reminder',()=>{for(const [d,t,y,eta] of [[date,'10:00 AM CET',raw,'17h 13m'],[date,time,raw,'17h'],[date,time,raw,'LIVE'],['Thursday, February 30',time,raw,'17h 13m'],[date,'10:00 AM +15',raw,'17h 13m'],[date,time,'', '17h 13m']])assert.equal(ctx.parse(d,t,y,eta,now),null);});
test('handles a year boundary and a fractional numeric timezone',()=>{const current=Date.parse('2026-12-31T17:25:00Z');assert.equal(ctx.parse('Friday, January 1','12:00 AM +05:30','2026-12-31 18:30:00','1h 5m',current),Date.parse('2026-12-31T18:30:00Z'));});
