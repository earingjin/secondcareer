import {QUESTION_DEFS,qdRequired,qdStepCodes} from "../js/00-question-defs-module.js";
import {OPT,LIM} from "../js/03-options.js";
import {ITEM_COUNT,SCALE_MIN,SCALE_MAX,EVAL_VERSION} from "../js/02-eval-config.js";
import {agreed} from "./report.ts";
const REQUIRED=qdRequired(),C_CODES=qdStepCodes(3),stepOf=c=>QUESTION_DEFS.find(q=>q.code===c)?.step;
function parseBirth(v){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||''));if(!m)return null;const y=+m[1],mo=+m[2],d=+m[3],dt=new Date(y,mo-1,d);if(dt.getFullYear()!==y||dt.getMonth()!==mo-1||dt.getDate()!==d)return null;if(y<1900||dt>new Date())return null;return {y,mo,d}}
const PHONE_RE=/^01[016789]-\d{3,4}-\d{4}$/,EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function missing(p){
 const r=p.reg||{},c0=(r.careers||[])[0]||{},g=p.goal||{},e=p.expect||{},out=[];
 const add=(code,msg)=>{if(REQUIRED[code]!==false)out.push({code,step:stepOf(code),msg})};
 const blank=v=>!String(v==null?'':v).trim();
 if(r.a1!=='동의'&&!agreed(p))add('A1',r.a1==='미동의'?'개인정보 제공 및 활용에 동의해야 설문에 참여할 수 있습니다.':'동의 여부를 선택해 주세요.');
 if(blank(p.counselor))add('A2','상담코드를 입력해 주세요.');
 if(blank(r.name))add('A3','성함을 입력해 주세요.');
 if(!r.gender)add('A4','성별을 선택해 주세요.');
 if(blank(r.birthDate))add('A5','생년월일을 입력해 주세요.');else if(!parseBirth(r.birthDate))add('A5','생년월일을 YYYY-MM-DD 형식의 실제 날짜로 입력해 주세요.');
 if(blank(r.phone))add('PH','휴대전화번호를 입력해 주세요.');else if(!PHONE_RE.test(r.phone))add('PH','휴대전화번호 형식을 확인해 주세요. (예: 010-1234-5678)');
 if(blank(r.email))add('EM','이메일을 입력해 주세요.');else if(!EMAIL_RE.test(String(r.email).trim()))add('EM','이메일 형식을 확인해 주세요. (예: name@example.com)');
 if(blank(c0.co))add('A6','소속회사를 입력해 주세요.');
 if(blank(c0.title))add('A7','직급/직책을 입력해 주세요.');
 if(blank(c0.task))add('A8','업무(부서명)를 입력해 주세요.');
 if(!r.industry)add('A9','업종을 하나 선택해 주세요.');else if(r.industry==='기타'&&blank(r.industryEtc))add('A9','기타 내용을 입력해 주세요.');
 if(!r.income)add('A10','기대 소득수준을 하나 선택해 주세요.');else if(r.income==='기타'&&blank(r.incomeEtc))add('A10','기타 내용을 입력해 주세요.');
 if(!(g.b11||[]).length)add('B11','하나를 선택해 주세요.');
 if(!(g.b12||[]).length)add('B12','하나를 선택해 주세요.');
 const b13=g.b13||[];if(b13.length!==2||b13[0]===b13[1])add('B13','서로 다른 2가지를 1순위, 2순위 순서로 선택해 주세요. (현재 '+b13.length+'개)');
 if(!(g.b14||[]).length)add('B14','하나를 선택해 주세요.');
 if(blank(g.b15))add('B15','달성 가능성을 숫자로 입력해 주세요.');else if(!/^\d{1,3}$/.test(String(g.b15).trim())||+g.b15>100)add('B15','0~100 사이 숫자로 입력해 주세요.');
 if(blank(g.b16))add('B16','예상 소요기간을 개월 수로 입력해 주세요.');else if(!/^\d{1,3}$/.test(String(g.b16).trim())||+g.b16>600)add('B16','0~600 사이 개월 수로 입력해 주세요.');
 C_CODES.forEach((c,i)=>{const v=(p.pre||[])[i];if(!(v>=1&&v<=5))add(c,'응답을 선택해 주세요.')});
 if((e.d32||[]).length!==1)add('D32','하나를 선택해 주세요.');
 const d33=e.d33||[];if(d33.length!==3||new Set(d33).size!==3)add('D33','서로 다른 3가지를 순서대로 선택해 주세요. (현재 '+d33.length+'개)');
 if((e.d34||[]).length!==1)add('D34','하나를 선택해 주세요.');
 if((e.d35||[]).length!==2)add('D35','정확히 2가지를 선택해 주세요. (현재 '+(e.d35||[]).length+'개)');
 const n36=(e.d36||[]).length;if(n36<1||n36>2)add('D36','1~2가지를 선택해 주세요.');
 return out;
}

const fields={reg:['name','gender','birthDate','birth','phone','email','careers','consent','a1','industry','industryEtc','income','incomeEtc','addr','edu','major','totalYears','salary','goal1','goal2','reason','region','wage','certs','computer','lang','hobby'],goal:['b11','b12','b13','b14','b15','b16'],expect:['d32','d33','d34','d35','d36'],done:['reg','goal','expect']};


export function sanitize(input){
 if(!input||Array.isArray(input)||typeof input!=='object')throw Error('INPUT');
 const result={};
 for(const group of Object.keys(fields)){
  const value=input[group];if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INPUT');
  result[group]={};
  for(const key of Object.keys(value)){
   if(!fields[group].includes(key))throw Error('INPUT');
   const v=value[key],path=group+'.'+key;
   if(LIM[path]&&!Array.isArray(v))throw Error('INPUT');
   if(group==='reg'&&['industry','income'].includes(key)&&v!==''&&!OPT[path].includes(v))throw Error('INPUT');
   if(group==='reg'&&key==='gender'&&!['','남','여'].includes(v))throw Error('INPUT');
   if(group==='done'||key==='consent'){if(typeof v!=='boolean')throw Error('INPUT')}
   else if(key==='careers'){
    if(!Array.isArray(v)||v.length>3||!v.every(c=>c&&typeof c==='object'&&!Array.isArray(c)&&Object.entries(c).every(([k,x])=>['co','dept','title','task','yrs'].includes(k)&&typeof x==='string'&&x.length<=200)))throw Error('INPUT');
   }else if(Array.isArray(v)){
    const path=group+'.'+key,options=OPT[path];if(!options||v.length>(LIM[path]||1)||new Set(v).size!==v.length||!v.every(x=>options.includes(x)))throw Error('INPUT');
   }else if(typeof v!=='string'||v.length>1000)throw Error('INPUT');
   result[group][key]=v;
  }
 }
 if(!Array.isArray(input.pre)||input.pre.length!==ITEM_COUNT||!input.pre.every(v=>v===null||(Number.isInteger(v)&&v>=SCALE_MIN&&v<=SCALE_MAX)))throw Error('INPUT');
 result.pre=input.pre;
 if(result.reg.birthDate){const b=parseBirth(result.reg.birthDate);if(b)result.reg.birth=String(b.y)}
 return result;
}
export async function readBody(req){
 const reader=req.body?.getReader();if(!reader)throw Error('INPUT');
 let size=0,chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw Error('INPUT')}chunks.push(value)}
 const all=new Uint8Array(size);let pos=0;for(const c of chunks){all.set(c,pos);pos+=c.length}return JSON.parse(new TextDecoder().decode(all));
}
