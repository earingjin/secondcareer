import {S} from '../shared/state.js';

// UI position only. Questions, validation, answers and persistence stay in the
// existing survey. Nothing in this controller is included in a save payload.
export function createMobileSurvey({getProfile,steps,missing,goStep,goQ,nextFrom,render,toast}){
  const media=window.matchMedia('(max-width: 620px)');
  const items=steps.flatMap((step,n)=>step.codes.map(code=>({code,step:n})));
  const reviewStep=steps.length-1;
  let code=null,resumePending=true,focusNext=false,snapshot=null;
  const eligible=()=>getProfile()?.role==='participant'&&S.view==='wizard'&&S.mode2==='pre'&&!S.cedit;
  const active=()=>eligible()&&media.matches;
  const current=()=>items.find(item=>item.code===code);
  function reset(){code=null;resumePending=true;focusNext=false;snapshot=null}
  function prepare(){
    if(!active()||!S.user||S.user.status==='submitted')return;
    if(resumePending){
      const first=missing(S.user)[0];
      code=first?.code||null;S.step=first?.step??reviewStep;resumePending=false;
    }else if(S.step!==reviewStep&&current()?.step!==S.step){
      code=steps[S.step]?.codes[0]||null;
    }
  }
  function capture(){
    const question=document.querySelector('.single-question .q[data-mobile-current]');
    snapshot=null;
    if(!question)return;
    const fields=[...question.querySelectorAll('input,textarea,select')],field=document.activeElement;
    snapshot={code:question.id.slice(2),scroll:question.scrollTop,index:fields.indexOf(field),start:field?.selectionStart,end:field?.selectionEnd};
  }
  function move(item){
    code=item.code;focusNext=true;goStep(item.step);
  }
  function previous(){
    if(!active())return;
    const index=S.step===reviewStep?items.length:items.findIndex(item=>item.code===code);
    if(index>0)move(items[index-1]);
  }
  function next(){
    if(!active()||S.step===reviewStep)return;
    const item=current();if(!item)return;
    const issue=missing(S.user).find(issue=>issue.code===item.code);
    if(issue){jump(item.step,item.code);toast('표시된 문항을 확인해 주세요');return}
    const following=items[items.indexOf(item)+1];
    if(following?.step===item.step)move(following);
    else advanceStep(item.step);
  }
  function jump(step,target){
    if(eligible()&&items.some(item=>item.code===target&&item.step===step)){
      code=target;resumePending=false;focusNext=active();
    }
    goQ(step,target);
  }
  function selectStep(step){
    if(eligible()){code=steps[step]?.codes[0]||null;resumePending=false;focusNext=active()}
    goStep(step);
  }
  function advanceStep(step){
    if(eligible()){
      // nextFrom may redirect to an earlier missing question in this step.
      // Select it before its existing goQ/render path runs.
      const issue=missing(S.user).find(issue=>issue.step===step);
      if(issue)code=issue.code;
      resumePending=false;focusNext=active();
    }
    nextFrom(step);
  }
  function mount(){
    if(!active())return;
    const root=document.querySelector('#app .mobile-survey'),card=root?.querySelector(':scope > .card');
    if(!card||S.user?.status==='submitted')return;
    if(S.step===reviewStep){
      root.querySelectorAll('.rv').forEach((list,step)=>{
        [...list.children].forEach((row,index)=>{
          const target=steps[step].codes[index],button=document.createElement('button');
          button.type='button';button.className='btn ghost sm mobile-review-edit noprint';button.textContent='수정';
          button.setAttribute('aria-label',row.querySelector('dt').textContent+' 수정');
          button.dataset.mobileEdit=target;button.addEventListener('click',()=>jump(step,target));
          row.querySelector('dd').append(button);
        });
      });
      card.querySelector(`:scope > .acts button[onclick="goStep(${reviewStep-1})"]`)?.setAttribute('onclick','mobilePrevious()');
      return;
    }
    const item=current(),question=card.querySelector('#q-'+code);
    if(!item||!question)return;
    root.classList.add('single-question');root.dataset.mobileCode=code;
    question.setAttribute('data-mobile-current','');
    // Retain the current diagnostic area heading, using the existing markup.
    let area=question.previousElementSibling;
    while(area&&!area.classList.contains('area-head'))area=area.previousElementSibling;
    area?.setAttribute('data-mobile-current','');
    const index=items.indexOf(item),progress=document.createElement('div');
    progress.className='mobile-question-progress noprint';progress.tabIndex=-1;
    progress.setAttribute('role','status');progress.textContent=`${S.step+1} / ${steps.length} 단계 · ${steps[S.step].t} · ${index+1} / ${items.length} 항목`;
    card.prepend(progress);
    const nav=document.createElement('div');nav.className='mobile-question-nav noprint';
    nav.innerHTML=`<button type="button" class="btn ghost" onclick="mobilePrevious()" ${index===0?'disabled':''}>이전</button><button type="button" class="btn" onclick="mobileNext()">${index===items.length-1?'응답 검토':'다음'}</button>`;
    card.append(nav);
    if(snapshot?.code===code){
      const field=question.querySelectorAll('input,textarea,select')[snapshot.index];
      if(field){field.focus({preventScroll:true});if(typeof snapshot.start==='number'&&field.setSelectionRange)field.setSelectionRange(snapshot.start,snapshot.end)}
      question.scrollTop=snapshot.scroll;
    }
    if(focusNext){progress.focus({preventScroll:true});question.scrollTop=0;focusNext=false}
  }
  media.addEventListener('change',()=>{if(eligible())render()});
  return {active,reset,prepare,capture,mount,previous,next,goStep:selectStep,goQ:jump,nextFrom:advanceStep};
}
