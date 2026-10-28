/* Run: node tests/verify-resources.js — local-first / fallback / audio race regressions. */
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..');
require(path.join(root,'data/master.js'));
require(path.join(root,'assets/js/core.js'));
require(path.join(root,'assets/js/resources.js'));
require(path.join(root,'assets/js/vendor/sus-parser.js'));
require(path.join(root,'assets/js/chart.js'));
require(path.join(root,'assets/js/export.js'));
const C=globalThis.YoisakiCore,R=globalThis.YoisakiResources,CH=globalThis.YoisakiChart,E=globalThis.YoisakiExport;
const defaultRoot=C.config.assetRoot,calls=[],routes=new Map();
let count=0;
const local='assets/offline/character/member/res011_no049/card_normal.webp';
const remote=defaultRoot+'/character/member/res011_no049/card_normal.webp';
class FakeImage{
 removeAttribute(){}
 set src(value){this._src=value;calls.push({type:'image',url:value,crossOrigin:this.crossOrigin});queueMicrotask(()=>{if(routes.get(value)==='image')this.onload?.();else this.onerror?.();});}
 get src(){return this._src;}
}
globalThis.Image=FakeImage;
globalThis.fetch=async(value,{signal}={})=>{calls.push({type:'fetch',url:value});if(signal?.aborted)throw new DOMException('aborted','AbortError');const route=routes.get(value);if(typeof route==='function')return route(signal);return route||{ok:false,status:404};};
globalThis.requestAnimationFrame=()=>1;
globalThis.cancelAnimationFrame=()=>{};
class FakeAudio{
 constructor(){this.events={};this.duration=200;this.currentTime=0;this.playCalls=0;}
 addEventListener(event,callback){this.events[event]=callback;}
 emit(event){this.events[event]?.();}
 set src(value){this._src=value;this.currentTime=0;calls.push({type:'audio',url:value});}
 get src(){return this._src;}
 removeAttribute(value){if(value==='src')this._src='';}
 load(){}
 pause(){}
 play(){this.playCalls++;return Promise.resolve();}
}
globalThis.Audio=FakeAudio;
async function test(name,run){R.reset();C.config.allowOnline=true;C.config.assetRoot=defaultRoot;calls.length=0;routes.clear();try{await run();count++;console.log('PASS',name);}catch(error){console.error('FAIL',name);throw error;}}
const webp=()=>C.cardArt(1253,false);
const chartText='#TITLE "Resource test"\n#BPM01:120\n#00008:01\n#00012:11\n#00112:11';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function player(){const statuses=[],p=new CH.Player({getContext:()=>null,isConnected:true},{onStatus:(text,status)=>statuses.push({text,status})});p.chart={duration:180,score:{meta:{}}};p.music={fillerSec:3};p.duration=180;return{p,statuses};}
(async()=>{
 await test('local-image-succeeds-without-contacting-CDN',async()=>{routes.set(local,'image');const image=await R.loadImage(webp());assert(image);assert.deepEqual(calls.map(x=>x.url),[local]);assert.equal(calls[0].crossOrigin,undefined);});
 await test('missing-local-image-falls-back-to-CDN',async()=>{routes.set(remote,'image');assert(await R.loadImage(webp()));assert.deepEqual(calls.map(x=>x.url),[local,remote]);assert.equal(calls[1].crossOrigin,'anonymous');});
 await test('missing-local-result-is-reused-until-reset',async()=>{routes.set(remote,'image');assert(await R.loadImage(webp()));calls.length=0;assert(await R.loadImage(webp()));assert.deepEqual(calls.map(x=>x.url),[remote]);R.reset();calls.length=0;assert(await R.loadImage(webp()));assert.equal(calls[0].url,local);});
 await test('bundled-sample-is-used-before-online',async()=>{const value=C.cardArt(1185,true),urls=R.candidates(value);assert(urls[1].startsWith('assets/samples/'));routes.set(urls[1],'image');assert(await R.loadImage(value));assert.deepEqual(calls.map(x=>x.url),urls.slice(0,2));});
 await test('UI-error-candidates-do-not-loop',()=>{const value=webp();assert.equal(R.next(value),remote);assert.equal(R.next(remote),null);assert.equal(R.next('data:image/svg+xml,placeholder'),null);});
 await test('local-only-image-never-contacts-CDN',async()=>{C.config.allowOnline=false;routes.set(remote,'image');assert.equal(await R.loadImage(webp()),null);assert.deepEqual(calls.map(x=>x.url),[local]);});
 await test('local-only-mode-filters-old-online-URL',async()=>{webp();C.config.allowOnline=false;await R.loadImage(remote);assert(calls.every(x=>!x.url.startsWith('http')));});
 await test('Canvas-export-uses-same-local-first-loader',async()=>{routes.set(local,'image');assert(await E.loadImage(webp()));assert.deepEqual(calls.map(x=>x.url),[local]);});
 await test('Canvas-export-failure-can-be-retried',async()=>{const value=R.url('character/member/retry/card_normal.webp');assert.equal(await E.loadImage(value),null);const fallback=defaultRoot+'/character/member/retry/card_normal.webp';routes.set(fallback,'image');assert(await E.loadImage(value));});
 await test('fetch-local-resource-before-online',async()=>{routes.set(local,{ok:true,text:async()=> 'local'});const result=await R.fetchResource(webp(),{parse:r=>r.text()});assert.equal(result.value,'local');assert.deepEqual(calls.map(x=>x.url),[local]);});
 await test('bad-200-local-body-falls-back-to-valid-chart',async()=>{const value=C.chartUrl(999,'expert'),urls=R.candidates(value);routes.set(urls[0],{ok:true,text:async()=>'<html>SPA 404</html>'});routes.set(urls[1],{ok:true,text:async()=>chartText});const result=await CH.fetchChart(999,'expert');assert.equal(result.source,'国服公开资源');assert.deepEqual(calls.map(x=>x.url),urls);});
 await test('local-chart-source-is-labelled-and-stays-offline',async()=>{const value=C.chartUrl(998,'expert');routes.set(value,{ok:true,text:async()=>chartText});C.config.allowOnline=false;const chart=await CH.fetchChart(998,'expert');assert.equal(chart.source,'本地国服谱面');assert.equal(calls.length,1);});
 await test('aborted-request-does-not-start-fallback',async()=>{const controller=new AbortController();routes.set(local,()=>{controller.abort();throw new DOMException('aborted','AbortError');});await assert.rejects(R.fetchResource(webp(),{signal:controller.signal}),{name:'AbortError'});assert.deepEqual(calls.map(x=>x.url),[local]);});
 await test('already-aborted-request-makes-no-network-calls',async()=>{const controller=new AbortController();controller.abort();await assert.rejects(R.fetchResource(webp(),{signal:controller.signal}),{name:'AbortError'});assert.equal(calls.length,0);});
 await test('strict-missing-chart-does-not-request-online',async()=>{C.config.allowOnline=false;await assert.rejects(CH.fetchChart(997,'master'));assert(calls.every(x=>!x.url.startsWith('http')));});
 await test('changing-mirror-rebuilds-fallback-URLs',()=>{const value=webp();C.config.assetRoot='https://example.test/cn/';R.reset();assert.deepEqual(R.candidates(value),[local,'https://example.test/cn/character/member/res011_no049/card_normal.webp']);});
 await test('resource-path-rejects-traversal',()=>{assert.throws(()=>R.url('../private'));assert.throws(()=>R.url('x//y'));});
 await test('audio-tries-local-and-preserves-seek-on-fallback',async()=>{const{p}=player(),value=C.audioUrl({assetbundleName:'0099_01'});p.setAudio(value);const audio=p.audio;p.seek(42);audio.emit('error');assert.equal(audio.src,defaultRoot+'/music/long/0099_01/0099_01.mp3');audio.emit('loadedmetadata');assert.equal(p.time,42);assert.equal(audio.currentTime,45);p.pause();});
 await test('audio-fallback-preserves-pending-play-intent',async()=>{const{p}=player();p.setAudio(C.audioUrl({assetbundleName:'0098_01'}));const firstPlay=p.play();p.audio.emit('error');await firstPlay;await tick();assert.equal(p.playing,true);assert.equal(p._audioFailed,false);assert.equal(p.audio.playCalls,2);p.pause();});
 await test('audio-missing-in-local-only-mode-does-not-contact-CDN',async()=>{C.config.allowOnline=false;const{p}=player();p.setAudio(C.audioUrl({assetbundleName:'0097_01'}));p.audio.emit('error');assert(p._audioFailed);assert(calls.every(x=>!x.url.startsWith('http')));await p.play();assert(p.playing);p.pause();});
 await test('old-audio-error-cannot-switch-new-vocal',()=>{const{p}=player();p.setAudio(C.audioUrl({assetbundleName:'0096_01'}));const old=p.audio;p.setAudio(C.audioUrl({assetbundleName:'0095_01'}));const current=p.audio.src;old.emit('error');assert.equal(p.audio.src,current);p.pause();});
 await test('bundled-audio-is-used-before-CDN',()=>{const{p}=player();p.setAudio(C.audioUrl({assetbundleName:'0001_01'}));p.audio.emit('error');assert.equal(p.audio.src,'assets/audio/0001_01.mp3');assert(calls.every(x=>!x.url.startsWith('http')));p.pause();});
 C.config.allowOnline=true;C.config.assetRoot=defaultRoot;R.reset();
 console.log(`\n${count} resource checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
