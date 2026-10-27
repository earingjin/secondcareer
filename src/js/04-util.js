// src/js/04-util.js — legacy/index.original.html 540–548행을 그대로 옮김(유틸(DOM·날짜·합계·환산·영역 선택)). 1b 에서 환산·구조 상수화 등 일부 수정(docs/decisions.md 참조).
import {AREA_IDX,ITEMS_PER_AREA,toScore} from './02-eval-config.js';

/* ---------- 유틸 ---------- */
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const sum=a=>a.reduce((x,y)=>x+y,0);
function areaScores(a){return AREA_IDX.map(i=>toScore(sum(a.slice(i*ITEMS_PER_AREA,(i+1)*ITEMS_PER_AREA))))}
function lowestArea(sc){let m=0;sc.forEach((v,i)=>{if(v<sc[m])m=i});return m}

export {esc,today,sum,areaScores,lowestArea};

