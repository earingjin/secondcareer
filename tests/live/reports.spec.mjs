import {test,expect} from '@playwright/test';
import {serve} from '../tools/serve-static.mjs';

// HTTP protocol mocks: these tests never contact or write to Supabase.
let server;
test.beforeAll(async()=>{server=await serve('src')});
test.afterAll(async()=>{await server.close()});

async function setup(page){
  const calls=[],state={reportStatus:200,malformed:false,failAfterEdit:false,name:'서버 응답자',revision:0};
  let answers={reg:{name:state.name,careers:[{co:'서버 기업'}]},goal:{},expect:{},done:{},pre:[]};
  const parts=[{id:'submitted',display_name:state.name,counselor_user_id:'counselor'},{id:'draft',display_name:'작성 중 내담자',counselor_user_id:'counselor'}];
  const reportHTML=kind=>`<div id="server-report" data-kind="${kind}" data-revision="${state.revision}"><div class="toolbar noprint">${kind==='c'?'<button onclick="startEdit(\'submitted\')">응답 수정 (상담사)</button>':''}<button onclick="window.print()">PDF로 저장(인쇄)</button></div>${Array.from({length:kind==='p'?3:5},(_,i)=>`<section class="sheet"><h2>서버 전용 응답 ${state.name} · ${kind} · ${i+1}</h2></section>`).join('')}</div>`;
  await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
  await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
    const r=route.request(),u=new URL(r.url()),body=r.postDataJSON();
    if(r.method()==='OPTIONS')return route.fulfill({status:204});
    calls.push({path:u.pathname,query:u.search,method:r.method(),body});
    let status=200,data;
    if(u.pathname.endsWith('/secondcareer-login'))data={access_token:'fixture-token',expires_at:Math.floor(Date.now()/1000)+600};
    else if(u.pathname.endsWith('/secondcareer-account'))data={profile:{role:'counselor',display_name:'검증 상담사'},mustChangePassword:false,registrationAvailable:false};
    else if(u.pathname.endsWith('/secondcareer-assessment')){
      if(u.searchParams.has('id')){
        status=state.reportStatus;
        data=status===200?{html:state.malformed?null:reportHTML(u.searchParams.get('kind'))}:{error:status===401?'AUTH_INVALID':'NOT_AVAILABLE'};
      }else if(r.method()==='POST'){
        expect(body.action).toBe('edit');expect(body.participantId).toBe('submitted');
        answers=body.answers;state.name=answers.reg.name;state.revision++;
        data={status:'submitted',updatedAt:'2026-10-29T04:00:00Z'};
        if(state.failAfterEdit)state.reportStatus=500;
      }else data={profile:{role:'counselor'},participants:parts,counselors:{counselor:{code:'counselor',n:'검증 상담사'}},assessments:[{id:'assessment',participant_id:'submitted',phase:'pre',status:'submitted',answers,updated_at:'2026-10-29T03:00:00Z'},{id:'draft-assessment',participant_id:'draft',phase:'pre',status:'draft',answers:{}}]};
    }else if(u.pathname==='/auth/v1/logout')return route.fulfill({status:204});
    else throw Error('Unexpected mock endpoint');
    return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(server.url);await page.locator('#lg-id').fill('consult01');await page.locator('#lg-pw').fill('fixture-password');
  await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.locator('#plist')).toBeVisible();
  return {state,calls,reportCalls:()=>calls.filter(c=>c.query.includes('id='))};
}

