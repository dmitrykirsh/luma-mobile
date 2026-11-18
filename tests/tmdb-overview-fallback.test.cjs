const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/src/main/assets/tmdb.js','utf8');
const start=source.indexOf('const nrm ='),end=source.indexOf('async function matchRec(',start);
function load(result){const ctx={TV_TYPES:[3,4,5,7],tmdb:async path=>path.startsWith('/search/')?{results:[result]}:{...result,overview:'Описание TMDB',images:{},recommendations:{}},console};vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'\nthis.find=tmFindRaw;',ctx);return ctx.find;}
test('uses TMDB description only for the exact title and matching year',async()=>{const r={id:2,name:'Оригинал',first_air_date:'2020-01-01'};assert.equal((await load(r)({type:3,name:'Оригинал',year:2020})).overview,'Описание TMDB');assert.equal((await load(r)({type:3,name:'Оригинал продолжение',year:2020})).overview,'');assert.equal((await load(r)({type:3,name:'Оригинал',year:2022})).overview,'');});
