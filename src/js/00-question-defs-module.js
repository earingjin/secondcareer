// 단계 3b-1 호환 브리지: 계약 대상인 00-question-defs.js 본문은 모듈 문법 없이 유지한다.
import './00-question-defs.js';

const {QUESTION_STEPS,QUESTION_DEFS,qdByPath,qdText,qdRequired,qdOptions,qdMax,qdStepCodes,qdFactors}=globalThis.__SECOND_PLANNING_QUESTION_DEFS__;
delete globalThis.__SECOND_PLANNING_QUESTION_DEFS__;

export {QUESTION_STEPS,QUESTION_DEFS,qdByPath,qdText,qdRequired,qdOptions,qdMax,qdStepCodes,qdFactors};
