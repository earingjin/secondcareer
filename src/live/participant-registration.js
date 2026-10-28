import {esc} from './fields.js';

// 상담사 목록은 향후 관리자 권한이 확인된 조회 경로에서 주입한다.
// counselors: [{id: string, name: string}]
function validCounselors(counselors){
  return Array.isArray(counselors)?counselors.filter(c=>c&&typeof c.id==='string'&&c.id.trim()===c.id&&c.id!==''&&typeof c.name==='string'&&c.name.trim()!==''):[];
}

function validateParticipantRegistration(input,counselors){
  const stringValue=v=>typeof v==='string'?v.trim():'';
  const values={nickname:stringValue(input?.nickname),phone:stringValue(input?.phone),counselorId:stringValue(input?.counselorId)};
  const errors={};
  if(!values.nickname)errors.nickname='닉네임을 입력해 주세요.';
  else if(values.nickname.length>12)errors.nickname='닉네임은 12자 이내로 입력해 주세요.';
  if(!values.phone)errors.phone='연락처를 입력해 주세요.';
  else if(!/^[0-9\s()+-]+$/.test(values.phone)||values.phone.replace(/\D/g,'').length<8)errors.phone='연락처를 숫자 8자리 이상으로 입력해 주세요.';
  if(!values.counselorId)errors.counselorId='담당 상담사를 선택해 주세요.';
  else if(!validCounselors(counselors).some(c=>c.id===values.counselorId))errors.counselorId='목록에 있는 상담사를 선택해 주세요.';
  return {values,errors,valid:Object.keys(errors).length===0};
}

function participantRegistrationView({counselors=[],organizationName='',values={},errors={},checked=false}={}){
  const choices=validCounselors(counselors);
  const errorFor=(name)=>errors[name]?`<div class="err" id="registration-${name}-error" role="alert">${esc(errors[name])}</div>`:'';
  const describedBy=name=>errors[name]?` aria-invalid="true" aria-describedby="registration-${name}-error"`:'';
  return `<section class="card sec"><h2>내담자 등록</h2>
  ${organizationName?`<p class="sub">소속기업: ${esc(organizationName)}</p>`:''}
  <p class="sub">닉네임과 연락처를 입력하고 담당 상담사를 선택해 주세요.</p>
  <form data-participant-registration novalidate>
    <div class="field"><label for="registration-nickname">닉네임 <span class="req">*</span></label><input class="in" id="registration-nickname" name="nickname" maxlength="12" value="${esc(values.nickname||'')}"${describedBy('nickname')}>${errorFor('nickname')}</div>
    <div class="field"><label for="registration-phone">연락처 <span class="req">*</span></label><input class="in" id="registration-phone" name="phone" type="tel" inputmode="tel" placeholder="010-1234-5678" value="${esc(values.phone||'')}"${describedBy('phone')}>${errorFor('phone')}</div>
    <div class="field"><label for="registration-counselor">담당 상담사 <span class="req">*</span></label><select class="in" id="registration-counselor" name="counselorId"${describedBy('counselorId')}><option value="">선택</option>${choices.map(c=>`<option value="${esc(c.id)}" ${c.id===values.counselorId?'selected':''}>${esc(c.name)}</option>`).join('')}</select>${errorFor('counselorId')}${choices.length?'':'<div class="hintline">선택할 수 있는 상담사가 없습니다.</div>'}</div>
    <button class="btn" type="submit">입력 확인</button>
    ${checked?'<p class="hintline" role="status">입력 내용만 확인되었습니다. 실제 등록은 아직 이루어지지 않았습니다.</p>':''}
  </form></section>`;
}

// 진입점에 연결하지 않는다. 향후 관리자 인증·서버 권한 확인 후에만 호출한다.
function mountParticipantRegistration(container,{counselors=[],organizationName=''}={}){
  function render(state={}){container.innerHTML=participantRegistrationView({counselors,organizationName,...state})}
  function onSubmit(event){
    if(!event.target.matches('form[data-participant-registration]'))return;
    event.preventDefault();
    const data=new FormData(event.target);
    const result=validateParticipantRegistration({nickname:data.get('nickname'),phone:data.get('phone'),counselorId:data.get('counselorId')},counselors);
    render({values:result.values,errors:result.errors,checked:result.valid});
  }
  render();container.addEventListener('submit',onSubmit);
  return ()=>container.removeEventListener('submit',onSubmit);
}

export {validateParticipantRegistration,participantRegistrationView,mountParticipantRegistration};
