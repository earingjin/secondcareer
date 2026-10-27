// src/js/03-options.js — legacy/index.original.html 510–539행을 그대로 옮김(보기(OPT)·선택 한도·데모 데이터 함수). 이 줄만 추가됨.
import {qdOptions,qdMax} from './00-question-defs-module.js';

let COUNSELORS={};
function setCounselors(value){COUNSELORS=value;return COUNSELORS}
const OPT={
 'goal.b11':qdOptions('goal.b11','report'),
 'goal.b12':qdOptions('goal.b12','report'),
 'goal.b13':qdOptions('goal.b13','report'),
 'goal.b14':qdOptions('goal.b14','report'),
 'expect.d32':qdOptions('expect.d32','report'),
 'expect.d33':qdOptions('expect.d33','report'),
 'expect.d34':qdOptions('expect.d34','report'),
 'expect.d35':qdOptions('expect.d35','report'),
 'expect.d36':qdOptions('expect.d36','report'),
 'reg.goal1':['동일 업종 동일 직무','동일 업종 다른 직무','다른 업종 동일 직무','다른 업종 다른 직무'],
 'reg.wage':['최저임금','3천만 원대','4천만 원대','5천만 원 이상'],
 'reg.industry':qdOptions('reg.industry','report'),
 'reg.income':qdOptions('reg.income','report')
};
const LIM={'goal.b11':qdMax('goal.b11'),'goal.b12':qdMax('goal.b12'),'goal.b13':qdMax('goal.b13'),'goal.b14':qdMax('goal.b14'),'expect.d32':qdMax('expect.d32'),'expect.d33':qdMax('expect.d33'),'expect.d34':qdMax('expect.d34'),'expect.d35':qdMax('expect.d35'),'expect.d36':qdMax('expect.d36')};
OPT['sat.d32']=OPT['expect.d32'];OPT['sat.d33']=OPT['expect.d33'];OPT['sat.d34']=OPT['expect.d34'];OPT['sat.d35']=OPT['expect.d35'];
OPT['sat.q7']=['상담 시간·회기 수','진단 문항 수·소요시간','결과 리포트 내용','상담 후 사후 지원·정보 제공','온라인 시스템 사용성','상담 일정 조율','특별히 없음'];
Object.assign(LIM,{'sat.d32':1,'sat.d33':3,'sat.d34':1,'sat.d35':2,'sat.q7':2});
function demoD36(i){const a=[2,2,3,2,2,0,2,3,5,2][i%10];let b=[3,5,0,6,1,3,5,2,3,0][i%10];if(a===b)b=(b+1)%7;return [OPT['expect.d36'][a],OPT['expect.d36'][b]]}
function demoSat(i){
  const o=OPT,sel=(arr,idx)=>idx.map(k=>arr[k%arr.length]);
  const q=[5,5,5,4,5,5,5,5,3,5];
  return {_v2:1,q1:q[i%10],q2:q[(i+3)%10],q3a:[4,5,4,5,4][i%5],q3b:[5,4,4,5,5][i%5],q3c:[4,4,5,5,4][i%5],
    d32:[o['expect.d32'][[0,1,0,1,3][i%5]]],d33:sel(o['expect.d33'],[i+3,i+5,i+1]),d34:[o['expect.d34'][(i+2)%6]],q5fit:[4,5,5,4,5][i%5],
    d35:sel(o['expect.d35'],i%3===0?[i+3]:[i+3,i+1]),q7:sel(o['sat.q7'],i%4===0?[6]:[i,i+2]),
    q7txt:['온라인 교육이 조금 어색했지만 시간이 지나며 큰 도움이 되었습니다.','또 만나고 싶습니다. 감사합니다.','전반적으로 모든 시간이 감사했습니다. 고맙습니다.','막연하고 심란했는데 상담으로 위안이 되었고 정보를 잘 활용할 수 있었습니다.','미래를 위한 정보를 많이 얻어 갑니다. 감사합니다.','자신감이 없었는데 도움이 많이 되었습니다. 주변에도 추천하겠습니다.','먼 곳까지 와 주셔서 항상 감사했습니다.','더 좋은 정보를 주시려고 애써 주시는 모습에 감사드립니다.','','컨설팅 횟수를 추가했으면 좋겠습니다.','할 수 있다는 자신감을 심어 주는 프로그램이면 좋겠습니다.','도움되었습니다. 감사합니다.'][i%12]};
}

export {COUNSELORS,setCounselors,OPT,LIM,demoD36,demoSat};

