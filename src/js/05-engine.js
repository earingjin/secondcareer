// src/js/05-engine.js — legacy/index.original.html 549–597행을 그대로 옮김(원본 엔진(코멘트·키워드·computeResult·resultOf)과 공용 헬퍼). 2c 에서 문구 데이터 구간(legacy 550–566행)을 src/data/ 로 이동, 1b 에서 환산·구조 상수화 등 일부 수정(docs/decisions.md 참조).
import {CMT} from '../data/feedback-comments.js';
import {KW_AGE,KW_GOAL,KW_PRO,GOAL_TO_KW} from '../data/feedback-keywords.js';
import {ITEMS_PER_AREA,ITEM_COUNT,SCALE_MIN,SCALE_MAX,AREA_IDX} from './02-eval-config.js';
import {OPT} from './03-options.js';
import {$,today,sum} from './04-util.js';

/* ---------- 원본 엔진 : 01_커리어플래닝_매크로_원본.xlsm ---------- */
// 코멘트·키워드 문구(CMT, KW_AGE, KW_GOAL, KW_PRO, GOAL_TO_KW)는 src/data/feedback-*.js 로 옮겼다(단계 2c). 엔진보다 먼저 로드된다.
const rawSums=a=>AREA_IDX.map(i=>sum(a.slice(i*ITEMS_PER_AREA,(i+1)*ITEMS_PER_AREA)));
// 결과코멘트 J9:N13 : 원점수 최저 영역, 동점이면 A>B>C>D>E
function commentArea(a){const r=rawSums(a),m=Math.min(...r);return r.indexOf(m)}
// VBA 내담자용_put : 연령대 (나이 = 응답연도 - 출생연도, 인생키워드 시트 H5)
const ageBand=a=>a>=60?'60대':a>=50?'50대':a>=40?'40대':a>=30?'30대':'20대';
const rint=n=>{try{const x=new Uint32Array(1);crypto.getRandomValues(x);return x[0]%n}catch(e){return Math.floor(Math.random()*n)}};
const resKey=p=>p.pre.join('')+'|'+((p.reg&&p.reg.birth)||'')+'|'+(((p.goal||{}).b13||[])[0]||'')+'|'+String(p.preDate||'').slice(0,4);
function computeResult(p,pick){
  pick=pick||rint;
  const ai=commentArea(p.pre);
  const y=+String(p.preDate||today()).slice(0,4),b=+((p.reg&&p.reg.birth)||0),band=b?ageBand(y-b):null;
  const g0=((p.goal||{}).b13||[])[0],gi=OPT['goal.b13'].indexOf(g0),gk=gi>=0?GOAL_TO_KW[gi]:null;
  const ka=band?KW_AGE[band][pick(3)]:null,kg=gk?KW_GOAL[gk][pick(3)]:null,kp=KW_PRO[pick(9)];
  return {engine:'xlsm-1',key:resKey(p),raw:rawSums(p.pre),area:ai,comment:'Code_'+'ABCDE'[ai]+'_0'+(pick(3)+1),
    kw:{age:ka?{band,code:ka[0],text:ka[1]}:null,goal:kg?{group:gk,code:kg[0],text:kg[1]}:null,pro:{code:kp[0],text:kp[1]}},at:today()};
}
// 무작위 선택(RANDBETWEEN)은 처음 한 번만 정하고 저장 → 다시 열어도 같은 리포트
let engineSave=()=>{throw new Error('engine save is not configured')};
function configureEngineSave(save){engineSave=save}
function resultOf(p){if(!full(p.pre))return null;if(!p.result||p.result.key!==resKey(p)){p.result=computeResult(p);engineSave()}return p.result}
function cmtParts(code){const t=CMT[code]||'',i=t.indexOf('\n');return i<0?[t,'']:[t.slice(0,i).trim().replace(/^"|"$/g,''),t.slice(i).trim()]}
const full=a=>Array.isArray(a)&&a.length===ITEM_COUNT&&a.every(v=>v>=SCALE_MIN&&v<=SCALE_MAX);
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),2400)}
function getPath(o,p){return p.split('.').reduce((a,k)=>a==null?a:a[k],o)}
function setPath(o,p,v){const k=p.split('.');let c=o;for(let i=0;i<k.length-1;i++){if(c[k[i]]==null)c[k[i]]={};c=c[k[i]]}c[k[k.length-1]]=v}
function copyText(t,msg){
  const done=()=>toast(msg||'복사했습니다');
  try{ if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,()=>fallback())}else fallback() }catch(e){fallback()}
  function fallback(){try{const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();done()}catch(e){toast('복사하지 못했습니다. 직접 선택해 복사해 주세요')}}
}

export {rawSums,commentArea,ageBand,rint,resKey,computeResult,resultOf,cmtParts,full,toast,getPath,setPath,copyText,configureEngineSave};

