import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve-static.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
let server;
test.beforeAll(async()=>{server=await serve(process.env.REGISTRATION_TEST_ROOT||'src')});
test.afterAll(async()=>{await server.close()});

async function setup(page,{pending=false,enabled=true}={}){
  const h=harness();let assessmentReads=0,drafts=0,submissions=0;
  const assessments=new Map();h.state.enabled=enabled;
  h.state.users[ids.participant].app_metadata={must_change_password:pending};
  await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
  await page.route('https://tafrbtqjlrokdnhudswb.supabase.co/**',async route=>{
    const request=route.request(),url=new URL(request.url()),body=request.postDataJSON(),token=request.headers().authorization?.replace(/^Bearer /,'');
    let result;
    if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});return}
    if(url.pathname.endsWith('/secondcareer-login')){
      // Model the existing lookup -> Auth email/password -> matching user_id
      // contract; do not accept an arbitrary password for a known login ID.
      const id=h.signIn(body.loginId,body.password)?.id;
      result=id?{status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_at:Math.floor(Date.now()/1000)+3600}}:{status:401,data:{error:'INVALID_CREDENTIALS'}};
    }else if(url.pathname==='/auth/v1/token'){
      const id=body?.refresh_token?.replace(/^refresh-/,'');
      result=id&&h.state.users[id]?{status:200,data:{access_token:id,refresh_token:'refresh-'+id,expires_in:3600}}:{status:400,data:{error:'INVALID_REFRESH_TOKEN'}};
    }else if(url.pathname.endsWith('/secondcareer-account'))result=await h.call(h.account.handleAccount,token,body,request.method());
    else if(url.pathname.endsWith('/secondcareer-register-participant'))result=await h.call(h.registration.handleRegistration,token,body,request.method());
    else if(url.pathname.endsWith('/secondcareer-admin-public-intake-links'))result=await h.call(h.publicIntakeLinks.handleAdminPublicIntakeLinks,token);
    else if(url.pathname.endsWith('/secondcareer-admin-progress'))result=await h.call(h.progress.handleAdminProgress,token,body,request.method());
    else if(url.pathname.endsWith('/secondcareer-admin-directory'))result=await h.call(h.directory.handleAdminDirectory,token,body,request.method());
    else if(url.pathname.endsWith('/secondcareer-admin-companies'))result=await h.call(h.companies.handleAdminCompanies,token,body,request.method(),'https://fixture.invalid/'+url.search);
    else if(url.pathname.endsWith('/secondcareer-assessment')){
      // Model the mandatory guard contract; original handler is not local.
      const profile=h.state.tables.user_profiles.find(p=>p.user_id===token);
      const parts=profile?h.state.tables.participants.filter(p=>p.organization_id===profile.organization_id&&(profile.role==='participant'?p.auth_user_id===token:p.counselor_user_id===token)):[];
      const accessError=h.access.participantAccessError(h.state.users[token]||{});
      if(accessError)result={status:403,data:{error:accessError}};
      else if(request.method()==='POST'){
        // Protocol/ownership mock only. No production validation, write RPC,
        // history or server result calculation is implemented here.
        const part=profile.role==='participant'?parts[0]:parts.find(p=>p.id===body.participantId);
        if(!part)result={status:403,data:{error:'FORBIDDEN'}};
        else{
          const status=body.action==='draft'?'draft':'submitted',updatedAt=new Date().toISOString();
          if(status==='draft')drafts++;else submissions++;
          assessments.set(part.id,{id:'mock-assessment-'+part.id,participant_id:part.id,phase:'pre',status,answers:body.answers,updated_at:updatedAt,submitted_at:status==='submitted'?updatedAt:null});
          result={status:200,data:{status,updatedAt}};
        }
      }
      else{
        assessmentReads++;
        result={status:200,data:{profile,participants:parts.map(p=>profile.role==='counselor'?{...p,login_id:h.state.tables.server_login_lookup.find(m=>m.user_id===p.auth_user_id)?.login_id||null}:p),assessments:parts.map(p=>assessments.get(p.id)).filter(Boolean),counselors:{[ids.counselor]:{code:ids.counselor,n:'상담사',tel:'',mail:''}}}};
      }
    }else if(url.pathname==='/auth/v1/logout'){await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*'}});return}
    else throw Error('Unexpected API path: '+url.pathname);
    await route.fulfill({status:result.status,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(result.data)});
  });
  await page.goto(server.url);
  return {h,assessments,reads:()=>assessmentReads,drafts:()=>drafts,submissions:()=>submissions};
}
async function login(page,id,password='Fixture-password-123!'){await page.locator('#lg-id').fill(id);await page.locator('#lg-pw').fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click()}
for(const [id,heading] of [['admin01','운영 대시보드'],['consult01','상담사 페이지']]){
  test(`${id} restores its role after refresh and logout clears the session`,async({page})=>{
    await setup(page);await login(page,id);
    await expect(page.getByRole('heading',{name:heading})).toBeVisible();
    await page.reload();await expect(page.getByRole('heading',{name:heading})).toBeVisible();
    await page.getByRole('button',{name:'로그아웃',exact:true}).click();await page.reload();
    await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
    expect(await page.evaluate(()=>sessionStorage.getItem('sp-live-refresh-token'))).toBeNull();
  });
}
test('participant restores diagnosis and pending password change stays gated',async({page})=>{
  await setup(page);await login(page,'client01');await expect(page.getByRole('heading',{name:'사전진단 접수 안내'})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'사전진단 접수 안내'})).toBeVisible();
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  const mock=await setup(page,{pending:true});await login(page,'client01');
  await expect(page.getByRole('heading',{name:'최초 비밀번호 변경'})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'최초 비밀번호 변경'})).toBeVisible();
  expect(mock.reads()).toBe(0);
});
test('invalid stored session is cleared on restore',async({page})=>{
  await setup(page);await page.evaluate(()=>sessionStorage.setItem('sp-live-refresh-token','invalid'));
  await page.reload();await expect(page.getByRole('heading',{name:'세컨플래닝 로그인'})).toBeVisible();
  expect(await page.evaluate(()=>sessionStorage.getItem('sp-live-refresh-token'))).toBeNull();
});
test('session refreshes before expiry without losing the role',async({page})=>{
  await setup(page);await page.clock.install();await login(page,'consult01');
  await expect(page.getByRole('heading',{name:'상담사 페이지'})).toBeVisible();
  let refreshes=0;page.on('request',request=>{if(request.url().includes('/auth/v1/token?grant_type=refresh_token'))refreshes++});
  await page.clock.fastForward(59*60*1000+1000);
  await expect.poll(()=>refreshes).toBe(1);
  await expect(page.getByRole('heading',{name:'상담사 페이지'})).toBeVisible();
});
