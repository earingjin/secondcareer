// src/js/00-question-defs.js — 단계 2b 신규. 문항 정의의 단일 원본(36문항 + 연락처·이메일).
// 생성: tests/tools/gen-question-defs.mjs 가 legacy/index.original.html(sha256 62fc9dd4c0c0515e204c1697085dec655d59fbac8e495d78676f982d401ad310)을 실행해 QT·QLABEL·OPT·LIM·REQUIRED·WSTEPS·SH·FACTORS 에서 추출했다.
// 생성 결과는 이후 사람이 편집하는 원본이다. 스크립트를 다시 돌려 덮어쓰지 않는다.
//
// 필드: code 문항 코드 · step/pos 소속 단계(QUESTION_STEPS 인덱스)와 단계 안 순서 · required 필수 여부
//   text.screen 설문 화면 문구(QT) · text.report 보고서용 문구(진단 문항의 요인 문장, 없으면 null)
//   path 보기 목록 이름(OPT 의 키) · max 선택 개수 한도(LIM) · area 진단 문항의 영역 번호(AREAS 의 인덱스) · factor 요인명
//   options[].screen 설문 화면에 표시하는 보기 문구(QLABEL) · options[].report 저장 값(OPT) · options[].chart 차트 라벨(SH)
// options[].report 는 저장 값. 단계 5에서 코드 저장으로 전환하기 전까지 문구를 바꾸면 기존 응답이 어긋난다.
// 화면용 문구와 보고서용 문구는 합치지 않고 문항마다 두 필드로 모두 유지한다(문구 차이 목록: docs/decisions.md).
// 이 파일은 다른 파일에 의존하지 않는다. 가장 먼저 로드한다(01-areas.js 의 FACTORS 와 03-options.js 의 OPT·LIM 이 쓴다).

