import {S} from '../shared/state.js';
import {esc} from './fields.js';
function forestSVG(cls,H){
  H=H||300;const k=H/300;
  const pine=(x,y0,h,w,fill,op)=>{const t=y0-h;return `<path d="M${x} ${t} L${x+w*.34} ${t+h*.42} L${x+w*.17} ${t+h*.42} L${x+w*.5} ${y0} L${x-w*.5} ${y0} L${x-w*.17} ${t+h*.42} L${x-w*.34} ${t+h*.42}Z" fill="${fill}" opacity="${op}"/>`};
  const layer=(n,y0,hmin,hmax,w,fill,op,seed)=>{let o='';for(let i=0;i<n;i++){const x=(i+.5)*(800/n)+((i*37+seed*17)%23-11),h=(hmin+((i*53+seed*29)%(hmax-hmin)))*k,ww=(w+((i*19+seed*7)%9))*(k>1?1.05:1);o+=pine(x,y0*k,h,ww,fill,op)}return o};
  return `<svg class="forest ${cls||''}" viewBox="0 0 800 ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><path d="M0 ${200*k} L120 ${130*k} L230 ${190*k} L360 ${110*k} L520 ${200*k} L650 ${140*k} L800 ${190*k} L800 ${H} L0 ${H}Z" fill="#B9D9DC" opacity=".75"/><path d="M0 ${232*k} L160 ${170*k} L300 ${225*k} L470 ${150*k} L640 ${225*k} L800 ${175*k} L800 ${H} L0 ${H}Z" fill="#9CC9C9" opacity=".8"/>${layer(24,262,70,120,40,'#6FAE9D',.8,1)}${layer(18,286,90,150,56,'#3F8A8E',.9,2)}${layer(13,H-2,120,190,74,'#1F5F8B',.95,3)}</svg>`;
}


export function loginView(){
  return `<section class="hero"><div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>${forestSVG('hf',300)}
  <div class="wrap"><div class="hero-grid"><div>
    <div class="pill">Good life, Good Work</div>
    <h1>퇴직 이후, 나는<br><span class="hl">얼마나 준비됐을까요?</span></h1>
    <p class="lead">5가지 영역으로 현재의 퇴직준비도를 진단하고, 상담에서 무엇을 기대하는지 미리 알려 주세요. 결과는 상담 시간에 담당 상담사가 직접 설명해 드립니다. 상담이 끝난 뒤 같은 진단으로 변화도 비교합니다.</p>
    <div class="flow-mini"><span>1. 참여 동의·기본정보</span><span>2. 경력목표</span><span>3. 진단 15문항</span><span>4. 서비스 기대·검토 후 제출</span></div>
    <div class="hint">⊙ 총 36문항 · 소요시간 5~7분 · 결과는 상담에 참여하실 때 상담사가 지면으로 전달합니다</div>
  </div>
  <form class="card" onsubmit="event.preventDefault();doLogin()" autocomplete="off"><h2>세컨플래닝 로그인</h2><p class="sub">내담자·상담사에게 부여된 계정으로 로그인해 주세요.</p><div class="field"><label for="lg-id">아이디</label><input class="in" id="lg-id" autocomplete="username" autocapitalize="off" maxlength="32" required></div><div class="field"><label for="lg-pw">비밀번호 (8자리 이상)</label><input class="in" id="lg-pw" type="password" autocomplete="off" minlength="8" maxlength="128" required></div><div class="err" role="alert">${esc(S.err)}</div><button class="btn block" type="submit">로그인</button></form></div></div></section>`;
}
