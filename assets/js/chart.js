/* Native Canvas score viewer and audio transport. GPL-3.0. */
(function(global){
 'use strict';
 const S=global.YoisakiSUS;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const mix=(a,b,t)=>a+(b-a)*t;
 const palette={tap:'#83dbeb',slide:'#82dfb9',flick:'#f1a5cc',critical:'#f7d47f',damage:'#ac84e9',guide:'#8d85d5'};
 function prepare(text){
  if(typeof text!=='string'||!/^#(?:TITLE|\d{3}|BPM|REQUEST)/m.test(text))throw new Error('资源内容不是有效的 SUS 谱面。');
  const score=S.parseSusText(text);if(!score.notes.length)throw new Error('谱面没有可显示的音符。');
  const map=new Map();const notes=score.notes.map((o,i)=>{const slide=o instanceof S.Slide,directional=o instanceof S.Directional;const d=slide?o.directional:directional?o:null;const q={id:i,original:o,time:score.getTime(o.bar),bar:o.bar.toNumber(),lane:o.lane-2,width:o.width,type:o.type,kind:slide?'slide':d?'flick':o.type===3?'flick':o.type===4?'damage':o.isTrend()?'trace':'tap',critical:o.isCritical(),hidden:o.isNone()||(slide&&o.type===S.SlideType.INVISIBLE),guide:slide&&o.decoration,direction:d?.type||1,ratio:o.speed||1,next:null};map.set(o,q);return q;});
  for(const n of notes)if(n.original instanceof S.Slide&&n.original.next)n.next=map.get(n.original.next)||null;
  const scrollEvents=[{time:0,position:0,speed:1}];let last=scrollEvents[0];
  for(const e of score.events){if(e.speed===null)continue;const time=score.getTime(e.bar),position=last.position+(time-last.time)*last.speed;const x={time,position,speed:Number(e.speed)};scrollEvents.push(x);last=x;}
  function scrollAt(time){let lo=0,hi=scrollEvents.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(scrollEvents[mid].time<=time)lo=mid;else hi=mid-1;}const e=scrollEvents[lo];return e.position+(time-e.time)*e.speed;}
  const end=Math.max(...notes.map(n=>n.time))+1.5;const maxbar=Math.ceil(Math.max(...notes.map(n=>n.bar)))+1;const bars=[];
  for(let b=0;b<=maxbar;b++){const [time,e]=score.getTimedEvent(b);bars.push({bar:b,time,bpm:e.bpm?.toNumber()||120,beats:e.barLength?.toNumber()||4});}
  const bpms=[...new Set(score.events.filter(e=>e.bpm!==null).map(e=>Number(e.bpm.toNumber().toFixed(3))))];
  return{score,notes,bars,duration:end,bpms,scrollAt,scrollEvents};
 }
 function color(n){return n.critical?palette.critical:n.guide?palette.guide:n.kind==='slide'?palette.slide:n.kind==='flick'?palette.flick:n.kind==='damage'?palette.damage:palette.tap;}
 function roundRect(ctx,x,y,w,h,r=3){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
 function drawFlick(ctx,x,y,width,dir,col,scale=1){
  const side=[3,5].includes(dir)?-1:[4,6].includes(dir)?1:0;const down=[2,5,6].includes(dir);const size=Math.min(width*.33,13*scale);ctx.strokeStyle=col;ctx.lineWidth=Math.max(2,2.4*scale);ctx.lineJoin='round';
  for(let j=0;j<2;j++){const yy=y-(10+j*7)*scale;ctx.beginPath();if(side){ctx.moveTo(x-side*size*.5,yy+size*.5);ctx.lineTo(x+side*size*.5,yy);ctx.lineTo(x-side*size*.5,yy-size*.5);}else{ctx.moveTo(x-size,yy+(down?-1:1)*size*.55);ctx.lineTo(x,yy-(down?-1:1)*size*.4);ctx.lineTo(x+size,yy+(down?-1:1)*size*.55);}ctx.stroke();}
 }
 function normalizeStateTime(value,max){return clamp(Number(value)||0,0,Math.max(0,max));}
 class Player{
  constructor(canvas,{onUpdate=()=>{},onStatus=()=>{}}={}){
   this.canvas=canvas;this.ctx=canvas.getContext('2d');this.onUpdate=onUpdate;this.onStatus=onStatus;this.chart=null;this.music=null;this.time=0;this.playing=false;this.speed=10;this.rate=1;this.volume=.65;this.offsetMs=0;this.silent=false;this.audio=null;this.duration=1;this._raf=0;this._loadId=0;this._playToken=0;this._clockTime=0;this._clockStart=0;this._audioFailed=false;this._playPending=false;this._destroyed=false;
   this._resize=()=>this.draw();global.addEventListener?.('resize',this._resize);
  }
  get pending(){return this._playPending;}
  get active(){return this.playing||this._playPending;}
  toggle(){if(this.active){this.pause();return;}return this.play();}
  load(chart,music,url){if(this._destroyed)return;this.pause();this._loadId++;this.chart=chart;this.music=music;this.time=0;this.duration=chart.duration;this._audioFailed=false;this.setAudio(url);this.draw();this.onUpdate(this);}
  audioOffset(){return Math.max(0,Number(this.music?.filterSec??this.music?.fillerSec??0)+Number(this.chart?.score.meta.waveoffset||0)+this.offsetMs/1000);}
  setAudio(url){
   if(this._destroyed)return;this.pause();const previous=this.audio;this.audio=null;if(previous){previous.pause();previous.removeAttribute('src');previous.load();}
   this._audioFailed=false;this._audioFallback=null;let source=url&&global.YoisakiResources.candidates(url)[0];if(!source){this.audio=null;this.onStatus('当前没有可用音源；可下载本地资源、启用在线回退或使用无声预览。','warning');return;}
   const id=this._loadId;const audio=new Audio();this.audio=audio;audio.preload='metadata';audio.volume=this.volume;audio.playbackRate=this.rate;
   const assign=()=>{if(global.YoisakiResources.isRemote(source))audio.crossOrigin='anonymous';else audio.removeAttribute('crossorigin');audio.src=source;audio.load();};
   const advance=()=>{if(this.audio!==audio||id!==this._loadId)return false;const next=global.YoisakiResources.next(source),resume=this.active,t=this.currentTime();this.pause();this.time=t;if(next){source=next;assign();this.onStatus('正在读取备用音源…','loading');if(resume)this.play();return true;}this._audioFailed=true;this.seek(t);this.onStatus('音源暂不可用：可点击播放进行无声谱面预览，或下载本地资源。','warning');return false;};
   this._audioFallback=advance;
   audio.addEventListener('loadedmetadata',()=>{if(this.audio!==audio||id!==this._loadId)return;this.duration=Math.max(this.chart?.duration||0,audio.duration-this.audioOffset());try{audio.currentTime=this.time+this.audioOffset();}catch(_){}this.onStatus(`${global.YoisakiResources.isRemote(source)?'在线':'本地'}音源已就绪 · ${this.pending?'等待播放，可点击暂停取消':this.playing?(this.silent?'无声预览':'音画同步'):'已暂停'} · 留白 ${this.audioOffset().toFixed(3)} s`,'ready');this.onUpdate(this);});
   audio.addEventListener('error',advance);
   audio.addEventListener('ended',()=>{if(this.audio!==audio)return;this.time=Math.min(this.duration,audio.currentTime-this.audioOffset());this.pause();this.draw();this.onUpdate(this);});
   audio.addEventListener('waiting',()=>{if(this.audio===audio&&id===this._loadId&&this.active&&!this.silent)this.onStatus('正在缓冲音频，可点击暂停取消…','loading');});
   audio.addEventListener('playing',()=>{if(this.audio!==audio||id!==this._loadId)return;if(!this.active||this.silent||this._audioFailed){audio.pause();return;}this.onStatus('正在同步播放音频与谱面','ready');});
   assign();this.onStatus('正在加载演唱音源…','loading');
  }
  async play(){
   if(!this.chart||this._destroyed||this.active)return;this.pause();if(this.time>=this.duration-.08)this.seek(0);const loadId=this._loadId,playToken=this._playToken,audio=this.audio;
   this._clockTime=this.time;this._clockStart=performance.now();
   if(this.audio&&!this.silent&&!this._audioFailed){
    this._playPending=true;this.onStatus('正在准备音频，可点击暂停取消…','loading');this.onUpdate(this);
    try{audio.currentTime=this.time+this.audioOffset();audio.playbackRate=this.rate;await audio.play();if(loadId!==this._loadId||playToken!==this._playToken){if(this.audio!==audio||!this.active||this.silent||this._audioFailed)audio.pause();return;}this._playPending=false;}
    catch(error){if(playToken!==this._playToken||loadId!==this._loadId)return;if(error.name==='NotAllowedError'){this.pause();this.onStatus('浏览器阻止了音频播放，请再次点击播放按钮。','warning');return;}if(error.name==='AbortError'){this.pause();return;}this._audioFallback?.();return;}
   }
   this._clockStart=performance.now();this.playing=true;this._frame();this.onUpdate(this);
  }
  pause(){const wasActive=this.active;this._playToken++;if(this.playing)this.time=this.currentTime();this.playing=false;this._playPending=false;if(this._raf)cancelAnimationFrame(this._raf);this._raf=0;if(this.audio)this.audio.pause();if(wasActive)this.onStatus('已暂停','paused');this.onUpdate(this);}
  currentTime(){if(!this.playing)return this.time;if(this.audio&&!this.silent&&!this._audioFailed)return normalizeStateTime(this.audio.currentTime-this.audioOffset(),this.duration);return normalizeStateTime(this._clockTime+(performance.now()-this._clockStart)/1000*this.rate,this.duration);}
  seek(value){this.time=normalizeStateTime(value,this.duration);this._clockTime=this.time;this._clockStart=performance.now();if(this.audio&&!this.silent&&!this._audioFailed){try{this.audio.currentTime=this.time+this.audioOffset();}catch(_){}}this.draw();this.onUpdate(this);}
  setOptions(opts){const timing=opts.rate!==undefined||opts.offsetMs!==undefined||opts.silent!==undefined;const t=this.currentTime(),was=this.active;if(timing)this.pause();if(opts.speed!==undefined)this.speed=clamp(Number(opts.speed)||10,1,12);if(opts.rate!==undefined)this.rate=clamp(Number(opts.rate)||1,.25,2);if(opts.volume!==undefined)this.volume=clamp(Number(opts.volume)||0,0,1);if(opts.offsetMs!==undefined)this.offsetMs=clamp(Number(opts.offsetMs)||0,-5000,5000);if(opts.silent!==undefined)this.silent=!!opts.silent;if(this.audio){this.audio.volume=this.volume;this.audio.playbackRate=this.rate;}if(timing){this.seek(t);if(was)this.play();}this.draw();}
  _frame(){if(!this.playing)return;if(!this.canvas.isConnected){this.pause();return;}this.time=this.currentTime();if(this.time>=this.duration-.01){this.time=this.duration;this.pause();this.draw();return;}this.draw();this.onUpdate(this);this._raf=requestAnimationFrame(()=>this._frame());}
  draw(){
   const canvas=this.canvas,ctx=this.ctx;if(!ctx)return;const W=960,H=640;const pixel=Math.min(global.devicePixelRatio||1,1.7);if(canvas.width!==Math.round(W*pixel)){canvas.width=Math.round(W*pixel);canvas.height=Math.round(H*pixel);}ctx.setTransform(pixel,0,0,pixel,0,0);
   ctx.fillStyle='#10131f';ctx.fillRect(0,0,W,H);const bg=ctx.createRadialGradient(W*.5,H*.3,10,W*.5,H*.3,H*.8);bg.addColorStop(0,'#29263d');bg.addColorStop(1,'#10131f');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
   const top=55,judge=H*.85,topWidth=205,bottomWidth=735;const windowSec=.65+(12-this.speed)*.33;
   const project=(lane,time,ratio=1)=>{let delta=this.chart?(this.chart.scrollAt(time)-this.chart.scrollAt(this.time))*ratio:time-this.time;const p=1-delta/windowSec;const eased=Math.pow(Math.max(0,p),1.8);const width=mix(topWidth,bottomWidth,eased);return{x:W/2+(lane/12-.5)*width,y:mix(top,judge,eased),p,width};};
   ctx.beginPath();ctx.moveTo((W-topWidth)/2,top);ctx.lineTo((W+topWidth)/2,top);ctx.lineTo((W+bottomWidth)/2,H);ctx.lineTo((W-bottomWidth)/2,H);ctx.closePath();ctx.fillStyle='#151827d9';ctx.fill();ctx.strokeStyle='#55516b44';ctx.lineWidth=1;ctx.stroke();
   for(let i=0;i<=12;i++){ctx.beginPath();ctx.moveTo(W/2+(i/12-.5)*topWidth,top);ctx.lineTo(W/2+(i/12-.5)*bottomWidth*1.16,H);ctx.strokeStyle=i%3===0?'#aaa4cc22':'#a8a0c00b';ctx.stroke();}
   const base=this.chart?this.chart.scrollAt(this.time):0;
   if(this.chart){
    ctx.save();ctx.beginPath();ctx.rect(0,top-3,W,judge-top+20);ctx.clip();
    for(const b of this.chart.bars){const a=project(0,b.time),z=project(12,b.time);if(a.p<0||a.p>1.08)continue;ctx.strokeStyle='#a49bc125';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(z.x,z.y);ctx.stroke();}
    for(const a of this.chart.notes){const b=a.next;if(!b)continue;if(b.time<this.time-1||a.time>this.time+25)continue;const ratio=a.ratio;const steps=Math.max(3,Math.min(44,Math.ceil(Math.abs(b.time-a.time)*24)));ctx.fillStyle=color(a)+(a.guide?'45':'78');
     for(let j=0;j<steps;j++){const u=j/steps,v=(j+1)/steps;const t0=mix(a.time,b.time,u),t1=mix(a.time,b.time,v);const ease=x=>x*x*(3-2*x);const aa=ease(u),bb=ease(v);const left0=project(mix(a.lane,b.lane,aa),t0,ratio),right0=project(mix(a.lane+a.width,b.lane+b.width,aa),t0,ratio),left1=project(mix(a.lane,b.lane,bb),t1,ratio),right1=project(mix(a.lane+a.width,b.lane+b.width,bb),t1,ratio);if((left0.p<-.1&&left1.p<-.1)||(left0.p>1.15&&left1.p>1.15))continue;ctx.beginPath();ctx.moveTo(left0.x,left0.y);ctx.lineTo(right0.x,right0.y);ctx.lineTo(right1.x,right1.y);ctx.lineTo(left1.x,left1.y);ctx.closePath();ctx.fill();}
    }
    const visible=this.chart.notes.filter(n=>!n.hidden&&!(n.guide&&!n.original.tap&&!n.original.directional)).map(n=>({n,p:project(n.lane,n.time,n.ratio)})).filter(x=>x.p.p>=0&&x.p.p<=1.025).sort((a,b)=>a.p.p-b.p.p);
    for(const{n,p}of visible){const right=project(n.lane+n.width,n.time,n.ratio),w=Math.max(3,right.x-p.x-1.5),h=3+9*Math.pow(p.p,1.6),col=color(n),isRelay=n.kind==='slide'&&n.type===3;
     if(isRelay){ctx.fillStyle=col;ctx.beginPath();const x=p.x+w/2;ctx.moveTo(x,p.y-h);ctx.lineTo(x+h,p.y);ctx.lineTo(x,p.y+h);ctx.lineTo(x-h,p.y);ctx.closePath();ctx.fill();}
     else{ctx.shadowColor=col;ctx.shadowBlur=5*p.p;roundRect(ctx,p.x,p.y-h/2,w,h,2);const g=ctx.createLinearGradient(0,p.y-h,0,p.y+h);g.addColorStop(0,'#ffffff');g.addColorStop(.32,col);g.addColorStop(1,col+'aa');ctx.fillStyle=g;ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=col;ctx.lineWidth=1;ctx.stroke();}
     if(n.kind==='flick'||n.original.directional)drawFlick(ctx,p.x+w/2,p.y,w,n.direction,col,.5+.6*p.p);
    }
    ctx.restore();
   }
   const glow=ctx.createLinearGradient(0,judge-18,0,judge+25);glow.addColorStop(0,'#b9a4ff00');glow.addColorStop(.5,'#cbb3ff88');glow.addColorStop(1,'#b9a4ff00');ctx.fillStyle=glow;ctx.fillRect((W-bottomWidth)/2,judge-18,bottomWidth,43);ctx.strokeStyle='#e2d1ff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo((W-bottomWidth)/2,judge);ctx.lineTo((W+bottomWidth)/2,judge);ctx.stroke();
   ctx.font='10px system-ui,sans-serif';ctx.fillStyle='#c3bbd2';ctx.textAlign='center';ctx.fillText('Y O I S A K I   /   S C O R E   S T U D I O',W/2,29);ctx.font='11px system-ui,sans-serif';ctx.fillStyle='#968ea8';ctx.fillText(`NOTE SPEED ${this.speed.toFixed(1)}   ·   ${this.rate.toFixed(2)}×`,W/2,H-24);
   if(this.chart){ctx.fillStyle='#c8c0dd';ctx.textAlign='right';ctx.font='22px system-ui,sans-serif';ctx.fillText(this.time.toFixed(2)+' s',W-50,94);ctx.font='8px system-ui,sans-serif';ctx.fillStyle='#817b95';ctx.fillText('CHART TIME',W-50,111);}
  }
  destroy(){this._destroyed=true;this.pause();this._loadId++;const previous=this.audio;this.audio=null;this._audioFallback=null;if(previous){previous.removeAttribute('src');previous.load();}global.removeEventListener?.('resize',this._resize);}
 }
 function renderStatic(chart,{title='',difficulty='',level='',dark=true,secondsPerColumn=32}={}){
  const cols=Math.ceil(chart.duration/secondsPerColumn),columnWidth=290,top=145,bottom=55,scale=82,H=Math.ceil(top+Math.min(chart.duration,secondsPerColumn)*scale+bottom),W=cols*columnWidth+30;
  const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',title+' '+difficulty+' 完整静态谱面');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');const bg=dark?'#151824':'#f8f8fc',track=dark?'#202435':'#edf0f6',text=dark?'#dcd6eb':'#3e3b50',line=dark?'#9993b32b':'#8b86a733';ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  ctx.textAlign='left';ctx.fillStyle=dark?'#c2acff':'#7058b0';ctx.font='bold 25px system-ui,sans-serif';ctx.fillText('Yoisaki',25,39);ctx.font='bold 20px system-ui,sans-serif';ctx.fillStyle=text;ctx.fillText(title,W>700?160:25,W>700?39:70,W-190);ctx.font='12px system-ui,sans-serif';ctx.fillStyle=dark?'#a9a1bb':'#716a82';ctx.fillText(`${difficulty.toUpperCase()} ${level}  ·  BPM ${chart.bpms.join(' / ')}  ·  CN`,25,83);ctx.fillText('按列从左至右，每列从上至下阅读 · 真实国服 SUS 谱面',25,107);
  const leftFor=c=>c*columnWidth+62,laneWidth=17.8,trackWidth=laneWidth*12;
  for(let c=0;c<cols;c++){const x=leftFor(c),duration=Math.min(secondsPerColumn,chart.duration-c*secondsPerColumn);ctx.fillStyle=track;ctx.fillRect(x,top,trackWidth,duration*scale);for(let lane=0;lane<=12;lane++){ctx.strokeStyle=line;ctx.lineWidth=lane%3===0?1:.5;ctx.beginPath();ctx.moveTo(x+lane*laneWidth,top);ctx.lineTo(x+lane*laneWidth,top+duration*scale);ctx.stroke();}ctx.font='10px system-ui,sans-serif';ctx.fillStyle=text;ctx.textAlign='left';ctx.fillText(`${c*secondsPerColumn} s`,x,top-12);ctx.textAlign='center';ctx.fillText(String(c+1).padStart(2,'0'),x+trackWidth/2,H-21);}
  const coord=(lane,time,col)=>({x:leftFor(col)+lane*laneWidth,y:top+(time-col*secondsPerColumn)*scale});
  for(const bar of chart.bars){const c=Math.floor(bar.time/secondsPerColumn);if(c>=cols)continue;const p=coord(0,bar.time,c);ctx.strokeStyle=line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+trackWidth,p.y);ctx.stroke();ctx.textAlign='right';ctx.font='9px system-ui,sans-serif';ctx.fillStyle=dark?'#9389a8':'#857c96';ctx.fillText(String(bar.bar).padStart(3,'0'),p.x-6,p.y+3);}
  for(const a of chart.notes){const b=a.next;if(!b)continue;const start=Math.floor(a.time/secondsPerColumn),end=Math.min(cols-1,Math.floor(b.time/secondsPerColumn));ctx.fillStyle=color(a)+(a.guide?'35':'66');for(let c=start;c<=end;c++){const t0=Math.max(a.time,c*secondsPerColumn),t1=Math.min(b.time,(c+1)*secondsPerColumn);if(t1<t0)continue;const steps=Math.max(2,Math.ceil((t1-t0)*10));ctx.beginPath();const points=[];for(let j=0;j<=steps;j++){const t=mix(t0,t1,j/steps);let u=(t-a.time)/Math.max(1e-9,b.time-a.time);u=u*u*(3-2*u);points.push({t,lane:mix(a.lane,b.lane,u),width:mix(a.width,b.width,u)});}for(let i=0;i<points.length;i++){const p=coord(points[i].lane,points[i].t,c);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}for(let i=points.length-1;i>=0;i--){const p=coord(points[i].lane+points[i].width,points[i].t,c);ctx.lineTo(p.x,p.y);}ctx.closePath();ctx.fill();}}
  for(const n of chart.notes){if(n.hidden||(n.guide&&!n.original.tap&&!n.original.directional))continue;const c=Math.floor(n.time/secondsPerColumn);if(c>=cols)continue;const p=coord(n.lane,n.time,c),w=n.width*laneWidth-1;ctx.fillStyle=color(n);ctx.strokeStyle=dark?'#ffffff66':'#64546b55';ctx.lineWidth=.6;roundRect(ctx,p.x,p.y-3,w,6,1.5);ctx.fill();ctx.stroke();if(n.kind==='flick'||n.original.directional)drawFlick(ctx,p.x+w/2,p.y,w,n.direction,color(n),.65);}
  return canvas;
 }
 const chartCache=new Map();
 async function fetchChart(musicId,difficulty,{signal}={}){
  const k=`${musicId}_${difficulty}`;if(chartCache.has(k))return chartCache.get(k);
  const local=global.YOISAKI_BUNDLED_CHARTS?.[k];if(local){const chart=prepare(local);chart.source='内置国服谱面';chartCache.set(k,chart);return chart;}
  const result=await global.YoisakiResources.fetchResource(global.YoisakiCore.chartUrl(musicId,difficulty),{signal,timeoutMs:18000,parse:async response=>{const text=await response.text();if(text.length>8000000)throw new Error('谱面资源过大');return prepare(text);}});
  const chart=result.value;chart.source=global.YoisakiResources.isRemote(result.url)?'国服公开资源':'本地国服谱面';chartCache.set(k,chart);return chart;
 }
 function clearCache(id,difficulty){if(id!==undefined)chartCache.delete(`${id}_${difficulty}`);else chartCache.clear();}
 global.YoisakiChart={prepare,Player,renderStatic,fetchChart,clearCache,palette};
})(typeof window!=='undefined'?window:globalThis);
