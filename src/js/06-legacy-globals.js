// 단계 3b-1: ES 모듈 전환 동안 기존 테스트·인라인 핸들러의 비한정 전역 접근을 유지한다.
const TEST_GLOBAL_NAMES=[
  'a2Msg','ageMsg','ansText','applyCounselorEdit','areaScores','cmtParts','commentArea','computeResult','demoD36','demoSat','emptyP','fitSheets','fmtDate','fmtPhone','gradeBy','gradeOf','gradeUnsure','missing','nav','openRes','recomputeResult','render','resultOf','save','seed','seedEnt','selfTests','setMode','setPath','startEdit','status','steps','toAssessment','toSat','vVerify',
  'ACTIVE_COMPARE','ACTIVE_GRADE','ageBand','AREA_COUNT','AREAS','byId','C_CODES','CMT','COMPARE_SETS','EVAL_VERSION','FACTORS','full','GOAL_TO_KW','GRADE_NAMES','GRADE_SETS','gradeTxt','ITEMS_PER_AREA','KW_AGE','KW_GOAL','KW_PRO','LIM','OPT','qdByPath','qdFactors','qdMax','qdOptions','qdRequired','qdStepCodes','qdText','qLabel','QLABEL','qName','QNO','QT','QUESTION_DEFS','QUESTION_STEPS','REF_AVG','REQUIRED','S','SCALE','SH','stepOf','TOTAL_Q','WSTEPS',
  'COUNSELORS','DB','ENT'
];

const HANDLER_GLOBAL_NAMES=[
  'setF','render','goPage','copyText','nav','setMode','byId','goEp','goStep','addClients','answer','copyLink','dl','goHome','msgOf','nextFrom','previewReport','readCsv','rmove','selEnt','a2Hint','addCons','addEnt','addMgr','cancelEdit','clearLogo','curEnt','delCons','delEnt','delMgr','doLogin','doMgrLogin','exportPptx','finishPost','fmtDate','fmtPhone','goQ','goReg','logout','logoutMgr','mgrMsg','nextStep','reissueMgr','rgo','save','saveEdit','setBirth','setCareer','setConsent','setFc','setFq','setFs','setLogo','setSat','startEdit','submitPre','toAssessment','toggleChip','toSat'
];

function installLegacyGlobals(values,accessors){
  const names=[...new Set([...TEST_GLOBAL_NAMES,...HANDLER_GLOBAL_NAMES,'$','S','ENT'])];
  names.forEach(name=>{
    if(accessors[name])Object.defineProperty(window,name,{configurable:true,enumerable:false,get:accessors[name].get,set:accessors[name].set});
    else{
      if(!Object.prototype.hasOwnProperty.call(values,name))throw new Error('missing legacy global: '+name);
      Object.defineProperty(window,name,{configurable:true,enumerable:false,get:()=>values[name]});
    }
  });
  return names;
}

export {TEST_GLOBAL_NAMES,HANDLER_GLOBAL_NAMES,installLegacyGlobals};
