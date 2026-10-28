/* Local-first media loading shared by the UI, Canvas exports and chart player. GPL-3.0. */
(function(global){
 'use strict';
 const C=global.YoisakiCore,groups=new Map(),missing=new Set();
 const localRoot='assets/offline/';
 const remote=path=>String(C.config.assetRoot||C.D.meta.assetRoots?.[0]||'https://storage.exmeaning.com/sekai-cn-assets').replace(/\/+$/,'')+'/'+path;
 const online=()=>C.config.allowOnline!==false;
 const isRemote=url=>/^https?:\/\//i.test(url);
 function all(group){return [...new Set([localRoot+group.path,group.bundled,online()?remote(group.path):null].filter(Boolean))];}
 function remember(group){const urls=all(group);for(const u of urls)groups.set(u,group);return urls;}
 function url(path,bundled=''){
  if(!/^[\w./-]+$/.test(path)||path.split('/').some(x=>!x||x==='.'||x==='..'))throw new Error('资源路径无效');
  const group={path,bundled},urls=remember(group);return urls.find(u=>!missing.has(u))||urls[0];
 }
 function candidates(value){
  const group=groups.get(value),urls=group?remember(group):[value];
  return urls.filter(u=>u&&(!isRemote(u)||online())&&!missing.has(u));
 }
 function markFailed(value){if(!isRemote(value))missing.add(value);}
 function next(value){
  const group=groups.get(value);markFailed(value);if(!group)return null;
  const urls=remember(group),index=urls.indexOf(value);
  return (index<0?urls:urls.slice(index+1)).find(u=>!missing.has(u))||null;
 }
 function reset(){missing.clear();}
 async function fetchResource(value,{signal,timeoutMs=20000,parse=response=>response}={}){
  let lastError=new Error(online()?'资源暂不可用，请重试或更换镜像。':'本地没有该资源；请先运行资源下载器。');
  for(const candidate of candidates(value)){
   if(signal?.aborted)throw new DOMException('已取消读取','AbortError');
   const controller=new AbortController(),abort=()=>controller.abort();
   signal?.addEventListener('abort',abort,{once:true});
   const timer=setTimeout(abort,timeoutMs);
   try{
    const response=await fetch(candidate,{signal:controller.signal,mode:'cors',credentials:'omit'});
    if(!response.ok)throw new Error(`资源返回 HTTP ${response.status}`);
    return {url:candidate,value:await parse(response)};
   }catch(error){
    if(signal?.aborted)throw new DOMException('已取消读取','AbortError');
    markFailed(candidate);lastError=error.name==='AbortError'?new Error('资源读取超时，请重试。'):error;
   }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  throw lastError;
 }
 async function loadImage(value,{timeoutMs=10000}={}){
  for(const candidate of candidates(value)){
   const result=await new Promise(resolve=>{
    const img=new Image();if(isRemote(candidate))img.crossOrigin='anonymous';
    let done=false;const finish=result=>{if(done)return;done=true;clearTimeout(timer);img.onload=img.onerror=null;if(!result)img.removeAttribute('src');resolve(result);};
    const timer=setTimeout(()=>finish(null),timeoutMs);
    img.onload=()=>finish(img);img.onerror=()=>finish(null);img.src=candidate;
   });
   if(result)return result;markFailed(candidate);
  }
  return null;
 }
 global.YoisakiResources={url,candidates,next,markFailed,reset,fetchResource,loadImage,isRemote,localRoot};
})(typeof window!=='undefined'?window:globalThis);
