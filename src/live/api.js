const URL='https://tafrbtqjlrokdnhudswb.supabase.co';
const KEY='sb_publishable_va6hVj1FwfrxMiD6IQb81Q_AWE5m0-8';

// Credentials and tokens remain in this closure; no browser storage is used.
export function createAPI(onExpired){
  let session=null,timer=null,generation=0;
  function clear(){session=null;clearTimeout(timer);generation++}
  async function request(path,{body,anonymous=false,method=body?'POST':'GET'}={}){
    const epoch=generation;
    if(!anonymous&&(!session||Date.now()>=session.expires_at*1000)){clear();onExpired();throw Error('세션이 만료되었습니다. 다시 로그인해 주세요.')}
    let response;
    try{response=await fetch(URL+path,{method,headers:{apikey:KEY,...(!anonymous?{Authorization:'Bearer '+session.access_token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)})}
    catch{throw Error('서버에 연결하지 못했습니다. 저장 여부를 확인한 뒤 다시 시도해 주세요.')}
    if(epoch!==generation)throw Error('세션이 변경되어 요청을 취소했습니다.');
    let data;try{data=await response.json()}catch{throw Error('서버 응답을 확인할 수 없습니다.')}
    if(!response.ok){
      if(response.status===401&&!anonymous){clear();onExpired()}
      const messages={401:'아이디 또는 비밀번호를 확인해 주세요.',403:'이 작업에 대한 권한이 없습니다.',409:'다른 저장 또는 제출이 먼저 반영되었습니다. 새로 조회해 주세요.',429:'로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.'};
      throw Error(messages[response.status]||'서버 처리에 실패했습니다. 변경사항은 저장 완료되지 않았습니다.');
    }
    return data;
  }
  return {
    async login(loginId,password){
      clear();const data=await request('/functions/v1/secondcareer-login',{anonymous:true,body:{loginId,password}});
      if(typeof data.access_token!=='string'||!Number.isFinite(data.expires_at)||data.expires_at*1000<=Date.now())throw Error('올바른 로그인 세션을 받지 못했습니다.');
      session={access_token:data.access_token,expires_at:data.expires_at};
      timer=setTimeout(()=>{clear();onExpired()},Math.min(data.expires_at*1000-Date.now(),2147483647));
      try{return await request('/functions/v1/secondcareer-assessment')}catch(e){clear();throw e}
    },
    read:()=>request('/functions/v1/secondcareer-assessment'),
    write:(action,body)=>request('/functions/v1/secondcareer-assessment',{body:{action,...body}}),
    report:id=>request('/functions/v1/secondcareer-assessment?id='+encodeURIComponent(id)),
    async logout(){try{if(session)await request('/auth/v1/logout',{method:'POST'})}finally{clear()}},
    clear
  };
}
