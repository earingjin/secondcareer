// Server report rendering shared by the counselor report (?id= in ../index.ts) and the
// admin report (../../secondcareer-admin-report). Moved verbatim from ../index.ts; the
// calculation, judgement, comment/keyword reuse and the 5/3 page layout stay in
// ./profile.js and ../js/*. Only the non-printed toolbar (back button, change-history
// panel) can be chosen by the caller; the defaults are the counselor's.
import {QUESTION_DEFS,qdOptions,qdText} from "../js/00-question-defs-module.js";
import {COUNSELORS,setCounselors,OPT} from "../js/03-options.js";
import {RAW_MIN,RAW_MAX,toScore,GRADE_SETS,ACTIVE_GRADE,EVAL_VERSION} from "../js/02-eval-config.js";
import {esc} from "../js/04-util.js";
import {S} from "./state.js";
import {createProfile} from "./profile.js";

export const agreed=p=>!!p.reg&&(p.reg.a1==='동의'||(p.reg.a1==null&&p.reg.consent===true));
const sheetHead=(t)=>`<div class="sh-head"><span>일을통한행복한삶 (The better life, The Better Career)</span><span>${t||'Second Planning Leading Guide'}</span></div>`;
const sheetFoot=(n,m)=>`<div class="sh-foot"><span class="ft-l">${hdcLogo()}</span><span>Copyright © 2026 JMCAREER All rights reserved. / www.humandc.co.kr</span><span>${n} / ${m}</span></div>`;
const jmLogo=()=>`<span class="logo-jm"><svg viewBox="0 0 30 34" width="22" height="26" aria-hidden="true"><path d="M3 3h6v20c0 4 2.5 6 6 6s6-2 6-6V3h6v21c0 8-5 11-12 11S3 32 3 24z" fill="#17488F"/><path d="M11 9h4v18h-4z" fill="#2F7C82"/></svg>제이엠커리어</span>`;
const hdcLogo=()=>`<span class="logo-hdc"><svg viewBox="0 0 28 22" width="26" height="20" aria-hidden="true"><path d="M2 4h24M2 11h24M2 18h24" stroke="#2F7C82" stroke-width="4" stroke-linecap="round"/><path d="M6 4h6M12 11h8M8 18h10" stroke="#9FC4C7" stroke-width="4" stroke-linecap="round"/></svg>The Human<br>Data Center</span>`;
const leafSVG=(c)=>`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15z" fill="${c||'#6FB39A'}"/><path d="M5 19L14 10" stroke="#fff" stroke-width="1.5" fill="none"/></svg>`;
function bandCells(ai){const c=GRADE_SETS[ACTIVE_GRADE].cut[ai],cv=r=>toScore(r).toFixed(1),b=[[RAW_MIN,c[0]],[c[0]+1,c[1]],[c[1]+1,c[2]],[c[2]+1,RAW_MAX]];return b.map(([x,y])=>`<td>${cv(x)}~${cv(y)}<br><span class="hintline">원점수 ${x}~${y}</span></td>`).join('')}

const qLabel=(path,i,o)=>{const labels=qdOptions(path,'screen');return labels?.[i]||o};
export function ansText(p,code){
  const r=p.reg||{},c0=(r.careers||[])[0]||{},g=p.goal||{},e=p.expect||{};
  const lab=(path,v)=>{const i=OPT[path].indexOf(v);return i>=0?qLabel(path,i,v):v};
  const list=(path,a,rank)=>(a||[]).map((v,i)=>(rank?(i+1)+'순위 ':'')+lab(path,v)).join(', ');
  const tag=(path,v)=>{const i=(OPT[path]||[]).indexOf(v);return v==='기타'?'기타 ('+(r[path.split('.')[1]+'Etc']||'')+')':i>=0?qLabel(path,i,v):v||''};
  if(code[0]==='C'){const v=(p.pre||[])[+code.slice(1)-17];return v?v+' · '+['전혀 아니다','아니다','보통','그렇다','매우 그렇다'][v-1]:''}
  return ({A1:agreed(p)?'동의':r.a1||'',A2:p.counselor||'',A3:r.name,A4:r.gender==='남'?'남성':r.gender==='여'?'여성':'',A5:r.birthDate,PH:r.phone,EM:r.email,A6:c0.co,A7:c0.title,A8:c0.task,
    A9:tag('reg.industry',r.industry),A10:tag('reg.income',r.income),B11:list('goal.b11',g.b11),B12:list('goal.b12',g.b12),B13:list('goal.b13',g.b13,1),B14:list('goal.b14',g.b14),
    B15:g.b15!=null&&g.b15!==''?g.b15+'%':'',B16:g.b16!=null&&g.b16!==''?g.b16+'개월':'',D32:list('expect.d32',e.d32),D33:list('expect.d33',e.d33,1),D34:list('expect.d34',e.d34),D35:list('expect.d35',e.d35),D36:list('expect.d36',e.d36)})[code]||'';
}