const QUESTION_STEPS=['참여 동의','기본정보','경력목표','진단 15문항','서비스 기대','검토·제출'];
const QUESTION_DEFS=[
 {code:'A1',step:0,pos:0,required:true,text:{screen:'커리어플래닝 가이드 참여를 위한 개인정보 제공 및 활용에 동의하십니까?',report:null}},
 {code:'A2',step:0,pos:1,required:true,text:{screen:'상담코드를 입력해주세요.',report:null}},
 {code:'A3',step:1,pos:0,required:true,text:{screen:'귀하의 성함을 입력해주세요.',report:null}},
 {code:'A4',step:1,pos:1,required:true,text:{screen:'귀하의 성별을 입력해주세요.',report:null}},
 {code:'A5',step:1,pos:2,required:true,text:{screen:'귀하의 연령대를 입력해주세요.',report:null}},
 {code:'A6',step:1,pos:5,required:true,text:{screen:'현재 소속회사를 입력해주세요.(없다면 이전 소속회사)',report:null}},
 {code:'A7',step:1,pos:6,required:true,text:{screen:'현재 또는 최근까지의 직급/직책을 입력해주세요.',report:null}},
 {code:'A8',step:1,pos:7,required:true,text:{screen:'최근까지 어떤 업무를 하셨나요?(부서명)',report:null}},
 {code:'A9',step:1,pos:8,required:true,text:{screen:'최종 근무처의 주요 업종은 무엇인가요?',report:null},path:'reg.industry',options:[
   {screen:'일반 사무',report:'일반 사무'},
   {screen:'생산/제조',report:'생산/제조'},
   {screen:'운수/물류',report:'운수/물류'},
   {screen:'건설',report:'건설'},
   {screen:'전기/가스/수도',report:'전기/가스/수도'},
   {screen:'법률',report:'법률'},
   {screen:'금융',report:'금융'},
   {screen:'홍보/기획',report:'홍보/기획'},
   {screen:'연구/기술직(R&D)',report:'연구/기술(R&D)'},
   {screen:'교육',report:'교육'},
   {screen:'복지/서비스',report:'복지/서비스'},
   {screen:'기타',report:'기타'}
  ]},
 {code:'A10',step:1,pos:9,required:true,text:{screen:'퇴직 후 매월 어느 정도의 소득수준을 기대하시나요?',report:null},path:'reg.income',options:[
   {screen:'기존 임금이상',report:'기존 임금 이상'},
   {screen:'기존 임금 80% 수준',report:'기존 임금 80% 수준'},
   {screen:'기존 임금 60% 수준',report:'기존 임금 60% 수준'},
   {screen:'기존 임금 40% 수준',report:'기존 임금 40% 수준'},
   {screen:'기타',report:'기타'}
  ]},
 {code:'PH',step:1,pos:3,required:true,text:{screen:'휴대전화번호를 입력해주세요.',report:null}},
 {code:'EM',step:1,pos:4,required:true,text:{screen:'이메일 주소를 입력해주세요.',report:null}},
 {code:'B11',step:2,pos:0,required:true,text:{screen:'퇴직 후 어느 정도 기간 이후부터 직업준비(재취업, 창업, 귀농, 자격증 취득 등)를 시작할 예정인가요?',report:null},path:'goal.b11',max:1,options:[
   {screen:'퇴직 후 곧바로',report:'퇴직 후 곧바로'},
   {screen:'퇴직 후 3개월 이내',report:'퇴직 후 3개월 이내'},
   {screen:'퇴직 후 6개월 이내',report:'퇴직 후 6개월 이내'},
   {screen:'퇴직 후 1년 이내',report:'퇴직 후 1년 이내'},
   {screen:'퇴직 후 1년 이후',report:'퇴직 후 1년 이후'}
  ]},
 {code:'B12',step:2,pos:1,required:true,text:{screen:'퇴직 후 무엇을 하겠다는 구체적인 계획을 가지고 있으신가요?',report:null},path:'goal.b12',max:1,options:[
   {screen:'전혀 고민해본적 없음',report:'전혀 고민해본 적 없음'},
   {screen:'간헐적인 고민수준',report:'간헐적인 고민 수준'},
   {screen:'몇가지 안을 고민중',report:'몇 가지 안을 고민 중'},
   {screen:'이미 결정되어 준비중에 있음',report:'이미 결정되어 진행 중에 있음'},
   {screen:'이미 결정되었고 목표달성 예정',report:'이미 결정되었고 목표달성 예정'}
  ]},
 {code:'B13',step:2,pos:2,required:true,text:{screen:'현재 가장 관심을 두고 있는 분야는 어떤 분야인가요?(2가지를 우선 순위로 선택해주세요)',report:null},path:'goal.b13',max:2,options:[
   {screen:'동일업종 재취업',report:'동일 업종 재취업'},
   {screen:'다른 업종 재취업',report:'다른 업종 재취업'},
   {screen:'프리랜서(전문직종)',report:'프리랜서(전문직종)'},
   {screen:'창업',report:'창업'},
   {screen:'귀농/귀촌/귀어',report:'귀농/귀촌/귀어'},
   {screen:'재능기부 및 사회적 기여',report:'재능기부 및 사회적 기여'},
   {screen:'결정된 바 없음',report:'결정된 바 없음'}
  ]},
 {code:'B14',step:2,pos:3,required:true,text:{screen:'귀하가 선택하는 경력목표는 귀하의 경력과 연관성이 있나요?',report:null},path:'goal.b14',max:1,options:[
   {screen:'경력과 연관성이 있음',report:'경력과 연관성이 있음'},
   {screen:'관련 교육(학업/자격증) 이수',report:'관련 교육(학업/자격증) 이수'},
   {screen:'취미와 연관성이 있음',report:'취미와 연관성이 있음'},
   {screen:'지인과 연관성있음',report:'지인과 연관성이 있음'},
   {screen:'관련 일을 간헐적으로 경험하였음',report:'관련 일을 간헐적으로 경험하였음'},
   {screen:'관련성이 전혀없음',report:'관련성이 전혀 없음'}
  ]},
 {code:'B15',step:2,pos:4,required:true,text:{screen:'본인이 기대하는 경력목표 달성 가능성은 어느정도 인가요?',report:null}},
 {code:'B16',step:2,pos:5,required:true,text:{screen:'경력목표 달성을 위한 예상 소요기간은 어느정도 인가요?',report:null}},
 {code:'C17',step:3,pos:0,required:true,text:{screen:'나 자신의 성격, 재능, 흥미, 적성을 정확하게 이해하고 있다.',report:'나 자신의 성격, 재능, 흥미, 적성을 정확하게 이해하고 있다.'},area:0,factor:'특성인식'},
 {code:'C18',step:3,pos:1,required:true,text:{screen:'능력과 상관없이 꼭 해보고 싶은 활동(직업 등)이 있다.',report:'능력과 상관없이 꼭 해보고 싶은 활동(직업 등)이 있다.'},area:0,factor:'가치인식'},
 {code:'C19',step:3,pos:2,required:true,text:{screen:'지금 내 상황(재정, 역할, 능력, 신체건강 등)을 충분히 이해하고 있다.',report:'지금 내 상황(재정, 역할, 능력, 신체건강 등)을 충분히 이해하고 있다.'},area:0,factor:'상황인식'},
 {code:'C20',step:3,pos:3,required:true,text:{screen:'능력, 적성, 흥미, 신체능력 등을 고려하여 적합한 직업(분야)을 고려 중이다.',report:'능력, 적성, 흥미, 신체능력 등을 고려하여 적합한 직업(분야)을 고려 중이다.'},area:1,factor:'직업타당성'},
 {code:'C21',step:3,pos:4,required:true,text:{screen:'웹사이트, 모바일 앱, 인적네트워크를 활용하여 해당 분야의 정보를 수집중이다.',report:'웹사이트, 모바일 앱, 인적네트워크를 활용하여 해당 분야의 정보를 수집 중이다.'},area:1,factor:'정보수집'},
 {code:'C22',step:3,pos:5,required:true,text:{screen:'나에게 적합한 정보인지 자격증, 교육과정, 채용정보 등을 분석할 수 있다.',report:'나에게 적합한 정보인지 자격증, 교육과정, 채용정보 등을 분석할 수 있다.'},area:1,factor:'정보분석'},
 {code:'C23',step:3,pos:6,required:true,text:{screen:'하고 싶은 일, 잘 할 수 있는 일 등의 고심 끝에 2~3가지 이내로 의사결정 중이다.',report:'하고 싶은 일, 잘 할 수 있는 일 등의 고심 끝에 2~3가지 이내로 의사결정 중이다.'},area:2,factor:'결정수준'},
 {code:'C24',step:3,pos:7,required:true,text:{screen:'원하는 목표를 위한 기본자격, 교육, 조건, 임금, 제도 등을 파악하고 있다.',report:'원하는 목표를 위한 기본자격, 교육, 조건, 임금, 제도 등을 파악하고 있다.'},area:2,factor:'객관성평가'},
 {code:'C25',step:3,pos:8,required:true,text:{screen:'현재 목표는 네트워크, 경험자 등의 충분한 조언(경험)을 얻었다.',report:'현재 목표는 네트워크, 경험자 등의 충분한 조언(경험)을 얻었다.'},area:2,factor:'실현가능성'},
 {code:'C26',step:3,pos:9,required:true,text:{screen:'나의 계획은 목표에 맞는 현실가능한 계획이다.',report:'나의 계획은 목표에 맞는 현실가능한 계획이다.'},area:3,factor:'커리어계획'},
 {code:'C27',step:3,pos:10,required:true,text:{screen:'현재 목표는 달성 가능한 현실적인 목표다.',report:'현재 목표는 달성 가능한 현실적인 목표다.'},area:3,factor:'현실적목표'},
 {code:'C28',step:3,pos:11,required:true,text:{screen:'경력목표에 따라 감수해야하는 리스크가 무엇인지 충분히 알고 있다.',report:'경력목표에 따라 감수해야 하는 리스크가 무엇인지 충분히 알고 있다.'},area:3,factor:'리스크평가'},
 {code:'C29',step:3,pos:12,required:true,text:{screen:'내가 선택한 경력목표와 계획에 확신이 차 있다.',report:'내가 선택한 경력목표와 계획에 확신이 차 있다.'},area:4,factor:'목표확신'},
 {code:'C30',step:3,pos:13,required:true,text:{screen:'목표를 달성할 수 있을지 불확실하지만 계획을 수정하며 도전할 것이다.',report:'목표를 달성할 수 있을지 불확실하지만 계획을 수정하며 도전할 것이다.'},area:4,factor:'도전의식'},
 {code:'C31',step:3,pos:14,required:true,text:{screen:'어려움은 있겠지만 내가 세운 목표와 계획을 실제로 실행할 것이다.',report:'어려움은 있겠지만 내가 세운 목표와 계획을 실제로 실행할 것이다.'},area:4,factor:'실행력'},
 {code:'D32',step:4,pos:0,required:true,text:{screen:'직업 전환(퇴직 포함)을 맞이하는 느낌은 어떠하십니까?',report:null},path:'expect.d32',max:1,options:[
   {screen:'잘 될 것이라고 믿는다.',report:'잘 될 것이라고 믿는다.',chart:'잘 될 것이라|믿는다'},
   {screen:'구체적으로 준비하고 있어 안심이다.',report:'구체적으로 준비하고 있어 안심이다.',chart:'구체적으로|준비해 안심'},
   {screen:'체감되지 않아 잘 모르겠다.',report:'체감되지 않아 잘 모르겠다.',chart:'체감되지 않아|모르겠다'},
   {screen:'이제부터 진로를 생각할 예정이다.',report:'이제부터 진로를 생각할 예정이다.',chart:'이제부터 진로|생각할 예정'},
   {screen:'막연한 걱정이 앞선다.',report:'사람을 만나는 것에 위축된다.',chart:'사람 만나는|것이 위축'},
   {screen:'기운이 없고 잠을 설친다.',report:'진로 고민으로 잠을 설친다.',chart:'진로 고민으로|잠을 설침'}
  ]},
 {code:'D33',step:4,pos:1,required:true,text:{screen:'퇴직 이후 고민이 되는 부분은 무엇인가요? (고민되는 부분 3가지를 순서대로 선택해주세요.)',report:null},path:'expect.d33',max:3,options:[
   {screen:'수입감소 등 경제적 상황',report:'수입감소 등 경제적 상황',chart:'수입감소 등|경제적 상황'},
   {screen:'역할이나 활동영역의 축소',report:'역할이나 활동영역의 축소',chart:'역할·활동|영역의 축소'},
   {screen:'사회적 관계의 축소',report:'사회적 관계의 축소',chart:'사회적 관계|의 축소'},
   {screen:'상대적으로 많아진 시간에 대한 활용',report:'상대적으로 많아진 시간에 대한 활용',chart:'많아진 시간|에 대한 활용'},
   {screen:'가족과의 관계 문제',report:'가족과의 관계 문제',chart:'가족과의|관계 문제'},
   {screen:'건강 유지 또는 관리',report:'건강 유지 또는 관리',chart:'건강 유지|또는 관리'},
   {screen:'인생의 공허함',report:'인생의 공허함',chart:'인생의|공허함'}
  ]},
 {code:'D34',step:4,pos:2,required:true,text:{screen:'이번 컨설팅을 통해 어떤 기대를 하고 계시나요? (가장 고민인 한 가지만 선택해주십시오.)',report:null},path:'expect.d34',max:1,options:[
   {screen:'심리진단 및 분석(강점, 적성 등)',report:'심리진단 및 분석(강점, 적성 등)',chart:'심리진단|및 분석'},
   {screen:'커리어목표 및 방향설정과 플랜',report:'커리어목표 및 방향설정과 플랜설계',chart:'커리어목표|·방향설정'},
   {screen:'막연함 개선(심리안정/자신감 증진)',report:'막연함 개선(심리안정/자신감 증진)',chart:'막연함 개선|(심리안정)'},
   {screen:'재취업(채용전략부터 입사까지) 지원',report:'재취업(채용전략부터 입사까지) 지원',chart:'재취업|(채용~입사)'},
   {screen:'창업컨설팅(아이템, 전략 등)',report:'창업컨설팅(아이템, 전략 등)',chart:'창업|컨설팅'},
   {screen:'자산관리(재태크, 부동산 등) 가이드',report:'자산관리(재테크, 부동산 등) 가이드',chart:'자산관리|가이드'},
   {screen:'새로운 경력설계와 자기개발 방법',report:'새로운 경력설계와 자기개발 방법',chart:'새로운 경력설계|·자기개발'}
  ]},
 {code:'D35',step:4,pos:3,required:true,text:{screen:'현재 새롭게 만들어 길 경력을 준비하는데 있어서 장애 요인은 무엇인가요? (가장 고민인 두가지만 선택해주십시오.)',report:null},path:'expect.d35',max:2,options:[
   {screen:'진로에 대한 불확실성',report:'진로에 대한 불확실성',chart:'진로에 대한|불확실성'},
   {screen:'목표에 대한 확신의 부족',report:'목표에 대한 확신의 부족',chart:'목표에 대한|확신의 부족'},
   {screen:'하고자 하는 의지 부족',report:'하고자 하는 의지 부족',chart:'하고자 하는|의지 부족'},
   {screen:'필요한 정보의 부족',report:'필요한 정보의 부족',chart:'필요한|정보부족'},
   {screen:'전문 네트워크 부족(인맥/기관) 부족',report:'전문 네트워크(인맥/기관) 부족',chart:'전문 네트워크|부족'}
  ]},
 {code:'D36',step:4,pos:4,required:true,text:{screen:'첫 회기 컨설팅은 어떤 형식으로 진행하기를 바라시나요?(최대 2가지 선택)',report:null},path:'expect.d36',max:2,options:[
   {screen:'서비스 효과 및 내용, 성공사례',report:'서비스 효과 및 내용, 성공사례',chart:'서비스 효과|및 내용|성공사례'},
   {screen:'성격검사를 활용한 자기분석의 시간',report:'성격검사를 활용한 자기분석의 시간',chart:'성격검사를 활용한|자기분석|시간'},
   {screen:'자신의 상황에 맞는 컨설팅 방향설정',report:'자신의 상황에 맞는 컨설팅 방향설정',chart:'자신의 상황에|맞는 컨설팅|방향설정'},
   {screen:'재취업 분야 및 입사서류 작성',report:'재취업 분야 및 입사서류 작성',chart:'재취업 분야|및 입사서류|작성'},
   {screen:'창업/귀농·귀촌·귀어에 대한 준비',report:'창업/귀농·귀촌·귀어에 대한 준비',chart:'창업·귀농·|귀촌·귀어|준비'},
   {screen:'노후를 위한 준비(인생설계 컨설팅)',report:'노후를 위한 준비(인생설계 컨설팅)',chart:'노후를 위한 준비|(인생설계|컨설팅)'},
   {screen:'나에게 맞는 노후와 유사 성공사례',report:'나에게 맞는 노후와 유사 성공사례',chart:'나에게 맞는|노후와|유사성공사례'}
  ]}
];

