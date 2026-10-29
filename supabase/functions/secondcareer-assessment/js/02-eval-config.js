// src/js/02-eval-config.js — legacy/index.original.html 486–509행을 그대로 옮김(평가 설정(비교군·판정 구간·판정 함수)). 1b 에서 환산·구조 상수화 등 일부 수정(docs/decisions.md 참조).
/* ---------- 평가 설정 (지시서 §6-3) : 바꾸기 쉬운 위치 ---------- */
// 문항·영역 구조와 환산. 문항 수·영역 수·영역당 문항 수·환산식은 여기서만 정의하고 다른 곳은 이 이름을 쓴다.
const AREA_COUNT=5,ITEMS_PER_AREA=3,SCALE_MIN=1,SCALE_MAX=5,SCORE_MAX=100;
const ITEM_COUNT=AREA_COUNT*ITEMS_PER_AREA;                          // 진단 문항 수
const RAW_MIN=ITEMS_PER_AREA*SCALE_MIN,RAW_MAX=ITEMS_PER_AREA*SCALE_MAX; // 영역 원점수 범위
const AREA_IDX=Array.from({length:AREA_COUNT},(_,i)=>i);
// 영역 원점수 → 100점 환산(소수 첫째 자리 반올림). 환산식은 이 함수 하나만 쓴다.
const toScore=raw=>Math.round(((raw/ITEMS_PER_AREA-SCALE_MIN)/(SCALE_MAX-SCALE_MIN)*SCORE_MAX)*10)/10;
// 차트 눈금·위치(표시용 고정값). 판정 구간에서 계산해 만들지 않는다.
const GRADE_TICKS=[0,33.3,58.3,83.3,100];
const BAL_Y_TICKS=[0,20,40,60,80,100];
const BAL_Y_LEVELS=[['높음',91],['다소<br>높음',70],['보통',45],['다소<br>낮음',17]];
// 비교군 평균. 원본 차트 XML이 참조하는 1차(평가기준!N6:N10)를 기본값으로 쓴다. 2차는 사용자가 명시적으로 바꾸기 전 적용하지 않는다.
const COMPARE_SETS={
 v1:{label:'1차 비교군 · 평가기준!N6:N10',vals:[66.7,58.3,58.3,41.7,66.7]},
 v2:{label:'2차 비교군(2022.12.12, 69명) · 평가기준!N14:N18',vals:[49.2,50.0,47.5,52.5,52.5]}
};
const ACTIVE_COMPARE='v1';
const REF_AVG=COMPARE_SETS[ACTIVE_COMPARE].vals;
const EVAL_VERSION='macro-chart-v1-unverified';
// 판정 구간(원점수 기준). cut=[다소낮음 상한, 보통 상한, 다소높음 상한]. 버전끼리 섞지 않는다.
const GRADE_SETS={
 conv:{label:'평가기준!C22:E34 (VBA fun1 참조표)',cut:[[7,10,13],[7,10,13],[7,10,13],[7,10,13],[7,10,13]]},
 v1:{label:'1차 원점수 평가기준!F6:I10',cut:[[6,10,13],[6,10,13],[6,10,13],[6,10,13],[7,10,13]]},
 v2:{label:'2차 원점수 평가기준!F14:I18',cut:[[7,10,13],[7,10,13],[7,10,13],[7,10,13],[7,10,13]],ambiguous:{2:[10]}} // 의사결정 보통 8~10 / 다소높음 10~13 중복 표기 — 임의 정정 금지
};
const ACTIVE_GRADE='conv';
const GRADE_NAMES=['다소 낮음','보통','다소 높음','매우 높음'];
function gradeBy(set,ai,raw){const g=GRADE_SETS[set];if(g.ambiguous&&(g.ambiguous[ai]||[]).includes(raw))return null;const c=g.cut[ai];return GRADE_NAMES[raw<=c[0]?0:raw<=c[1]?1:raw<=c[2]?2:3]}
function gradeOf(ai,raw){return gradeBy(ACTIVE_GRADE,ai,raw)}
// 버전마다 판정이 다르거나 원본에 중복 표기가 있는 원점수 → '검증 필요'
function gradeUnsure(ai,raw){const v=Object.keys(GRADE_SETS).map(k=>gradeBy(k,ai,raw));return v.some(x=>x==null)||new Set(v).size>1}
const gradeTxt=(ai,raw)=>(gradeOf(ai,raw)||'검증 필요').replace(' ','')+(gradeUnsure(ai,raw)?'*':'');
const UNSURE_NOTE='* 표시는 원본 평가기준표의 버전(1차·2차·환산표)에 따라 판정이 달라 확인이 필요한 점수입니다.';
const SCALE=['전혀 아니다','아니다','보통','그렇다','매우 그렇다'];

export {AREA_COUNT,ITEMS_PER_AREA,SCALE_MIN,SCALE_MAX,SCORE_MAX,ITEM_COUNT,RAW_MIN,RAW_MAX,AREA_IDX,toScore,GRADE_TICKS,BAL_Y_TICKS,BAL_Y_LEVELS,COMPARE_SETS,ACTIVE_COMPARE,REF_AVG,EVAL_VERSION,GRADE_SETS,ACTIVE_GRADE,GRADE_NAMES,gradeBy,gradeOf,gradeUnsure,gradeTxt,UNSURE_NOTE,SCALE};