export function person(part,a){
 return {id:part.id,nick:part.display_name,company:a?.answers?.reg?.careers?.[0]?.co||'',counselor:part.counselor_user_id,
 reg:{careers:[{},{},{}]},goal:{},expect:{},pre:[],...a?.answers,status:a?.status||'draft',preDate:a?.answers?.preDate||null,result:a?.result||null,history:[]};
}
const historyPanel=(p,histories)=>'<div class="editpanel noprint"><h4>상담사 확인용 (인쇄되지 않음)</h4><div>실제 제출 완료 · 평가 버전 '+esc(EVAL_VERSION)+'</div><b>변경 이력 '+histories.length+'건</b><ul>'+histories.map(h=>{const before=person({id:p.id,display_name:p.nick,counselor_user_id:p.counselor},{answers:h.before_data?.answers}),after=person({id:p.id,display_name:p.nick,counselor_user_id:p.counselor},{answers:h.after_data?.answers});const changes=QUESTION_DEFS.filter(q=>q.step<5).map(q=>({code:q.code,before:ansText(before,q.code),after:ansText(after,q.code)})).filter(q=>q.before!==q.after);return '<li>'+esc(h.created_at)+' · '+changes.map(c=>esc(qdText()[c.code])+': '+esc(c.before)+' → '+esc(c.after)).join(' / ')+'</li>'}).join('')+'</ul></div>';
const COUNSELOR_TOOLBAR={backV:()=> 'cns',backLbl:()=> '담당 내담자 목록',editPanel:historyPanel};
export function report(p,counselors,histories=[],kind='c',toolbar=COUNSELOR_TOOLBAR){
 S.res={id:p.id,role:kind};S.from=kind==='p'?'admin':'cns';S.prevEnt=null;setCounselors(counselors);
 const renderer=createProfile({byId:()=>p,pname:p=>p.reg.name||p.nick,getEntities:()=>[],entOf:()=>null,pmOf:()=>COUNSELORS[p.counselor]||null,
 resultOf:p=>p.result,backV:toolbar.backV,backLbl:toolbar.backLbl,editPanel:p=>toolbar.editPanel(p,histories),jmLogo,hdcLogo,leafSVG,sheetHead,sheetFoot,
 etcOf:(r,k)=>r[k]==='기타'&&r[k+'Etc']?r[k+'Etc']:(r[k]||''),agreed,bandCells,chartLegend:()=>'',barsSVG:()=>''});
 return renderer.vResult(p,kind);
}

// Counselor names for the report header, built the same way for both callers.
export async function reportCounselors(db,organizationId,counselorIds){
 const counselors={};
 if(counselorIds.length){const {data,error}=await db.from('user_profiles').select('user_id,display_name').eq('organization_id',organizationId).eq('role','counselor').in('user_id',counselorIds);if(error)return {counselors:null,error};for(const c of data||[])counselors[c.user_id]={code:c.user_id,n:c.display_name||'담당 상담사',mail:'',tel:''}}
 return {counselors,error:null};
}

// Submitted-only report. The caller has already proven that `part` is in its scope.
// Returns [status, body]; the checks run in the original order: availability,
// change history, report kind.
export async function submittedReport(db,part,a,counselors,kindParam,{toolbar=COUNSELOR_TOOLBAR,withHistory=true}={}){
 if(!part||!a||a.status!=='submitted'||!a.result)return [403,{error:'NOT_AVAILABLE'}];
 let histories=[];
 if(withHistory){
  const {data,error}=await db.from('assessment_history').select('created_at,before_data,after_data').eq('assessment_id',a.id).eq('action','edit').order('created_at',{ascending:false}).limit(100);
  if(error)return [500,{error:'QUERY_FAILED'}];histories=data||[];
 }
 const kind=kindParam||'c';
 if(!['p','c'].includes(kind))return [400,{error:'INVALID_REPORT_KIND'}];
 return [200,{html:report(person(part,a),counselors,histories,kind,toolbar)}];
}
