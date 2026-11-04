// The post entry link is the configured assessment address plus ?entry=post. It carries no
// account, token or personal data; the server still decides whether post entry is allowed.
export const POST_ENTRY_PARAM='entry',POST_ENTRY_VALUE='post';
export function postEntryUrl(assessmentUrl){
  try{const url=new URL(assessmentUrl);if(url.protocol!=='https:')return null;url.searchParams.set(POST_ENTRY_PARAM,POST_ENTRY_VALUE);return url.href}
  catch{return null}
}
export function postAssessmentNotice({displayName,loginId},postUrl,itemCount){
  return `[세컨플래닝] ${displayName}님, 사후진단 안내입니다.

접속 링크: ${postUrl}

아이디: ${loginId}
비밀번호: 사전진단 때 사용하신 기존 비밀번호를 입력해 주세요.

로그인하면 사후진단 화면으로 바로 이동합니다. 사후진단 ${itemCount}문항과 만족도 조사에 모두 응답한 뒤 최종 제출해 주세요.`;
}
export function assessmentNotice({displayName,loginId,temporaryPassword},assessmentUrl,{existing=false}={}){
  return `[세컨플래닝] ${displayName}님, 퇴직준비도 진단 안내입니다.

접속 링크: ${assessmentUrl}

아이디: ${loginId}
${existing?'비밀번호: 발급받은 비밀번호를 입력해 주세요.':`임시 비밀번호: ${temporaryPassword}`}

${existing?'최초 로그인 시 비밀번호 변경 안내가 표시되면 비밀번호를 변경한 후 진단에 참여해 주세요.':'최초 로그인 시 비밀번호를 변경한 후 진단에 참여해 주세요.'}`;
}
