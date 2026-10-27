const $=s=>document.querySelector(s);
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),2400)}
function copyText(t,msg){
  const done=()=>toast(msg||'복사했습니다');
  try{ if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,()=>fallback())}else fallback() }catch(e){fallback()}
  function fallback(){try{const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();done()}catch(e){toast('복사하지 못했습니다. 직접 선택해 복사해 주세요')}}
}

export {$,toast,copyText};
