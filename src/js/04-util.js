// src/js/04-util.js — legacy/index.original.html 540–548행을 그대로 옮김(유틸(DOM·날짜·합계·환산·영역 선택)). 이 줄만 추가됨.
/* ---------- 유틸 ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toISOString().slice(0,10);
const sum=a=>a.reduce((x,y)=>x+y,0);
function areaScores(a){return [0,1,2,3,4].map(i=>Math.round(((sum(a.slice(i*3,i*3+3))/3-1)/4*100)*10)/10)}
function level(v){return v<33.35?'다소 낮음':v<58.35?'보통':v<83.35?'다소 높음':'매우 높음'}
function lowestArea(sc){let m=0;sc.forEach((v,i)=>{if(v<sc[m])m=i});return m}

