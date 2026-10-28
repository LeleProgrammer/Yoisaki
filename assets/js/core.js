/* Yoisaki calculator and local data model. GPL-3.0. */
(function (global) {
 'use strict';
 const D=global.YOISAKI_MASTER;
 if(!D||!D.tables) throw new Error('国服资料加载失败：请确认 data/master.js 与网页一起解压。');
 const T=D.tables;
 const by=(a,k='id')=>new Map((a||[]).map(x=>[x[k],x]));
 const key=(a,b)=>`${a}:${b}`;
 const n=(v,min=0,max=1e9)=>Math.min(max,Math.max(min,Math.floor(Number(v)||0)));
 const num=(v,min=0,max=1e9)=>Math.min(max,Math.max(min,Number(v)||0));
 const clone=o=>JSON.parse(JSON.stringify(o));
 const f=Math.fround;
 const attr={cool:{name:'帅气',symbol:'◆',color:'#6f92f1'},cute:{name:'可爱',symbol:'♥',color:'#ef84a5'},pure:{name:'纯真',symbol:'♣',color:'#7bd3b2'},happy:{name:'快乐',symbol:'✦',color:'#ecc368'},mysterious:{name:'神秘',symbol:'☾',color:'#b295ea'}};
 const units={light_sound:'Leo/need',idol:'MORE MORE JUMP！',street:'Vivid BAD SQUAD',theme_park:'Wonderlands×Showtime',school_refusal:'25点，Nightcord见。',piapro:'虚拟歌手'};
 const diff={easy:{name:'EASY',short:'EAS',color:'#62d8aa'},normal:{name:'NORMAL',short:'NOR',color:'#63b7f2'},hard:{name:'HARD',short:'HRD',color:'#ecd16a'},expert:{name:'EXPERT',short:'EXP',color:'#ef7798'},master:{name:'MASTER',short:'MAS',color:'#b68aeb'},append:{name:'APPEND',short:'APD',color:'#eea1dc'}};
 const cards=by(T.cards),characters=by(T.gameCharacters),musics=by(T.musics),rarities=by(T.cardRarities,'cardRarityType'),skills=by(T.skills);
 const eps=new Map();for(const e of T.cardEpisodes||[]){if(!eps.has(e.cardId))eps.set(e.cardId,[]);eps.get(e.cardId).push(e);}
 const masters=new Map((T.masterLessons||[]).map(x=>[key(x.cardRarityType,x.masterRank),x]));
 const ranks=new Map((T.characterRanks||[]).map(x=>[key(x.characterId,x.characterRank),x]));
 const areaLevels=new Map((T.areaItemLevels||[]).map(x=>[key(x.areaItemId,x.level),x]));
 const areaCosts=new Map((T.areaItemCosts||[]).map(x=>[key(x.areaItemId,x.level),x]));
 const gateLevels=new Map((T.mysekaiGateLevels||[]).map(x=>[key(x.mysekaiGateId,x.level),x]));
 const levelExp=new Map((T.levels||[]).map(x=>[key(x.levelType,x.level),x.totalExp]));
 const getMapMax=(a,id,name)=>Math.max(0,...a.filter(x=>x[id]===name).map(x=>x.level));
 const areaMax=new Map((T.areaItems||[]).map(a=>[a.id,getMapMax(T.areaItemLevels||[],'areaItemId',a.id)]));
 const gateMax=new Map((T.mysekaiGates||[]).map(a=>[a.id,getMapMax(T.mysekaiGateLevels||[],'mysekaiGateId',a.id)]));
 const rankMax=new Map((T.gameCharacters||[]).map(c=>[c.id,Math.max(1,...(T.characterRanks||[]).filter(r=>r.characterId===c.id).map(r=>r.characterRank))]));
 const fixtureCap=T.mysekaiFixtureGameCharacterPerformanceBonusLimit?.bonusRateLimit||100;
 const releasedAt=Math.min(Date.now(),D.meta.releaseCutoff||Date.now());
 const releasedCards=(T.cards||[]).filter(c=>(c.releaseAt||0)<=releasedAt).sort((a,b)=>(b.releaseAt-a.releaseAt)||(b.id-a.id));
 const releasedMusics=(T.musics||[]).filter(m=>(m.publishedAt||m.releasedAt||0)<=releasedAt&&(!m.endAt||m.endAt>releasedAt)).sort((a,b)=>a.seq-b.seq);
 const releasedCardIds=new Set(releasedCards.map(x=>x.id));
 function charName(id){const c=characters.get(Number(id));return c?`${c.firstName||''}${c.givenName||''}`:`角色 ${id}`;}
 function cardUnits(card){const c=characters.get(card.characterId);const ret=[c?.unit||'piapro'];if(card.supportUnit&&card.supportUnit!=='none'&&!ret.includes(card.supportUnit))ret.push(card.supportUnit);return ret;}
 function rarityLabel(card){return card.cardRarityType==='rarity_birthday'?'生日卡':'★'.repeat(Number(card.cardRarityType.split('_')[1])||0);}
 function rarityInfo(card){return rarities.get(card.cardRarityType)||{maxLevel:20,maxSkillLevel:4};}
 function canTrain(card){return !!rarityInfo(card).trainingMaxLevel;}
 function maxLevel(card,trained){const r=rarityInfo(card);return trained&&r.trainingMaxLevel?r.trainingMaxLevel:r.maxLevel;}
 function maxState(card){return{level:maxLevel(card,true),trained:canTrain(card),master:5,skill:rarityInfo(card).maxSkillLevel||4,story1:!!(eps.get(card.id)||[]).find(e=>e.cardEpisodePartType==='first_part'),story2:!!(eps.get(card.id)||[]).find(e=>e.cardEpisodePartType==='second_part'),canvas:true};}
 function newState(card){return{level:1,trained:card.initialSpecialTrainingStatus==='done',master:0,skill:1,story1:false,story2:false,canvas:false};}
 function newSlot(id){const c=cards.get(Number(id));if(!c)throw new Error('卡牌不存在');const current=newState(c);const target={...current,level:maxLevel(c,true),trained:canTrain(c)||current.trained};return{cardId:c.id,current,target};}
 function emptyPlan(){return{schema:'yoisaki-plan',version:1,name:'未命名的养成方案',mode:'team',activeSlot:0,slots:[null,null,null,null,null],areas:{current:{},target:{}},ranks:{current:{},target:{}},gates:{current:{},target:{}},fixtures:{current:{},target:{}},honors:{current:0,target:0},inventory:{},policy:{practiceTicket:2,skillPayment:'ticket',skillTicket:3,masterPayment:'fragment',canvasRecipe:439}};}
 function stateSanitize(card,x){const r=newState(card);x=x&&typeof x==='object'?x:{};for(const k of ['trained','story1','story2','canvas'])r[k]=x[k]===true;r.trained=canTrain(card)&&r.trained||card.initialSpecialTrainingStatus==='done';r.level=n(x.level,1,maxLevel(card,r.trained));r.master=n(x.master,0,5);r.skill=n(x.skill,1,rarityInfo(card).maxSkillLevel||4);return r;}
 function sanitizePlan(input){
  if(!input||typeof input!=='object'||input.schema!=='yoisaki-plan'||Number(input.version)!==1)throw new Error('这不是 Yoisaki v1 方案文件。');
  const p=emptyPlan();p.name=String(input.name||p.name).slice(0,80);p.mode=input.mode==='single'?'single':'team';p.activeSlot=n(input.activeSlot,0,4);
  if(!Array.isArray(input.slots)||input.slots.length>5)throw new Error('方案最多包含五张卡牌。');
  p.slots=input.slots.map(s=>{if(!s)return null;const c=cards.get(n(s.cardId));if(!c||!releasedCardIds.has(c.id))throw new Error(`卡牌 #${s.cardId} 未在本国服数据快照中实装。`);return{cardId:c.id,current:stateSanitize(c,s.current),target:stateSanitize(c,s.target)};});while(p.slots.length<5)p.slots.push(null);
  for(const group of ['areas','ranks','gates','fixtures'])for(const side of ['current','target']){
   const a=input[group]?.[side];if(!a||typeof a!=='object')continue;
   for(const [id,v]of Object.entries(a)){
    const k=n(id);const maximum=group==='areas'?areaMax.get(k):group==='gates'?gateMax.get(k):group==='ranks'?rankMax.get(k):characters.has(k)?fixtureCap:undefined;
    if(maximum!==undefined)p[group][side][k]=n(v,group==='ranks'?1:0,maximum);
   }
  }
  for(const side of ['current','target'])p.honors[side]=n(input.honors?.[side],0,100000);
  if(input.inventory&&typeof input.inventory==='object')for(const[k,v]of Object.entries(input.inventory))if(/^(?:material|coin|practice_ticket|skill_practice_ticket|mysekai_material):\d+$/.test(k))p.inventory[k]=n(v,0,1e12);
  const q=input.policy||{};p.policy.practiceTicket=[1,2,3].includes(Number(q.practiceTicket))?Number(q.practiceTicket):2;p.policy.skillTicket=[1,2,3,4].includes(Number(q.skillTicket))?Number(q.skillTicket):3;p.policy.skillPayment=q.skillPayment==='fragment'?'fragment':'ticket';p.policy.masterPayment=q.masterPayment==='crystal'?'crystal':'fragment';p.policy.canvasRecipe=(T.canvasRecipes||[]).some(x=>x.blueprintId===Number(q.canvasRecipe))?Number(q.canvasRecipe):439;
  return p;
 }
 function basePowers(card,s){
  const power=[1,2,3].map(i=>card.cardParameters[`param${i}`][s.level-1]);
  if(s.trained)for(let i=0;i<3;i++)power[i]+=card[`specialTrainingPower${i+1}BonusFixed`]||0;
  for(const e of eps.get(card.id)||[])if((e.cardEpisodePartType==='first_part'&&s.story1)||(e.cardEpisodePartType==='second_part'&&s.story2))for(let i=0;i<3;i++)power[i]+=e[`power${i+1}BonusFixed`]||0;
  for(let r=1;r<=s.master;r++){const m=masters.get(key(card.cardRarityType,r));if(m)for(let i=0;i<3;i++)power[i]+=m[`power${i+1}BonusFixed`]||0;}
  if(s.canvas){const c=(T.cardMysekaiCanvasBonuses||[]).find(x=>x.cardRarityType===card.cardRarityType);if(c)for(let i=0;i<3;i++)power[i]+=c[`power${i+1}BonusFixed`]||0;}
  return power;
 }
 function cardPower(card,s,env,counts){
  const vector=basePowers(card,s),base=vector.reduce((v,a)=>v+a,0),rank=ranks.get(key(card.characterId,env.ranks[card.characterId]||1));
  const character=vector.reduce((v,a,i)=>v+Math.floor(f(f(f(rank?.[`power${i+1}BonusRate`]||0)*f(.01))*a)),0);
  const fixture=Math.floor(f(base*f(f(Math.min(fixtureCap,env.fixtures[card.characterId]||0))*f(.001))));
  const candidates=cardUnits(card);let gateRate=0;
  for(const g of T.mysekaiGates||[])if((candidates.length===1&&candidates[0]==='piapro')||candidates.includes(g.unit)){const rate=gateLevels.get(key(g.id,env.gates[g.id]||0))?.powerBonusRate||0;gateRate=Math.max(gateRate,rate);}
  const gate=Math.floor(f(base*f(f(gateRate)*f(.01))));
  let best=null;
  for(const unit of candidates){const added=[0,0,0];
   for(const a of T.areaItems||[]){const l=areaLevels.get(key(a.id,env.areas[a.id]||0));if(!l)continue;
    if(l.targetUnit!=='any'&&l.targetUnit!==unit)continue;
    if(l.targetCardAttr!=='any'&&l.targetCardAttr!==card.attr)continue;
    if(l.targetGameCharacterId!==undefined&&l.targetGameCharacterId!==card.characterId)continue;
    const all=(l.targetUnit!=='any'&&(counts[unit]||0)===5)||(l.targetCardAttr!=='any'&&(counts[card.attr]||0)===5);
    for(let i=0;i<3;i++){const rate=l[`power${i+1}${all?'AllMatchBonusRate':'BonusRate'}`]||0;added[i]=f(added[i]+f(f(f(rate)*f(.01))*vector[i]));}
   }
   const area=added.reduce((v,x)=>v+Math.floor(x),0);const current={base,area,character,fixture,gate,total:base+area+character+fixture+gate,unit,vector};if(!best||current.total>best.total)best=current;
  }
  return best;
 }
 function activeSlots(plan){return plan.mode==='single'?plan.slots.slice(0,1):plan.slots;}
 function envFor(plan,side){return{areas:plan.areas[side],ranks:plan.ranks[side],gates:plan.gates[side],fixtures:plan.fixtures[side]};}
 function deckPower(plan,side){
  const slots=activeSlots(plan).filter(Boolean),counts={};
  for(const s of slots){const c=cards.get(s.cardId);counts[c.attr]=(counts[c.attr]||0)+1;for(const u of cardUnits(c))counts[u]=(counts[u]||0)+1;}
  const detail=slots.map(s=>({cardId:s.cardId,...cardPower(cards.get(s.cardId),s[side],envFor(plan,side),counts)}));
  const total={base:0,area:0,character:0,fixture:0,gate:0,honor:slots.length?plan.honors[side]:0,total:0};for(const d of detail)for(const k of ['base','area','character','fixture','gate'])total[k]+=d[k];total.total=total.base+total.area+total.character+total.fixture+total.gate+total.honor;
  return{...total,cards:detail,counts};
 }
 function resourceName(type,id){
  if(type==='coin')return'金币';const table={material:'materials',practice_ticket:'practiceTickets',skill_practice_ticket:'skillPracticeTickets',mysekai_material:'mysekaiMaterials'}[type];
  return(T[table]||[]).find(x=>x.id===Number(id))?.name||`${type} #${id}`;
 }
 function normalizeCost(c){if(c.cost){const[id,type,,quantity]=c.cost;return{resourceId:id,resourceType:type,quantity};}return c;}
 function skillDescription(card,level,{skillId=card.skillId,characterRank=1}={}){
  const skill=skills.get(skillId);if(!skill)return'暂未收录技能说明';
  const effects=skill.skillEffects||[],find=id=>effects.find(e=>e.id===Number(id));
  const detail=e=>e?.skillEffectDetails?.find(d=>d.level===Number(level))||e?.skillEffectDetails?.[0];
  const value=e=>Number(detail(e)?.activateEffectValue)||0;
  const conditional=(lo,hi)=>effects.filter(e=>e.id>=lo&&e.id<=hi&&Number(e.activateCharacterRank||0)<=Number(characterRank)).sort((a,b)=>(Number(b.activateCharacterRank)||0)-(Number(a.activateCharacterRank)||0))[0];
  return(skill.description||'').replace(/\{\{([\d,]+);(\w+)\}\}/g,(_,ids,kind)=>{
   const list=ids.split(',').map(Number),a=find(list[0]),b=find(list[1]);if(kind==='c')return charName(card.characterId);
   let out;
   if(list.length===1){if(kind==='d')out=detail(a)?.activateEffectDuration;if(kind==='v')out=detail(a)?.activateEffectValue;if(kind==='e')out=a?.skillEnhance?.activateEffectValue;if(kind==='m')out=value(a)+5*(a?.skillEnhance?.activateEffectValue||0);}
   else{if(kind==='r')out=value(conditional(list[0],list[1]));if(kind==='s')out=value(a)+value(conditional(list[0]+1,list[1]));if(kind==='v'||kind==='u')out=value(a)+value(b);if(kind==='o')out=value(a)+(Number(detail(b)?.activateEffectValue2)||0);}
   return out===undefined?'待核对':String(Number(Number(out).toFixed(3)));
  }).replace(/<[^>]*>/g,'');
 }
 function validate(plan){
  const errors=[],warnings=[];const chars=new Set();const slots=activeSlots(plan);
  for(const s of slots){if(!s)continue;const c=cards.get(s.cardId),a=s.current,b=s.target,name=charName(c.characterId);
   if(plan.mode==='team'&&chars.has(c.characterId))errors.push(`普通五人编组不能重复选择${name}。`);chars.add(c.characterId);
   for(const k of ['level','master','skill'])if(b[k]<a[k])errors.push(`${name}的目标${{level:'等级',master:'专家等级',skill:'技能等级'}[k]}低于当前值。`);
   for(const k of ['trained','story1','story2','canvas'])if(a[k]&&!b[k])errors.push(`${name}的目标状态不能撤销已经完成的${{trained:'特训',story1:'前篇剧情',story2:'后篇剧情',canvas:'装饰画'}[k]}。`);
   if(b.level>maxLevel(c,b.trained)||a.level>maxLevel(c,a.trained))errors.push(`${name}的卡牌等级超过当前特训状态上限。`);
   for(const side of ['current','target']){const st=s[side];if(st.story2&&st.level<maxLevel(c,st.trained))warnings.push(`${name}${side==='current'?'当前':'目标'}后篇已阅读；请确认已在游戏中满足剧情开放条件。`);}
  }
  for(const g of ['areas','gates','ranks','fixtures'])for(const[id,a]of Object.entries(plan[g].current))if((plan[g].target[id]||0)<a)errors.push(`${{areas:'区域道具',gates:'大门',ranks:'角色等级',fixtures:'家具加成'}[g]} #${id} 的目标不能低于当前。`);
  if(plan.honors.target<plan.honors.current)errors.push('目标称号加成不能低于当前。');
  if(slots.some(Boolean)){warnings.push('角色等级、称号及手动填写的家具加成作为已达成的条件；其获取途径不唯一，不折算为固定材料。');}
  return{errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
 }
 function calculate(plan){
  const rows=new Map(),xp=[],warnings=[],validation=validate(plan);
  const add=(cost,source)=>{const c=normalizeCost(cost);const q=Number(c.quantity)||0;if(q<=0)return;const k=key(c.resourceType||'material',c.resourceId||0);if(!rows.has(k))rows.set(k,{key:k,type:c.resourceType||'material',id:c.resourceId||0,name:resourceName(c.resourceType||'material',c.resourceId||0),quantity:0,sources:new Set()});const r=rows.get(k);r.quantity+=q;r.sources.add(source);};
  for(const slot of activeSlots(plan)){if(!slot)continue;const c=cards.get(slot.cardId),a=slot.current,b=slot.target,cn=charName(c.characterId);
   const exp=Math.max(0,(levelExp.get(key('card',b.level))||0)-(levelExp.get(key('card',a.level))||0));
   if(exp){const ticket=(T.practiceTickets||[]).find(t=>t.id===plan.policy.practiceTicket);const quantity=Math.ceil(exp/ticket.exp);add({resourceType:'practice_ticket',resourceId:ticket.id,quantity},`${cn}·练习`);xp.push({cardId:c.id,type:'card',required:exp,provided:quantity*ticket.exp,overflow:quantity*ticket.exp-exp});}
   if(!a.trained&&b.trained)for(const x of c.specialTrainingCosts||[])add(x,`${cn}·特训`);
   for(const e of eps.get(c.id)||[]){const field=e.cardEpisodePartType==='first_part'?'story1':'story2';if(!a[field]&&b[field])for(const x of e.costs||[])add(x,`${cn}·${field==='story1'?'前篇':'后篇'}`);}
   for(let r=a.master+1;r<=b.master;r++){const m=masters.get(key(c.cardRarityType,r));if(!m)continue;const preferred=plan.policy.masterPayment==='crystal'?16:15;const payment=m.costs.find(x=>x.resourceId===preferred&&!x.characterId&&!x.unit)||m.costs.find(x=>x.resourceId===15&&!x.characterId&&!x.unit);if(payment)add({...payment,resourceType:'material'},`${cn}·专家训练`);else warnings.push(`${cn}专家训练 ${r} 的通用支付材料未收录。`);}
   const skilltype='card_skill_'+(c.cardRarityType==='rarity_birthday'?'birthday':c.cardRarityType.split('_')[1]);const skillExp=Math.max(0,(levelExp.get(key(skilltype,b.skill))||0)-(levelExp.get(key(skilltype,a.skill))||0));
   if(skillExp){const ticket=(T.skillPracticeTickets||[]).find(t=>t.id===plan.policy.skillTicket);const fragment=plan.policy.skillPayment==='fragment';const unit=fragment?1:ticket.exp;const quantity=Math.ceil(skillExp/unit);add({resourceType:fragment?'material':'skill_practice_ticket',resourceId:fragment?15:ticket.id,quantity},`${cn}·技能`);xp.push({cardId:c.id,type:'skill',required:skillExp,provided:quantity*unit,overflow:quantity*unit-skillExp});}
   if(!a.canvas&&b.canvas){let recipe=(T.canvasRecipes||[]).find(x=>x.blueprintId===plan.policy.canvasRecipe);const allowed=(T.mysekaiBlueprintMysekaiCanvasRelations||[]).some(x=>x.mysekaiBlueprintId===recipe?.blueprintId&&x.cardRarityType===c.cardRarityType);if(!allowed){recipe=(T.canvasRecipes||[]).find(r=>(T.mysekaiBlueprintMysekaiCanvasRelations||[]).some(x=>x.mysekaiBlueprintId===r.blueprintId&&x.cardRarityType===c.cardRarityType));warnings.push(`${cn}改用支持该稀有度的装饰画配方。`);}if(recipe)for(const x of recipe.costs)add(x,`${cn}·${recipe.name}`);else warnings.push(`${cn}的装饰画配方未收录。`);}
  }
  for(const item of T.areaItems||[]){const a=plan.areas.current[item.id]||0,b=plan.areas.target[item.id]||0;for(let r=a+1;r<=b;r++){const c=areaCosts.get(key(item.id,r));if(c)for(const x of c.costs)add(x,`${item.name} Lv.${a}→${b}`);else warnings.push(`${item.name} Lv.${r} 的升级材料未收录。`);}}
  for(const gate of T.mysekaiGates||[]){const a=plan.gates.current[gate.id]||0,b=plan.gates.target[gate.id]||0;for(let r=a+1;r<=b;r++){const l=gateLevels.get(key(gate.id,r));if(!l)continue;const costs=(T.mysekaiGateMaterialGroups||[]).filter(x=>x.groupId===l.mysekaiGateMaterialGroupId);for(const x of costs)add({resourceType:'mysekai_material',resourceId:x.mysekaiMaterialId,quantity:x.quantity},`${gate.name} Lv.${a}→${b}`);}}
  const result=[...rows.values()].map(r=>({...r,sources:[...r.sources],owned:plan.inventory[r.key]||0,shortage:Math.max(0,r.quantity-(plan.inventory[r.key]||0))})).sort((a,b)=>({coin:0,material:1,practice_ticket:2,skill_practice_ticket:3,mysekai_material:4}[a.type]-{coin:0,material:1,practice_ticket:2,skill_practice_ticket:3,mysekai_material:4}[b.type])||(a.id-b.id));
  return{current:deckPower(plan,'current'),target:deckPower(plan,'target'),resources:result,xp,errors:validation.errors,warnings:[...new Set([...validation.warnings,...warnings])],valid:validation.errors.length===0};
 }
 function relevantAreas(plan){const cs=activeSlots(plan).filter(Boolean).map(s=>cards.get(s.cardId));return(T.areaItems||[]).filter(a=>{const row=areaLevels.get(key(a.id,1));if(!row)return false;if((plan.areas.current[a.id]||0)||(plan.areas.target[a.id]||0))return true;return cs.some(c=>(row.targetGameCharacterId===undefined||row.targetGameCharacterId===c.characterId)&&(row.targetCardAttr==='any'||row.targetCardAttr===c.attr)&&(row.targetUnit==='any'||cardUnits(c).includes(row.targetUnit)));});}
 function unitLabel(card){return units[card.supportUnit&&card.supportUnit!=='none'?card.supportUnit:characters.get(card.characterId)?.unit]||'虚拟歌手';}
 function filterCards({query='',character='',unit='',attr:at='',rarity='',favorite=false,favorites=[],sort='new'}={}){const q=query.trim().toLocaleLowerCase();const out=releasedCards.filter(c=>(!character||c.characterId===Number(character))&&(!unit||cardUnits(c).includes(unit))&&(!at||c.attr===at)&&(!rarity||c.cardRarityType===rarity)&&(!favorite||favorites.includes(c.id))&&(!q||[c.prefix,c.id,charName(c.characterId),unitLabel(c)].join(' ').toLocaleLowerCase().includes(q)));if(sort==='old')out.reverse();if(sort==='power')out.sort((a,b)=>basePowers(b,maxState(b)).reduce((a,b)=>a+b,0)-basePowers(a,maxState(a)).reduce((a,b)=>a+b,0));return out;}
 const config={assetRoot:'https://storage.exmeaning.com/sekai-cn-assets',allowOnline:true,...readStorage('yoisaki-resource-settings',{})};
 function readStorage(k,fallback){try{const x=localStorage.getItem(k);return x?JSON.parse(x):fallback;}catch(_){return fallback;}}
 function writeStorage(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(_){return false;}}
 function cardArt(card,trained=false,thumb=false){const c=typeof card==='number'?cards.get(card):card;if(!c)return'';const tr=trained&&canTrain(c);let bundled='';if(c.assetbundleName==='res017_no046')bundled=`assets/samples/res017_no046_${thumb?(tr?'after_training':'normal'):(tr?'card_after_training':'card_normal')}.webp`;if(c.assetbundleName==='res017_no001'&&!tr)bundled=thumb?'assets/samples/res017_no001_normal.webp':'assets/samples/card_normal.webp';const path=thumb?`thumbnail/chara/${c.assetbundleName}_${tr?'after_training':'normal'}.webp`:`character/member/${c.assetbundleName}/card_${tr?'after_training':'normal'}.webp`;return global.YoisakiResources.url(path,bundled);}
 function jacket(music){const m=typeof music==='number'?musics.get(music):music;if(!m)return'';return global.YoisakiResources.url(`music/jacket/${m.assetbundleName}/${m.assetbundleName}.webp`,m.id===1?'assets/samples/jacket_s_001.webp':'');}
 function chartUrl(id,difficulty){return global.YoisakiResources.url(`music/music_score/${String(id).padStart(4,'0')}_01/${difficulty}.txt`);}
 function vocalList(id){return(T.musicVocals||[]).filter(v=>v.musicId===Number(id));}
 function audioUrl(vocal){const b=vocal.assetbundleName;return global.YoisakiResources.url(`music/long/${b}/${b}.mp3`,['0001_01','0002_02'].includes(b)?`assets/audio/${b}.mp3`:'');}
 global.YoisakiCore={D,T,cards,characters,musics,rarities,skills,eps,areaLevels,areaCosts,gateLevels,masters,areaMax,gateMax,rankMax,fixtureCap,attr,units,diff,releasedCards,releasedMusics,charName,cardUnits,rarityLabel,rarityInfo,canTrain,maxLevel,maxState,newState,newSlot,emptyPlan,sanitizePlan,basePowers,cardPower,deckPower,calculate,validate,relevantAreas,unitLabel,filterCards,normalizeCost,resourceName,skillDescription,activeSlots,clone,n,num,config,readStorage,writeStorage,cardArt,jacket,chartUrl,vocalList,audioUrl};
})(typeof window!=='undefined'?window:globalThis);
