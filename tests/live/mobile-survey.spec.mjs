import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {serve} from '../tools/serve-static.mjs';

// Browser + HTTP protocol mocks only. No request reaches the deployed server;
// this fixture does not implement or verify server validation/calculation.
let server;
test.beforeAll(async()=>{server=await serve('src')});
test.afterAll(async()=>{await server.close()});
const order=['A1','A2','A3','A4','A5','PH','EM','A6','A7','A8','A9','A10','B11','B12','B13','B14','B15','B16',...Array.from({length:15},(_,i)=>'C'+(17+i)),'D32','D33','D34','D35','D36'];
const seed=JSON.parse(fs.readFileSync(new URL('../snapshot/fixture.json',import.meta.url),'utf8')).db[0];
const complete=()=>structuredClone(Object.fromEntries(['reg','goal','pre','expect','done'].map(key=>[key,seed[key]])));

async function setup(page,{answers={},role='participant',disableMobile=false}={}){
  const state={answers:structuredClone(answers),status:'draft',writes:[],reads:0,revision:0};
  const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
  if(disableMobile)await page.route('**/live/mobile-survey.js',route=>route.fulfill({contentType:'text/javascript',body:`export function createMobileSurvey(deps){return {reset(){},capture(){},prepare(){},mount(){},previous(){},next(){},goStep:deps.goStep,goQ:deps.goQ,nextFrom:deps.nextFrom}}`}));
  await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
    const request=route.request(),url=new URL(request.url()),body=request.postDataJSON();
    if(request.method()==='OPTIONS')return route.fulfill({status:204});
    let data;
    if(url.pathname.endsWith('/secondcareer-login')||url.pathname==='/auth/v1/token')data={access_token:'mock-access',refresh_token:'mock-refresh',expires_in:3600};
    else if(url.pathname.endsWith('/secondcareer-account'))data={profile:{role,display_name:'가상 사용자'},mustChangePassword:false,registrationAvailable:false};
    else if(url.pathname.endsWith('/secondcareer-admin-directory'))data={scope:'organization',generatedAt:'2026-10-26T03:00:00Z',organizationName:'가상 조직',totals:{participants:0,counselors:0,unassigned:0,unknownCounselor:0},counselors:[],companies:[],participants:[]};
    else if(url.pathname.endsWith('/secondcareer-admin-public-intake-links'))data={baseUrl:null,serverTime:new Date().toISOString(),intakeEnabled:false,links:[]};
    else if(url.pathname.endsWith('/secondcareer-admin-progress'))data={scope:'organization',generatedAt:'2026-10-26T03:00:00Z',total:0,pre:{notStarted:0,draft:0,submitted:0},post:{available:false},companies:[]};
    else if(url.pathname.endsWith('/secondcareer-admin-companies'))data={companies:[],total:0,page:1,pageSize:20,search:'',status:'all'};
    else if(url.pathname.endsWith('/secondcareer-assessment')){
      if(url.searchParams.has('id'))data={html:'<section class="sheet"><h2>모의 서버 보고서</h2><button class="noprint" onclick="window.print()">인쇄</button></section>'};
      else if(request.method()==='POST'){
        state.writes.push(structuredClone(body));state.answers=structuredClone(body.answers);state.revision++;
        state.status=body.action==='submit'?'submitted':'draft';data={status:state.status,updatedAt:'mock-revision-'+state.revision};
      }else{
        state.reads++;
        data={profile:{role},participants:[{id:'participant',display_name:'가상 응답자',counselor_user_id:'counselor'}],counselors:{counselor:{code:'counselor',n:'가상 상담사'}},assessments:[{id:'assessment',participant_id:'participant',phase:'pre',status:state.status,answers:state.answers,updated_at:'mock-revision-'+state.revision}]};
      }
    }else if(url.pathname==='/auth/v1/logout')return route.fulfill({status:204});
    else throw Error('Unexpected mock request: '+url.pathname);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(server.url);
  await page.locator('#lg-id').fill('client01');await page.locator('#lg-pw').fill('Fixture-password-123!');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  if(role==='participant')await expect(page.getByRole('heading',{name:'사전진단 접수 안내'})).toBeVisible();
  else await expect(page.getByRole('heading',{name:role==='admin'?'운영 대시보드':'상담사 페이지'})).toBeVisible();
  return {state,errors};
}
const question=page=>page.locator('.single-question .q:visible');
const next=page=>page.locator('.mobile-question-nav').getByRole('button',{name:/^(다음|응답 검토)$/});
const previous=page=>page.locator('.mobile-question-nav').getByRole('button',{name:'이전',exact:true});
async function at(page,code){await expect(question(page)).toHaveCount(1);await expect(question(page)).toHaveAttribute('id','q-'+code)}
async function jump(page,code){await page.evaluate(async code=>{const {QUESTION_DEFS}=await import('/js/00-question-defs-module.js');goQ(QUESTION_DEFS.find(q=>q.code===code).step,code)},code);await at(page,code)}
async function fill(page,code){
  const q=question(page);
  if(code==='A1')await q.getByRole('radio',{name:'동의',exact:true}).click();
  else if(code==='A2')return; // Assigned counselor is the existing read-only field.
  else if(['A4','A9','A10'].includes(code))await q.locator('.chip').first().click();
  else if(code.startsWith('C'))await q.locator('.scale button').nth(2).click();
  else if(await q.locator('.chip').count()){
    const count=({B13:2,D33:3,D35:2})[code]||1;
    for(let i=0;i<count;i++)await q.locator('.chip').nth(i).click();
  }else await q.locator('input').fill(({A3:'가상 응답자',A5:'19660101',PH:'01012345678',EM:'fixture@example.invalid',A6:'가상기업',A7:'가상직책',A8:'가상업무',B15:'70',B16:'6'})[code]);
}
async function noOverflow(page){
  expect(await page.locator('.mobile-survey').evaluate(root=>[...root.querySelectorAll('*')].filter(el=>{
    const r=el.getBoundingClientRect();return r.width&&r.height&&(r.left< -1||r.right>innerWidth+1||el.scrollWidth>el.clientWidth+2);
  }).map(el=>el.id||el.className))).toEqual([]);
}

test('existing participant on mobile sees the new intake guidance and has no pre save controls',async({page})=>{
  await page.setViewportSize({width:375,height:900});await setup(page);
  await expect(page.getByRole('heading',{name:'사전진단 접수 안내'})).toBeVisible();
  await expect(page.locator('.mobile-question-nav,#live-save,.mobile-survey')).toHaveCount(0);
});
test('counselor and admin receive no mobile navigation; pre/post and edit gates remain explicit',async({browser})=>{
  for(const role of ['counselor','admin']){
    const page=await browser.newPage({viewport:{width:375,height:900}});await setup(page,{role,answers:complete()});
    await expect(page.locator('.mobile-question-nav,[data-mobile-edit]')).toHaveCount(0);
    if(role==='admin'){await page.getByRole('button',{name:'관리 메뉴'}).click();await page.locator('a[href="#admin-assessment-url"]').click()}
    const input=page.locator(role==='admin'?'#assessment-url':'#cns-name');await input.fill('미저장 입력');
    await page.setViewportSize({width:1440,height:900});await page.setViewportSize({width:375,height:900});
    await expect(input).toHaveValue('미저장 입력');await page.close();
  }
});
