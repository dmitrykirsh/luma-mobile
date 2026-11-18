const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('app/src/main/assets/sport.js','utf8');
function exported(start,end,name){const i=src.indexOf(start),j=src.indexOf(end,i);assert.ok(i>=0&&j>i);const c={URL};vm.createContext(c);vm.runInContext(src.slice(i,j)+'\nthis.fn='+name,c);return c.fn;}
const dota=exported('function mobileParseDotaSeries(','async function mobileEsportDotaSeries(','mobileParseDotaSeries');
const cito=exported('function mobileCitoStreams(','async function mobileEsportPaintCito(','mobileCitoStreams');
test('Dota tournament data requires fresh running game and safe unique links',()=>{
 const now=Date.now(),data={fetchedAt:new Date(now).toISOString(),matches:[{id:'123',teamA:'Alpha',teamB:'Beta',seriesScore:'1-0',games:[{status:'running',beginAt:new Date(now-100000).toISOString()}],allStreams:[{raw_url:'https://twitch.tv/official123'},{raw_url:'https://twitch.tv/official123'},{raw_url:'https://evil.example/official123'},{raw_url:'https://youtu.be/abcdefghijk'}]}]};
 const rows=dota(data,now);assert.equal(rows.length,1);assert.equal(rows[0].broadcasts.length,2);assert.equal(rows[0].homeScore,'1');assert.equal(dota(data,now+3600000).length,0);
});
test('Cito rejects mismatched teams, stale records and unrelated hosts',()=>{
 const now=Date.now(),row={id:'cs2-match-123',status:'live',startsAt:new Date(now-600000).toISOString(),last_verified:new Date(now).toISOString(),team1Name:'Alpha',team2Name:'Beta',streamLinks:[{url:'https://twitch.tv/officialtv'},{url:'https://evil.example/not'},{url:'https://youtu.be/abcdefghijk'}]},match={id:'csgo_mc_123',live:true,date:now-600000,home:'Alpha',away:'Beta'};
 const html='<script>self.__next_f.push('+JSON.stringify([1,JSON.stringify({matches:[row]})])+')</script>';
 assert.equal(cito(html,match,now).length,2);assert.equal(cito(html,{...match,away:'Gamma'},now).length,0);assert.equal(cito(html,match,now+1800000).length,0);
});

test('Dota results merge only for the same pair of teams',()=>{
  const same=exported('function mobileDotaTeamName(', 'function mobileDotaScore(', 'mobileDotaSameTeams');
  assert.equal(same({home:{name:'Alpha'},away:{name:'Beta'}},{home:'Beta',away:'Alpha'}),true);
  assert.equal(same({home:{name:'Alpha'},away:{name:'Beta'}},{home:'Alpha',away:'Gamma'}),false);
  assert.equal(same({home:{name:'Alpha'},away:{name:'Alpha'}},{home:'Alpha',away:'Alpha'}),false);
  assert.equal(same({home:{name:'PARIVISION'},away:{name:'Aurora Gaming'}},{home:'Aurora',away:'PARIVISION'}),true);
  assert.equal(same({home:{name:'PARIVISION'},away:{name:'Aurora Gaming'}},{home:'Aurora Academy',away:'PARIVISION'}),false);
});
