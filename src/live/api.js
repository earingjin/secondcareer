const URL='https://tafrbtqjlrokdnhudswb.supabase.co';
const KEY='sb_publishable_va6hVj1FwfrxMiD6IQb81Q_AWE5m0-8';

// Credentials and tokens remain in this closure; no browser storage is used.
export function createAPI(onExpired){
  let session=null,timer=null,generation=0,passwordChangeRequired=false;
  function clear(){session=null;clearTimeout(timer);generation++;passwordChangeRequired=false}
  async function request(path,{body,anonymous=false,method=body?'POST':'GET'}={}){
    const epoch=generation;
    const accountRead=path==='/functions/v1/secondcareer-account'&&method==='GET';
    const unavailable=()=>Object.assign(Error('계정 상태 서비스를 사용할 수 없습니다.'),{accountUnavailable:true});
    if(!anonymous&&(!session||Date.now()>=session.expires_at*1000)){clear();onExpired();throw Error('세션이 만료되었습니다. 다시 로그인해 주세요.')}
    let response;
    try{response=await fetch(URL+path,{method,headers:{apikey:KEY,...(!anonymous?{Authorization:'Bearer '+session.access_token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)})}
    catch{if(accountRead)throw unavailable();throw Error('서버에 연결하지 못했습니다. 저장 여부를 확인한 뒤 다시 시도해 주세요.')}
    if(epoch!==generation)throw Error('세션이 변경되어 요청을 취소했습니다.');
    let data;try{data=await response.json()}catch{if(accountRead&&(response.status===404||response.status>=500))throw unavailable();throw Error('서버 응답을 확인할 수 없습니다.')}
    if(!response.ok){
      if(response.status===401&&!anonymous){clear();onExpired()}
      if(accountRead&&(response.status===404||response.status>=500))throw unavailable();
      const messages={401:'아이디 또는 비밀번호를 확인해 주세요.',403:'이 작업에 대한 권한이 없습니다.',409:'다른 저장 또는 제출이 먼저 반영되었습니다. 새로 조회해 주세요.',429:'로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.'};
      const registrationErrors={LOGIN_ID_UNAVAILABLE:'이미 등록된 아이디입니다.',REGISTRATION_ALREADY_REQUESTED:'이미 요청된 아이디입니다. 처리 결과를 관리자에게 확인해 주세요.',REGISTRATION_OUTCOME_UNKNOWN:'등록 결과 미확인: 다시 등록하지 말고 관리자에게 확인해 주세요.',REGISTRATION_NOT_CONFIGURED:'등록 서버 설정과 필수 보안 통합이 아직 준비되지 않았습니다.',INVALID_PASSWORD:'새 비밀번호는 12~128자로 입력해 주세요.',PASSWORD_UPDATE_FAILED:'비밀번호 변경을 확인하지 못했습니다. 다시 로그인해 상태를 확인해 주세요.',PASSWORD_CHANGE_REQUIRED:'먼저 임시 비밀번호를 변경해 주세요.'};
      throw Error(registrationErrors[data?.error]||messages[response.status]||'서버 처리 결과를 확인하지 못했습니다. 다시 등록하지 말고 관리자에게 확인해 주세요.');
    }
    return data;
  }
  async function readExistingAccount(){
    // Auth returns the fresh, server-controlled app_metadata. Check before
    // contacting assessment so a temporary participant cannot use fallback.
    const user=await request('/auth/v1/user');
    const metadata=user?.app_metadata;
    if(!user?.id||!metadata||typeof metadata!=='object'||Array.isArray(metadata)||
       ![undefined,false].includes(metadata.must_change_password)||
       (metadata.must_change_password===undefined&&Object.hasOwn(metadata,'registration_request_id')))throw Error('계정 상태를 확인할 수 없어 로그인할 수 없습니다.');
    const data=await request('/functions/v1/secondcareer-assessment');
    // The existing server determines the role and filters assigned records.
    if(!['counselor','participant'].includes(data.profile?.role))throw Error('계정 상태를 확인할 수 없어 로그인할 수 없습니다.');
    if(data.profile.role==='participant'&&(Object.hasOwn(metadata,'registration_request_id')||
       !Array.isArray(data.participants)||data.participants.length!==1||!Array.isArray(data.assessments)))throw Error('계정 상태를 확인할 수 없어 로그인할 수 없습니다.');
    return {...data,assessmentCounselors:data.counselors,mustChangePassword:false,registrationAvailable:false};
  }
  async function read(){
    let account;
    try{account=await request('/functions/v1/secondcareer-account')}
    catch(error){if(error.accountUnavailable)return readExistingAccount();throw error}
    if(!account.profile||!['participant','counselor','admin'].includes(account.profile.role)||typeof account.mustChangePassword!=='boolean')throw Error('계정 상태를 확인하지 못했습니다.');
    passwordChangeRequired=account.mustChangePassword;
    if(passwordChangeRequired||account.profile.role==='admin')return {...account,registrationAvailable:account.registrationAvailable===true,participants:[],assessments:[]};
    const data=await request('/functions/v1/secondcareer-assessment');
    if(data.profile?.role!==account.profile.role)throw Error('계정 권한 응답이 일치하지 않습니다.');
    return {...data,...account,registrationAvailable:account.registrationAvailable===true,assessmentCounselors:data.counselors};
  }
  return {
    async login(loginId,password){
      clear();const data=await request('/functions/v1/secondcareer-login',{anonymous:true,body:{loginId,password}});
      if(typeof data.access_token!=='string'||!Number.isFinite(data.expires_at)||data.expires_at*1000<=Date.now())throw Error('올바른 로그인 세션을 받지 못했습니다.');
      session={access_token:data.access_token,expires_at:data.expires_at};
      timer=setTimeout(()=>{clear();onExpired()},Math.min(data.expires_at*1000-Date.now(),2147483647));
      try{return await read()}catch(e){clear();throw e}
    },
    read,
    async changePassword(password){
      const data=await request('/functions/v1/secondcareer-account',{body:{action:'change-password',password}});
      if(data.changed!==true)throw Error('비밀번호 변경을 확인하지 못했습니다.');
      return read();
    },
    register:body=>request('/functions/v1/secondcareer-register-participant',{body}),
    write:(action,body)=>{if(passwordChangeRequired)throw Error('먼저 임시 비밀번호를 변경해 주세요.');return request('/functions/v1/secondcareer-assessment',{body:{action,...body}})},
    report:id=>{if(passwordChangeRequired)throw Error('먼저 임시 비밀번호를 변경해 주세요.');return request('/functions/v1/secondcareer-assessment?id='+encodeURIComponent(id))},
    async logout(){try{if(session)await request('/auth/v1/logout',{method:'POST'})}finally{clear()}},
    clear
  };
}