for(const [kind,pages,label] of [['p',3,'내담자용 3쪽'],['c',5,'결과 리포트 · 상담사용 5쪽']]){
  test(`${kind}: list opens server HTML and reuses window.print`,async({page})=>{
    const h=await setup(page);
    await page.evaluate(()=>localStorage.setItem('sp-demo-v5',JSON.stringify({db:[{nick:'사용하면 안 되는 샘플'}]})));
    await page.getByRole('button',{name:label,exact:true}).click();
    await expect(page.locator('#server-report')).toHaveAttribute('data-kind',kind);
    await expect(page.locator('.sheet')).toHaveCount(pages);
    expect(h.reportCalls().at(-1).query).toBe(`?id=submitted&kind=${kind}`);
    await expect(page.locator('#app')).not.toContainText('사용하면 안 되는 샘플');
    await expect(page.locator('.sheet').first()).toContainText('서버 전용 응답 서버 응답자');
    await page.evaluate(()=>{window.printCalls=0;window.print=()=>window.printCalls++});
    await page.getByRole('button',{name:'PDF로 저장(인쇄)',exact:true}).click();
    expect(await page.evaluate(()=>window.printCalls)).toBe(1);
  });
}

test('report switches request fresh HTML and the selector stays out of print',async({page})=>{
  const h=await setup(page);await page.getByRole('button',{name:'결과 리포트 · 상담사용 5쪽'}).click();
  h.state.name='다시 조회한 서버 응답자';
  await page.locator('#live-report-kind').getByRole('button',{name:'내담자용 3쪽',exact:true}).click();
  await expect(page.locator('.sheet')).toHaveCount(3);await expect(page.locator('#server-report')).toContainText(h.state.name);
  await page.locator('#live-report-kind').getByRole('button',{name:'상담사용 5쪽',exact:true}).click();
  await expect(page.locator('.sheet')).toHaveCount(5);
  expect(h.reportCalls().map(c=>c.query)).toEqual(['?id=submitted&kind=c','?id=submitted&kind=p','?id=submitted&kind=c']);
  await page.emulateMedia({media:'print'});await expect(page.locator('#live-report-kind')).toBeHidden();
});

test('draft and unknown assignments cannot request a report',async({page})=>{
  const h=await setup(page);
  await expect(page.locator('[data-participant="draft"] button')).toHaveCount(0);
  await page.evaluate(()=>openRes('draft','p'));await expect(page.getByRole('alert')).toContainText('최종 제출');
  await page.evaluate(()=>openRes('another-counselor-participant','c'));await expect(page.getByRole('alert')).toContainText('담당 내담자');
  expect(h.reportCalls()).toHaveLength(0);
});

