/* Run: node tests/verify.js — no npm dependencies. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
require(path.join(root,'data/master.js'));
require(path.join(root,'assets/js/core.js'));
require(path.join(root,'assets/js/resources.js'));
require(path.join(root,'assets/js/vendor/sus-parser.js'));
require(path.join(root,'assets/js/chart.js'));
const C=globalThis.YoisakiCore,CH=globalThis.YoisakiChart;
let count=0;
function test(name,run){try{run();count++;console.log('PASS',name);}catch(error){console.error('FAIL',name);throw error;}}
function project(value,template){if(Array.isArray(template))return value.map((x,i)=>project(x,template[i]));if(template&&typeof template==='object')return Object.fromEntries(Object.keys(template).map(k=>[k,project(value[k],template[k])]));return value;}
const fixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'power-fixtures.json'),'utf8'));
for(const item of fixtures.cases)test('power/'+item.id,()=>{const input=item.input,actual=C.deckPower(input.plan,input.side||'target');assert.deepEqual(project(actual,item.expected),item.expected);});
for(const item of fixtures.materialCases)test('materials/'+item.id,()=>{const actual=C.calculate(item.input.plan).resources.map(({key,quantity,owned,shortage})=>({key,quantity,owned,shortage})).sort((a,b)=>a.key.localeCompare(b.key));const expected=[...item.expectedResources].sort((a,b)=>a.key.localeCompare(b.key));assert.deepEqual(actual,expected);});
const skillFixtures=JSON.parse(fs.readFileSync(path.join(__dirname,'skill-description-fixtures.json'),'utf8'));
for(const item of skillFixtures.cases)test('skill/'+item.id,()=>{const i=item.input;assert.equal(C.skillDescription(C.cards.get(i.cardId),i.level,i),item.expected);});
test('skills/all-released-original-and-trained-texts-resolve',()=>{for(const card of C.releasedCards)for(let level=1;level<=4;level++){assert(!/\{\{|待核对/.test(C.skillDescription(card,level)),`card ${card.id}`);if(card.specialTrainingSkillId)assert(!/\{\{|待核对/.test(C.skillDescription(card,level,{skillId:card.specialTrainingSkillId,characterRank:50})),`trained card ${card.id}`);}});
test('data/card-level-arrays-have-real-entries',()=>{for(const card of C.T.cards)for(const k of ['param1','param2','param3'])assert(card.cardParameters[k].length>=C.maxLevel(card,true),`card ${card.id}`);});
test('data/area-costs-cover-every-level-exactly',()=>{assert.equal(C.areaLevels.size,C.areaCosts.size);for(const key of C.areaLevels.keys())assert(C.areaCosts.has(key));});
test('data/released-cards-never-include-future-entries',()=>{for(const c of C.releasedCards)assert(c.releaseAt<=Math.min(Date.now(),C.D.meta.releaseCutoff));});
test('data/bundled-card-art-candidates-exist',()=>{for(const id of [C.T.cards.find(c=>c.assetbundleName==='res017_no001').id,1185])for(const thumb of [false,true])for(const trained of [false,true]){const urls=globalThis.YoisakiResources.candidates(C.cardArt(id,trained,thumb));assert(urls.some(url=>url.startsWith('assets/samples/')&&fs.existsSync(path.join(root,url))),urls.join(', '));}});
const timing=`#TITLE "Timing fixture"\n#BPM01:120\n#BPM02:240\n#00002:4\n#00008:01\n#00108:02\n#00202:3\n#00012:11\n#00312:11`;
test('SUS/BPM-and-beats-per-bar-segment-integration',()=>{const chart=CH.prepare(timing);assert.equal(chart.score.getTime(1),2);assert.equal(chart.score.getTime(2),3);assert.equal(chart.score.getTime(3),3.75);});
test('SUS/fractional-bar-BPM-change',()=>{const c=CH.prepare('#TITLE "Midbar"\n#BPM01:120\n#BPM02:240\n#00008:0102\n#00012:11\n#00112:11');assert.equal(c.score.getTime(1),1.5);});
test('SUS/merge-critical-slide-and-flick-no-duplicate-objects',()=>{const c=CH.prepare('#TITLE "Merge"\n#BPM01:120\n#00008:01\n#00012:21\n#000320:11\n#00152:11\n#001320:21\n#002330:11\n#003340:21');assert.equal(c.notes.length,4);assert(c.notes[0].critical);assert(c.notes[1].critical);assert(c.notes[1].original.directional);assert.equal(c.notes[1].next,null);assert(!c.notes[2].critical);assert.equal(c.notes[2].next,c.notes[3]);});
test('SUS/zero-scroll-speed-does-not-change-audio-timing',()=>{const c=CH.prepare('#TITLE "Stop"\n#BPM01:120\n#00008:01\n#TIL00:"0\'0:1,1\'0:0,2\'0:1"\n#HISPEED 00\n#00012:11\n#00312:11');assert.equal(c.score.getTime(2),4);assert.equal(c.scrollAt(2),c.scrollAt(4));assert.equal(c.scrollAt(5)-c.scrollAt(4),1);});
test('SUS/reject-HTML-instead-of-rendering-fake-score',()=>assert.throws(()=>CH.prepare('<html>upstream error</html>')));
for(const file of fs.readdirSync(path.join(root,'data/charts')).filter(x=>x.endsWith('.sus')))test('SUS/real-cn-'+file,()=>{const c=CH.prepare(fs.readFileSync(path.join(root,'data/charts',file),'utf8'));assert(c.notes.length>100);assert(c.duration>60&&c.duration<600);for(const note of c.notes){assert(Number.isFinite(note.time));assert(note.lane>=0&&note.lane<12);assert(note.width>0);}});
test('plans/JSON-roundtrip-preserves-calculations',()=>{const p=fixtures.cases.find(x=>x.input.plan.mode==='team').input.plan;const restored=C.sanitizePlan(JSON.parse(JSON.stringify(p)));assert.deepEqual(C.deckPower(restored,'target'),C.deckPower(p,'target'));});
test('plans/unknown-card-import-fails',()=>{const p=C.emptyPlan();p.slots[0]={cardId:999999,current:{},target:{}};assert.throws(()=>C.sanitizePlan(p));});
test('plans/resource-type-and-id-are-separate-inventory-keys',()=>{const p=C.emptyPlan();p.inventory={'material:3':4,'mysekai_material:3':9,'javascript:3':100};const r=C.sanitizePlan(p);assert.equal(r.inventory['material:3'],4);assert.equal(r.inventory['mysekai_material:3'],9);assert(!('javascript:3'in r.inventory));});
test('plans/ordinary-team-rejects-duplicate-character',()=>{const p=C.emptyPlan();const a=C.releasedCards.find(c=>c.characterId===17);p.slots[0]=C.newSlot(a.id);p.slots[1]=C.newSlot(a.id);assert(C.validate(p).errors.some(e=>e.includes('重复')));});
test('plans/target-downgrade-is-rejected',()=>{const p=C.emptyPlan();p.slots[0]=C.newSlot(1185);p.slots[0].current.master=4;p.slots[0].target.master=2;assert(C.validate(p).errors.length>0);});
console.log(`\n${count} checks passed. CN data ${C.D.meta.masterVersion} (${C.D.meta.commit.slice(0,12)}).`);
