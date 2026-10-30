export function assessmentNotice({displayName,loginId,temporaryPassword},assessmentUrl,{existing=false}={}){
  return `[세컨플래닝] ${displayName}님, 퇴직준비도 진단 안내입니다.

접속 링크: ${assessmentUrl}

아이디: ${loginId}
${existing?'비밀번호: 발급받은 비밀번호를 입력해 주세요.':`임시 비밀번호: ${temporaryPassword}`}

${existing?'최초 로그인 시 비밀번호 변경 안내가 표시되면 비밀번호를 변경한 후 진단에 참여해 주세요.':'최초 로그인 시 비밀번호를 변경한 후 진단에 참여해 주세요.'}`;
}