for(const status of [403,500])test(`server HTTP ${status} displays an error without a sample report`,async({page})=>{
  const h=await setup(page);h.state.reportStatus=status;
  await page.getByRole('button',{name:'내담자용 3쪽',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText(status===403?'권한이 없거나 최종 제출':'보고서를 불러오지 못했습니다');
  await expect(page.locator('.sheet')).toHaveCount(0);
  h.state.reportStatus=200;await page.getByRole('button',{name:'내담자용 3쪽',exact:true}).click();
  await expect(page.locator('.sheet')).toHaveCount(3);
});

test('expired report session clears previous report and returns to login',async({page})=>{
  const h=await setup(page);await page.getByRole('button',{name:'결과 리포트 · 상담사용 5쪽'}).click();
  h.state.reportStatus=401;await page.locator('#live-report-kind').getByRole('button',{name:'내담자용 3쪽',exact:true}).click();
  await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('세션이 만료');await expect(page.locator('.sheet')).toHaveCount(0);
});

test('failed kind switch clears the previous printable report',async({page})=>{
  const h=await setup(page);await page.getByRole('button',{name:'결과 리포트 · 상담사용 5쪽'}).click();
  h.state.reportStatus=403;await page.locator('#live-report-kind').getByRole('button',{name:'내담자용 3쪽',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('권한이 없거나 최종 제출');
  await expect(page.locator('.sheet')).toHaveCount(0);await expect(page.getByRole('button',{name:'PDF로 저장(인쇄)'})).toHaveCount(0);
});

test('malformed successful response is not replaced with generated HTML',async({page})=>{
  const h=await setup(page);h.state.malformed=true;await page.getByRole('button',{name:'내담자용 3쪽',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('보고서를 확인하지 못했습니다');await expect(page.locator('.sheet')).toHaveCount(0);
});

async function validEdit(page){
  await page.evaluate(async()=>{
    const {S}=await import('/shared/state.js'),{OPT}=await import('/js/03-options.js'),{ITEM_COUNT}=await import('/js/02-eval-config.js');
    Object.assign(S.user,{reg:{a1:'동의',consent:true,name:'서버 응답자',gender:'남',birthDate:'1966-01-01',birth:'1966',phone:'010-0000-0000',email:'fixture@example.invalid',careers:[{co:'가상기업',title:'가상직책',task:'가상업무'}],industry:OPT['reg.industry'][0],income:OPT['reg.income'][0]},goal:{b11:OPT['goal.b11'].slice(0,1),b12:OPT['goal.b12'].slice(0,1),b13:OPT['goal.b13'].slice(0,2),b14:OPT['goal.b14'].slice(0,1),b15:'70',b16:'6'},pre:Array(ITEM_COUNT).fill(3),expect:{d32:OPT['expect.d32'].slice(0,1),d33:OPT['expect.d33'].slice(0,3),d34:OPT['expect.d34'].slice(0,1),d35:OPT['expect.d35'].slice(0,2),d36:OPT['expect.d36'].slice(0,1)},done:{reg:true,goal:true,expect:true}});goStep(1);
  });
  await page.locator('#q-A3 input').fill('상담사가 수정한 이름');
}

test('report switching cannot discard an edit; cancel restores the prior report',async({page})=>{
  const h=await setup(page);await page.getByRole('button',{name:'결과 리포트 · 상담사용 5쪽'}).click();
  await page.getByRole('button',{name:'응답 수정 (상담사)'}).click();await validEdit(page);
  const before=h.reportCalls().length;
  await page.evaluate(()=>openRes('submitted','p'));
  await expect(page.getByRole('alert')).toContainText('수정 저장 또는 취소');
  await expect(page.locator('#q-A3 input')).toHaveValue('상담사가 수정한 이름');expect(h.reportCalls()).toHaveLength(before);
  await page.evaluate(()=>goStep(5));await page.getByRole('button',{name:'수정 취소'}).click();
  await expect(page.locator('.sheet')).toHaveCount(5);await expect(page.locator('#server-report')).toContainText('서버 응답자');
  expect(h.calls.filter(c=>c.method==='POST'&&c.path.endsWith('assessment'))).toHaveLength(0);
});

for(const failAfterEdit of [false,true])test(`edit uses server persistence and reloads selected report; reload failure=${failAfterEdit}`,async({page})=>{
  const h=await setup(page);h.state.failAfterEdit=failAfterEdit;
  await page.getByRole('button',{name:'결과 리포트 · 상담사용 5쪽'}).click();
  await page.getByRole('button',{name:'응답 수정 (상담사)'}).click();await validEdit(page);await page.evaluate(()=>goStep(5));
  await page.getByRole('button',{name:'수정 저장·재계산'}).click();
  if(failAfterEdit){
    await expect(page.getByRole('alert')).toContainText('보고서를 불러오지 못했습니다');await expect(page.locator('.sheet')).toHaveCount(0);
    h.state.reportStatus=200;await page.locator('#live-report-kind').getByRole('button',{name:'상담사용 5쪽',exact:true}).click();
  }
  await expect(page.locator('#server-report')).toHaveAttribute('data-revision','1');
  await expect(page.locator('#server-report')).toContainText('상담사가 수정한 이름');
  expect(h.reportCalls().at(-1).query).toBe('?id=submitted&kind=c');
  const writes=h.calls.filter(c=>c.method==='POST'&&c.path.endsWith('assessment'));
  expect(writes).toHaveLength(1);expect(writes[0].body).toMatchObject({action:'edit',expectedUpdatedAt:'2026-10-29T03:00:00Z'});
  expect(writes[0].body).not.toHaveProperty('result');
});
