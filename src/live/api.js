import {resolveConfig,requestTarget} from './config.js';

// Only the rotating refresh token is kept for the lifetime of this browser tab.
function runtimeEnv(){
  try{return {MODE:import.meta.env.MODE,VITE_SP_ENV:import.meta.env.VITE_SP_ENV,VITE_SP_TEST_PROJECT_ID:import.meta.env.VITE_SP_TEST_PROJECT_ID,VITE_SP_TEST_SUPABASE_URL:import.meta.env.VITE_SP_TEST_SUPABASE_URL,VITE_SP_TEST_PUBLISHABLE_KEY:import.meta.env.VITE_SP_TEST_PUBLISHABLE_KEY}}
  catch{return {}}
}
export function createAPI(onExpired,env=runtimeEnv()){
  const config=resolveConfig(env);
  const SESSION_KEY=config.mode==='test'?'sp-live-refresh-token-test-'+env.VITE_SP_TEST_PROJECT_ID:'sp-live-refresh-token';
  let session=null,timer=null,generation=0,passwordChangeRequired=false,refreshing=null;
  function clear(){session=null;clearTimeout(timer);generation++;passwordChangeRequired=false;refreshing=null;try{sessionStorage.removeItem(SESSION_KEY)}catch{}}
  function saveSession(data){
    const expiresAt=Number.isFinite(data.expires_at)?data.expires_at:(Number.isFinite(data.expires_in)?Math.floor(Date.now()/1000)+data.expires_in:0);
    if(typeof data.access_token!=='string'||!data.access_token||typeof data.refresh_token!=='string'||!data.refresh_token||expiresAt*1000<=Date.now())throw Error('올바른 로그인 세션을 받지 못했습니다.');
    session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:expiresAt};
    try{sessionStorage.setItem(SESSION_KEY,data.refresh_token)}catch{throw Error('세션을 안전하게 저장할 수 없습니다.')}
    clearTimeout(timer);
    timer=setTimeout(()=>refresh().catch(()=>{}),Math.min(Math.max(1000,expiresAt*1000-Date.now()-60000),2147483647));
  }
  async function refresh(){
    if(refreshing)return refreshing;
    const token=session?.refresh_token||sessionStorage.getItem(SESSION_KEY),epoch=generation;
    if(!token)return false;
    refreshing=(async()=>{
      try{
        const data=await request('/auth/v1/token?grant_type=refresh_token',{anonymous:true,body:{refresh_token:token}});
        if(epoch!==generation)throw Error('세션이 변경되었습니다.');
        saveSession(data);return true;
      }catch(error){if(epoch===generation){clear();onExpired()}throw error}
      finally{if(epoch===generation)refreshing=null}
    })();
    return refreshing;
  }
  async function request(path,{body,anonymous=false,method=body?'POST':'GET'}={}){
    const epoch=generation;
    const accountRead=path==='/functions/v1/secondcareer-account'&&method==='GET';
    const reportRead=path.startsWith('/functions/v1/secondcareer-assessment?id=')&&method==='GET';
    const unavailable=()=>Object.assign(Error('계정 상태 서비스를 사용할 수 없습니다.'),{accountUnavailable:true});
    if(!anonymous&&session&&Date.now()>=session.expires_at*1000)await refresh();
    if(!anonymous&&!session){clear();onExpired();throw Error('세션이 만료되었습니다. 다시 로그인해 주세요.')}
    let response;
    const target=requestTarget(config,path);
    try{response=await fetch(target,{method,headers:{apikey:config.key,...(!anonymous?{Authorization:'Bearer '+session.access_token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',...(config.mode==='test'?{redirect:'error'}:{}),signal:AbortSignal.timeout(20000)})}
    catch{if(accountRead)throw unavailable();throw Error('서비스에 연결하지 못했습니다. 저장 여부를 확인한 뒤 다시 시도해 주세요.')}
    if(epoch!==generation)throw Error('세션이 변경되어 요청을 취소했습니다.');
    let data;try{data=await response.json()}catch{if(accountRead&&(response.status===404||response.status>=500))throw unavailable();throw Error('처리 결과를 확인할 수 없습니다.')}
    if(!response.ok){
      if(response.status===401&&!anonymous){clear();onExpired()}
      if(accountRead&&(response.status===404||response.status>=500))throw unavailable();
      if(reportRead){
        const messages={400:'보고서 종류 또는 조회 요청을 확인해 주세요.',401:'세션이 만료되었습니다. 다시 로그인해 주세요.',403:'보고서를 조회할 권한이 없거나 최종 제출이 완료되지 않았습니다.',404:'보고서를 찾을 수 없습니다.'};
        throw Error(messages[response.status]||'보고서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
      if(path==='/functions/v1/secondcareer-admin-progress'&&response.status!==401){
        throw Error(response.status===403?'진단 현황을 조회할 권한이 없습니다.':'진단 현황을 불러오지 못했습니다. 잠시 후 새로 조회해 주세요.');
      }
      if(path.startsWith('/functions/v1/secondcareer-admin-report?')&&response.status!==401){
        const reportMessages={400:'보고서 종류 또는 조회 요청을 확인해 주세요.',403:'보고서를 조회할 권한이 없거나 최종 제출이 완료되지 않았습니다.'};
        throw Error(reportMessages[response.status]||'보고서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
      if((path==='/functions/v1/secondcareer-admin-aggregate'||path.startsWith('/functions/v1/secondcareer-admin-aggregate?'))&&response.status!==401){
        throw Error(response.status===403?'통합 분석보고서를 조회할 권한이 없습니다.':response.status===400?'기업 선택을 확인한 뒤 다시 불러와 주세요.':'통합 분석을 불러오지 못했습니다. 잠시 후 다시 불러와 주세요.');
      }
      if(path==='/functions/v1/secondcareer-admin-directory'&&response.status!==401){
        throw Error(response.status===403?'운영 관리 목록을 조회할 권한이 없습니다.':'운영 관리 목록을 불러오지 못했습니다. 잠시 후 새로 조회해 주세요.');
      }
      if(path.startsWith('/functions/v1/secondcareer-admin-companies')&&response.status!==401){
        if(path.includes('section=counselors')){
          const assignmentErrors={ASSIGNMENT_EXISTS:'이미 배정된 상담사입니다. 배정 목록을 다시 조회해 주세요.',ASSIGNMENT_CONFLICT:'고객사 또는 상담사 소속이 변경되었습니다. 배정 목록을 다시 조회해 주세요.',INVALID_REQUEST:'고객사와 상담사 선택을 확인해 주세요.',FORBIDDEN:'이 고객사 또는 상담사에 접근할 권한이 없습니다.'};
          throw Error(assignmentErrors[data?.error]||'상담사 배정 결과를 확인하지 못했습니다. 다시 조회해 상태를 확인해 주세요.');
        }
        const errors={INVALID_REQUEST:'필수값·날짜·이메일·연락처와 조회 조건을 확인해 주세요.',COMPANY_NAME_UNAVAILABLE:'같은 이름의 고객사가 이미 등록되어 있습니다. 비활성 고객사도 확인해 주세요.',COMPANY_CONFLICT:'다른 변경이 먼저 저장되었습니다. 상세를 다시 조회한 뒤 수정해 주세요.',FORBIDDEN:'이 고객사에 접근할 권한이 없습니다.'};
        throw Error(errors[data?.error]||'고객사 요청을 처리하지 못했습니다. 저장 여부를 조회한 뒤 다시 시도해 주세요.');
      }
      if(path.startsWith('/functions/v1/secondcareer-company-manager-progress?')&&response.status!==401){
        const errors={PASSWORD_CHANGE_REQUIRED:'먼저 임시 비밀번호를 변경해 주세요.',FORBIDDEN:'이 고객사 현황을 조회할 권한이 없습니다.',MANAGER_NOT_CONFIGURED:'고객사 현황 기능을 사용할 수 없습니다.',INVALID_REQUEST:'고객사 선택을 확인해 주세요.'};
        throw Object.assign(Error(errors[data?.error]||'고객사 현황을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.'),{forbidden:response.status===403});
      }
      if(path.startsWith('/functions/v1/secondcareer-admin-counselors')&&response.status!==401){
        const errors={LOGIN_ID_UNAVAILABLE:'이미 사용 중인 로그인 아이디입니다.',COUNSELOR_ALREADY_REQUESTED:'이미 발급 요청되었습니다. 요청 ID로 처리 결과를 확인하세요.',COUNSELOR_NOT_CONFIGURED:'상담사 발급은 서버 설정과 DB 검증 후 사용할 수 있습니다.',INVALID_REQUEST:'상담사 이름과 로그인 아이디를 확인해 주세요.',FORBIDDEN:'상담사 계정을 관리할 권한이 없습니다.'};
        throw Object.assign(Error(errors[data?.error]||'상담사 처리 결과를 확인하지 못했습니다. 다시 발급하지 말고 서버 기록을 확인하세요.'),{code:data?.error});
      }
      if(path.startsWith('/functions/v1/secondcareer-admin-company-managers')&&response.status!==401){
        const errors={MANAGER_ALREADY_REQUESTED:'이미 발급 요청된 이메일입니다. 재발급하지 말고 처리 결과를 확인해 주세요.',MANAGER_NOT_CONFIGURED:'담당자 계정 연동 검증 전에는 사용할 수 없습니다.',INVALID_REQUEST:'담당자 이름·이메일·연락처를 확인해 주세요.',FORBIDDEN:'고객사 담당자를 관리할 권한이 없습니다.'};
        throw Error(errors[data?.error]||'담당자 처리 결과 미확인: 다시 발급하지 말고 관리자에게 확인해 주세요.');
      }
      if(path==='/functions/v1/secondcareer-register-participant'&&response.status!==401&&['COMPANY_UNAVAILABLE','COMPANY_NAME_MISMATCH','COMPANY_QUERY_FAILED'].includes(data?.error))throw Error(data.error==='COMPANY_NAME_MISMATCH'?'선택한 고객사와 소속기업명이 다릅니다.':data.error==='COMPANY_UNAVAILABLE'?'선택한 고객사가 없거나 비활성 상태입니다. 고객사를 다시 조회해 주세요.':'고객사를 확인하지 못했습니다. 잠시 후 다시 조회해 주세요.');
      if(body?.action==='post-approve'&&response.status!==401){
        const approveMessages={PRE_REQUIRED:'사전진단을 최종 제출한 내담자만 사후진단을 허용할 수 있습니다.',LOCKED:'이미 사후진단을 제출한 내담자입니다.',FORBIDDEN:'담당 내담자만 사후진단을 허용할 수 있습니다.',POST_NOT_CONFIGURED:'사후진단 기능을 사용할 수 없습니다. 관리자에게 문의해 주세요.'};
        throw Error(approveMessages[data?.error]||'사후진단 허용 여부를 확인하지 못했습니다. 새로 조회해 상태를 확인해 주세요.');
      }
      if(data?.error==='POST_NOT_APPROVED')throw Error('담당 상담사가 사후진단을 허용한 뒤 참여할 수 있습니다.');
      if(body?.action==='post-draft'&&![401,403,409].includes(response.status))throw Error('사후 응답을 임시저장하지 못했습니다. 연결과 응답을 확인한 뒤 다시 시도해 주세요.');
      if(body?.action==='post-submit'){
        const submitMessages={400:'응답이 완성되지 않았습니다. 사후 진단과 만족도 응답을 확인해 주세요.',403:'사후 진단을 제출할 수 없는 상태입니다.',409:'다른 저장 또는 제출이 먼저 반영되었습니다. 다시 접속해 최신 상태를 확인해 주세요.'};
        if(response.status!==401)throw Error(submitMessages[response.status]||'제출하지 못했습니다. 제출 여부를 확인한 뒤 다시 시도해 주세요.');
      }
      const messages={401:'아이디 또는 비밀번호를 확인해 주세요.',403:'이 작업에 대한 권한이 없습니다.',409:'다른 저장 또는 제출이 먼저 반영되었습니다. 새로 조회해 주세요.',429:'로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.'};
      const registrationErrors={LOGIN_ID_UNAVAILABLE:'이미 등록된 아이디입니다.',REGISTRATION_ALREADY_REQUESTED:'이미 요청된 아이디입니다. 처리 결과를 관리자에게 확인해 주세요.',REGISTRATION_OUTCOME_UNKNOWN:'등록 결과 미확인: 다시 등록하지 말고 관리자에게 확인해 주세요.',REGISTRATION_NOT_CONFIGURED:'참여자 등록을 사용할 수 없습니다. 관리자에게 문의해 주세요.',INVALID_PASSWORD:'새 비밀번호는 12~128자로 입력해 주세요.',PASSWORD_UPDATE_FAILED:'비밀번호 변경을 확인하지 못했습니다. 다시 로그인해 상태를 확인해 주세요.',PASSWORD_CHANGE_REQUIRED:'먼저 임시 비밀번호를 변경해 주세요.'};
      registrationErrors.INVALID_ASSESSMENT_URL='올바른 HTTPS 진단 접속 주소를 입력해 주세요. 주소는 https://로 시작해야 합니다.';
      registrationErrors.ORGANIZATION_UPDATE_FAILED='진단 접속 주소를 저장하지 못했습니다.';
      registrationErrors.COUNSELOR_NOT_ASSIGNED='선택 고객사에 배정된 상담사만 지정할 수 있습니다. 배정을 다시 조회해 주세요.';
      registrationErrors.ASSIGNMENT_QUERY_FAILED='고객사 상담사 배정을 확인하지 못했습니다. 등록하지 않았으니 배정을 다시 조회해 주세요.';
      throw Error(registrationErrors[data?.error]||messages[response.status]||'처리 결과를 확인하지 못했습니다. 다시 등록하지 말고 관리자에게 확인해 주세요.');
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
    if(!account.profile||!['participant','counselor','admin','company_manager'].includes(account.profile.role)||typeof account.mustChangePassword!=='boolean')throw Error('계정 상태를 확인하지 못했습니다.');
    passwordChangeRequired=account.mustChangePassword;
    if(account.profile.role==='company_manager')return {...await request('/functions/v1/secondcareer-company-manager'),participants:[],assessments:[],registrationAvailable:false};
    if(passwordChangeRequired||account.profile.role==='admin')return {...account,registrationAvailable:account.registrationAvailable===true,participants:[],assessments:[]};
    const data=await request('/functions/v1/secondcareer-assessment');
    if(data.profile?.role!==account.profile.role)throw Error('계정 권한 응답이 일치하지 않습니다.');
    return {...data,...account,registrationAvailable:account.registrationAvailable===true,assessmentCounselors:data.counselors};
  }
  return {
    async login(loginId,password){
      clear();const data=await request('/functions/v1/secondcareer-login',{anonymous:true,body:{loginId,password}});
      try{saveSession(data);return await read()}catch(e){clear();throw e}
    },
    async restore(){
      if(!sessionStorage.getItem(SESSION_KEY))return null;
      try{await refresh();return await read()}catch(error){clear();throw error}
    },
    read,
    async changePassword(password,companyManager=false){
      const data=await request(companyManager?'/functions/v1/secondcareer-company-manager':'/functions/v1/secondcareer-account',{body:{action:'change-password',password}});
      if(data.changed!==true)throw Error('비밀번호 변경을 확인하지 못했습니다.');
      return read();
    },
    updateAssessmentUrl:assessmentUrl=>request('/functions/v1/secondcareer-account',{body:{action:'update-assessment-url',assessmentUrl}}),
    register:body=>request('/functions/v1/secondcareer-register-participant',{body}),
    // REQ-A-004: counts only; the server derives the scope from the signed-in profile.
    adminProgress:()=>request('/functions/v1/secondcareer-admin-progress'),
    // REQ-A-001/002 read only: organization, companies, counselors and participants in the server-checked scope.
    adminDirectory:()=>request('/functions/v1/secondcareer-admin-directory'),
    companies:({search='',status='all',page=1,pageSize=20}={})=>request('/functions/v1/secondcareer-admin-companies?'+new URLSearchParams({search,status,page:String(page),pageSize:String(pageSize)})),
    company:id=>request('/functions/v1/secondcareer-admin-companies?id='+encodeURIComponent(id)),
    saveCompany:(id,body)=>request('/functions/v1/secondcareer-admin-companies'+(id?'?id='+encodeURIComponent(id):''),{body,method:id?'PATCH':'POST'}),
    companyCounselors:id=>request('/functions/v1/secondcareer-admin-companies?id='+encodeURIComponent(id)+'&section=counselors'),
    adminCounselors:()=>request('/functions/v1/secondcareer-admin-counselors'),
    issueCounselor:body=>request('/functions/v1/secondcareer-admin-counselors',{body}),
    companyManagers:id=>request('/functions/v1/secondcareer-admin-company-managers?companyId='+encodeURIComponent(id)),
    availableCompanyManagers:id=>request('/functions/v1/secondcareer-admin-company-managers?companyId='+encodeURIComponent(id)+'&view=available'),
    issueCompanyManager:(id,body)=>request('/functions/v1/secondcareer-admin-company-managers?companyId='+encodeURIComponent(id),{body}),
    manageCompanyManager:(id,body)=>request('/functions/v1/secondcareer-admin-company-managers?companyId='+encodeURIComponent(id),{method:'PATCH',body}),
    // STEP 14-D: counts for one allowed company; the server re-checks account, password state and access.
    managerProgress:id=>request('/functions/v1/secondcareer-company-manager-progress?companyId='+encodeURIComponent(id)),
    assignCompanyCounselor:(id,counselorUserId,assigned)=>request('/functions/v1/secondcareer-admin-companies?id='+encodeURIComponent(id)+'&section=counselors',{method:'PATCH',body:{action:assigned?'assign':'unassign',counselorUserId}}),
    // REQ-A-006/007: server-side aggregate; company narrows inside the server-checked organization.
    adminAggregate:(company=null)=>request('/functions/v1/secondcareer-admin-aggregate'+(company?'?company='+encodeURIComponent(company):'')),
    // REQ-A-005: the server re-checks the participant's organization and final submission.
    adminReport:(id,kind='c')=>{if(!['c','p'].includes(kind))throw Error('보고서 종류를 확인해 주세요.');return request('/functions/v1/secondcareer-admin-report?id='+encodeURIComponent(id)+'&kind='+kind)},
    postDraft:()=>{if(passwordChangeRequired)throw Error('먼저 임시 비밀번호를 변경해 주세요.');return request('/functions/v1/secondcareer-assessment?phase=post')},
    compare:id=>{if(passwordChangeRequired)throw Error('먼저 임시 비밀번호를 변경해 주세요.');return request('/functions/v1/secondcareer-assessment?compare='+encodeURIComponent(id))},
    write:(action,body)=>{if(passwordChangeRequired)throw Error('먼저 임시 비밀번호를 변경해 주세요.');return request('/functions/v1/secondcareer-assessment',{body:{action,...body}})},
    report:(id,kind='c')=>{if(passwordChangeRequired)throw Error('먼저 임시 비밀번호를 변경해 주세요.');if(!['c','p'].includes(kind))throw Error('보고서 종류를 확인해 주세요.');return request('/functions/v1/secondcareer-assessment?id='+encodeURIComponent(id)+'&kind='+kind)},
    async logout(){try{if(session)await request('/auth/v1/logout',{method:'POST'})}finally{clear()}},
    clear
  };
}