// ---------- 파생 뷰 생성 함수(순수 함수) ----------
// 기존 전역 이름(QT·QLABEL·OPT·LIM·REQUIRED·C_CODES·WSTEPS·FACTORS·SH)은 원래 자리에서 이 함수로 값만 만든다.
const qdByPath=p=>QUESTION_DEFS.find(d=>d.path===p);
const qdText=()=>Object.fromEntries(QUESTION_DEFS.map(d=>[d.code,d.text.screen]));
const qdRequired=()=>Object.fromEntries(QUESTION_DEFS.map(d=>[d.code,d.required]));
const qdOptions=(path,field)=>qdByPath(path).options.map(o=>o[field]);   // field: 'screen' | 'report' | 'chart'
const qdMax=path=>qdByPath(path).max;
const qdStepCodes=n=>QUESTION_DEFS.filter(d=>d.step===n).sort((a,b)=>a.pos-b.pos).map(d=>d.code);
const qdFactors=()=>QUESTION_DEFS.filter(d=>d.factor!==undefined).sort((a,b)=>a.pos-b.pos).map(d=>[d.factor,d.text.report]);

globalThis.__SECOND_PLANNING_QUESTION_DEFS__={QUESTION_STEPS,QUESTION_DEFS,qdByPath,qdText,qdRequired,qdOptions,qdMax,qdStepCodes,qdFactors};
