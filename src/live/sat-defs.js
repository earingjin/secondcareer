// Post-assessment satisfaction questions, in legacy wSat() order (src/prototype.js).
// Choice options and limits come from OPT['sat.*'] / LIM['sat.*'].
export const SAT_QUESTIONS=[
  {key:'q1',no:'Q1',text:'세컨플래닝 서비스에 대한 전반적인 만족도',scale:['매우 불만족','매우 만족']},
  {key:'q2',no:'Q2',text:'새로운 경력을 만들어 가는 데 유익했습니까?',scale:['전혀 아니다','매우 그렇다']},
  {key:'q3a',no:'Q3-1',text:'상담 이후 막연한 불안이 줄었다',scale:['전혀 아니다','매우 그렇다']},
  {key:'q3b',no:'Q3-2',text:'미래에 대한 자신감이 높아졌다',scale:['전혀 아니다','매우 그렇다']},
  {key:'q3c',no:'Q3-3',text:'마음이 이전보다 안정되었다',scale:['전혀 아니다','매우 그렇다']},
  {key:'d32',no:'Q3-4',text:'서비스 이후 현재의 마음 상태는 어떠하십니까?'},
  {key:'d33',no:'Q4',text:'서비스 이후 가장 고민되는 부분 3가지를 순서대로 선택해 주세요.'},
  {key:'d34',no:'Q5-1',text:'컨설팅에서 가장 도움이 된 부분 한 가지를 선택해 주세요.'},
  {key:'q5fit',no:'Q5-2',text:'컨설팅 전에 기대했던 부분이 충족되었습니까?',scale:['전혀 아니다','매우 그렇다']},
  {key:'d35',no:'Q6',text:'가장 크게 극복된 경력준비 장애요인 (최대 2가지)'},
  {key:'q7',no:'Q7',text:'서비스에서 개선이 필요하다고 느낀 점 (최대 2가지)'}
];
export const SAT_COMMENT_LABEL='더 나은 서비스를 위한 의견·담당 컨설턴트에게 보내는 메시지 (선택)';
