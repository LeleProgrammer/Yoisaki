/* Run: node tests/verify-player.js — cancellable playback and stable transport regressions. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
require(path.join(root,'data/master.js'));
require(path.join(root,'assets/js/core.js'));
require(path.join(root,'assets/js/resources.js'));
require(path.join(root,'assets/js/vendor/sus-parser.js'));
require(path.join(root,'assets/js/chart.js'));
const C=globalThis.YoisakiCore,R=globalThis.YoisakiResources,CH=globalThis.YoisakiChart;
let count=0,frameId=0;const frames=new Map(),players=[];
globalThis.requestAnimationFrame=callback=>{frames.set(++frameId,callback);return frameId;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
class DeferredAudio{
 constructor(){this.events={};this.duration=200;this.currentTime=0;this.playCalls=0;this.pauseCalls=0;this.paused=true;this.requests=[];}
 addEventListener(event,callback){this.events[event]=callback;}
 emit(event){this.events[event]?.();}
 set src(value){this._src=value;this.currentTime=0;}
 get src(){return this._src;}
 removeAttribute(name){if(name==='src')this._src='';}
 load(){}
 pause(){this.pauseCalls++;this.paused=true;}
 play(){this.playCalls++;let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});this.requests.push({finish:()=>{this.paused=false;this.emit('playing');resolve();},fail:reject});return promise;}
 finishAll(){for(const request of this.requests.splice(0))request.finish();}
}
globalThis.Audio=DeferredAudio;
function makePlayer(bundle='9998_01'){
 const updates=[],statuses=[],p=new CH.Player({getContext:()=>null,isConnected:true},{onUpdate:p=>updates.push({playing:p.playing,pending:p.pending,active:p.active}),onStatus:(message,state)=>statuses.push({message,state})});
 p.chart={duration:180,score:{meta:{}}};p.music={fillerSec:3};p.duration=180;p.setAudio(C.audioUrl({assetbundleName:bundle}));players.push(p);return{p,audio:p.audio,updates,statuses};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function test(name,run){R.reset();C.config.allowOnline=true;try{await run();count++;console.log('PASS',name);}catch(error){console.error('FAIL',name);throw error;}finally{for(const p of players.splice(0))p.destroy();frames.clear();}}
(async()=>{
 await test('pending-play-is-published-synchronously',async()=>{const{p,audio,updates}=makePlayer();const request=p.play();assert(p.pending);assert(p.active);assert(!p.playing);assert(updates.some(x=>x.pending&&x.active));audio.finishAll();await request;assert(p.playing);assert(!p.pending);});
 await test('second-toggle-cancels-buffering-and-late-completion',async()=>{const{p,audio}=makePlayer();const request=p.toggle();p.toggle();assert(!p.active);assert.equal(audio.playCalls,1);assert(audio.paused);audio.finishAll();await request;assert(!p.active);assert(!p.playing);assert(audio.paused);});
 await test('repeated-play-does-not-restart-pending-request',async()=>{const{p,audio}=makePlayer();const request=p.play();await p.play();assert.equal(audio.playCalls,1);audio.finishAll();await request;assert(p.playing);});
 await test('pause-abort-is-not-an-audio-source-failure',async()=>{const{p,audio}=makePlayer();const url=audio.src,request=p.play();p.pause();audio.requests[0].fail(new DOMException('paused','AbortError'));await request;assert.equal(audio.src,url);assert(!p._audioFailed);assert(!p.active);assert.equal(audio.playCalls,1);});
 await test('old-completion-does-not-cancel-new-play-intent',async()=>{const{p,audio}=makePlayer();const old=p.play();p.pause();const current=p.play();audio.requests[0].finish();await old;assert(p.pending);assert(p.active);assert(!p.playing);audio.requests[1].finish();await current;assert(p.playing);assert(!audio.paused);});
 await test('fifty-rapid-toggles-end-paused-without-ghost-audio',async()=>{const{p,audio}=makePlayer(),requests=[];for(let i=0;i<50;i++){const request=p.toggle();if(request)requests.push(request);}assert.equal(audio.playCalls,25);assert(!p.active);audio.finishAll();await Promise.all(requests);assert(!p.active);assert(audio.paused);});
 await test('cancel-during-fallback-cancels-both-source-requests',async()=>{const{p,audio}=makePlayer();const first=p.toggle();audio.emit('error');assert.equal(audio.playCalls,2);assert(audio.src.startsWith('https://'));assert(p.pending);p.toggle();audio.finishAll();await first;await tick();assert(!p.active);assert(audio.paused);});
 await test('late-source-error-after-pause-does-not-start-fallback',async()=>{const{p,audio}=makePlayer();const request=p.toggle();p.pause();audio.emit('error');audio.emit('loadedmetadata');assert.equal(audio.playCalls,1);audio.finishAll();await request;assert(!p.active);assert(audio.paused);});
 await test('old-vocal-completion-cannot-pause-current-vocal',async()=>{const{p,audio:oldAudio}=makePlayer('9997_01');const old=p.play();p.setAudio(C.audioUrl({assetbundleName:'9996_01'}));const currentAudio=p.audio,current=p.play();currentAudio.finishAll();await current;oldAudio.finishAll();oldAudio.emit('error');await old;assert(p.playing);assert(!currentAudio.paused);assert(oldAudio.paused);assert.equal(currentAudio.playCalls,1);});
 await test('destroy-ignores-late-audio-events-and-play-completion',async()=>{const{p,audio,statuses}=makePlayer();const request=p.play();p.destroy();const size=statuses.length;audio.emit('loadedmetadata');audio.emit('error');audio.finishAll();await request;await p.play();assert.equal(statuses.length,size);assert(!p.active);assert.equal(p.audio,null);assert(audio.paused);});
 await test('switching-to-silent-keeps-audio-paused-after-late-completion',async()=>{const{p,audio}=makePlayer();const request=p.play();p.setOptions({silent:true});assert(p.playing);assert(p.silent);audio.finishAll();await request;assert(p.playing);assert(audio.paused);});
 await test('browser-play-refusal-clears-pending-and-allows-retry',async()=>{const{p,audio,statuses}=makePlayer();const first=p.play();audio.requests[0].fail(new DOMException('gesture required','NotAllowedError'));await first;assert(!p.active);assert(statuses.some(x=>x.message.includes('浏览器阻止')));const second=p.play();audio.requests[1].finish();await second;assert(p.playing);assert.equal(audio.playCalls,2);});
 await test('rate-change-while-pending-can-still-be-cancelled',async()=>{const{p,audio}=makePlayer();const first=p.play();p.setOptions({rate:.5});assert(p.pending);assert.equal(p.rate,.5);p.toggle();audio.finishAll();await first;await tick();assert(!p.active);assert(audio.paused);});
 await test('pause-freezes-time-and-cancels-animation-frame',async()=>{const{p,audio}=makePlayer();const request=p.play();audio.finishAll();await request;audio.currentTime=48;p._frame();p.pause();assert.equal(p.time,45);assert.equal(p._raf,0);audio.currentTime=90;p._frame();assert.equal(p.time,45);assert(audio.paused);});
 await test('unrequested-late-playing-event-is-stopped',()=>{const{p,audio}=makePlayer();audio.paused=false;audio.emit('playing');assert(audio.paused);assert(!p.active);});
 await test('transport-does-not-rebuild-button-for-each-frame',()=>{
  const app=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8'),start=app.indexOf(' function updateTransport('),end=app.indexOf('\n function drawStatic(',start);assert(start>=0&&end>start);
  let replacements=0;const button={dataset:{},attrs:{},set innerHTML(value){replacements++;this.markup=value;},setAttribute(name,value){this.attrs[name]=value;}};
  const elements={'#chart-progress':{max:'1',value:'0'},'#chart-current-time':{textContent:''},'#chart-duration':{textContent:''},'#play-toggle':button};
  const update=vm.runInNewContext('('+app.slice(start,end).trim()+')',{$:selector=>elements[selector],chartState:{seeking:false},icon:name=>'<svg>'+name+'</svg>',formatTime:value=>String(value)});
  const p={active:true,pending:true,playing:false,time:0,duration:180};update(p);assert.equal(button.attrs['aria-label'],'暂停谱面');assert.equal(button.attrs['aria-busy'],'true');assert.equal(replacements,1);
  p.pending=false;p.playing=true;for(let i=0;i<120;i++){p.time=i/60;update(p);}assert.equal(replacements,1);assert.equal(button.attrs['aria-busy'],'false');
  p.active=false;p.playing=false;update(p);assert.equal(replacements,2);assert.equal(button.attrs['aria-label'],'播放谱面');
  for(let i=0;i<120;i++)update(p);assert.equal(replacements,2);
 });
 console.log(`\n${count} playback checks passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
