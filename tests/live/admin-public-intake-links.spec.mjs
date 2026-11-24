import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {serve} from '../tools/serve-static.mjs';
import {publicIntakeStatus,validPublicIntakeLinks} from '../../src/live/admin-public-intake-links.js';

const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
const apiPath='/functions/v1/secondcareer-admin-public-intake-links';
const baseUrl='https://secondcareer-fixture.vercel.app/intake';
const otherUrl='https://other.example.invalid/intake';
const updatedUrl='https://updated.example.invalid/assessment';
const fixtureLink=(overrides={})=>({
  id:randomUUID(),organization_id:ids.org,enabled:true,
  expires_at:new Date(Date.now()+3600_000).toISOString(),
  created_at:'2026-01-01T03:00:00Z',...overrides
});
function fixture(...links){
  const h=harness();
  h.state.tables.organizations[0].assessment_url=baseUrl;
  h.state.tables.public_intake_links.push(...links);
  h.state.publicIntakeEnabled=true;
  h.state.publicIntakeAllowedOrigins=[baseUrl,otherUrl,updatedUrl].map(url=>new URL(url).origin).join(', ');
  return h;
}
const read=(h,token=ids.admin,query='',method='GET')=>h.call(
  h.publicIntakeLinks.handleAdminPublicIntakeLinks,token,undefined,method,'https://fixture.invalid'+apiPath+query);

test('admin endpoint reads scoped columns only, pages all rows and does not write',async()=>{
  const own=[fixtureLink({token_hash:'mock-private-hash'}),fixtureLink()];
  const foreign=fixtureLink({organization_id:'other-org'});
  const h=fixture(...own,foreign);
  h.state.tables.organizations.push({id:'other-org',assessment_url:'https://other.example.invalid'});
  h.state.tables.user_profiles.find(profile=>profile.user_id===ids.other).role='admin';
  h.state.pageSize=1;
  const before=structuredClone(h.state.tables);
  h.db.rpc=()=>{throw Error('Unexpected RPC')};
  const response=await read(h);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(validPublicIntakeLinks(response.data)).toBe(true);
  expect(response.data).toEqual({baseUrl,intakeEnabled:true,serverTime:expect.any(String),links:own
    .map(row=>({id:row.id,enabled:row.enabled,expiresAt:row.expires_at,createdAt:row.created_at.replace('Z','.000Z')}))
    .sort((a,b)=>a.id.localeCompare(b.id))});
  expect((await read(h,ids.other)).data.links.map(row=>row.id)).toEqual([foreign.id]);
  expect(h.state.reads.filter(read=>read.table==='public_intake_links').slice(0,3).every(read=>
    read.columns==='id,enabled,expires_at,created_at'&&read.filters.some(([key,value])=>key==='organization_id'&&value===ids.org))).toBe(true);
  expect(h.state.reads.filter(read=>read.table==='organizations').map(read=>read.columns)).toEqual(['assessment_url','assessment_url']);
  expect(new Set(h.state.reads.map(read=>read.table))).toEqual(new Set(['user_profiles','organizations','public_intake_links']));
  expect(h.state.tables).toEqual(before);
  expect(h.state.writes).toEqual([]);
});

test('protects access, query and method boundaries with safe no-store responses',async()=>{
  const h=fixture(fixtureLink());
  h.state.tables.user_profiles.find(profile=>profile.user_id===ids.other).role='company_manager';
  for(const [token,status] of [[null,401],['invalid-session',401],[ids.counselor,403],[ids.participant,403],[ids.other,403]]){
    expect((await read(h,token)).status).toBe(status);
  }
  h.state.users[ids.admin].app_metadata.must_change_password=true;
  expect((await read(h)).data).toEqual({error:'PASSWORD_CHANGE_REQUIRED'});
  h.state.users[ids.admin].app_metadata.must_change_password=false;
  for(const query of ['?organization_id=other-org','?linkId=x&linkId=y','?unknown=1']){
    expect((await read(h,ids.admin,query)).data).toEqual({error:'INVALID_REQUEST'});
  }
  const post=await read(h,ids.admin,'','POST');
  expect(post.status).toBe(405);
  expect(post.headers.get('allow')).toBe('GET, OPTIONS');
  const options=await h.publicIntakeLinks.handleAdminPublicIntakeLinks(new Request('https://fixture.invalid'+apiPath,{method:'OPTIONS'}));
  expect(options.status).toBe(204);
  expect(options.headers.get('access-control-allow-methods')).toBe('GET, OPTIONS');
  expect(options.headers.get('cache-control')).toBe('no-store');
  expect(h.state.reads.every(read=>read.table==='user_profiles')).toBe(true);
});

test('accepts an explicitly listed Vercel origin and rejects other deployments and malformed configuration',async()=>{
  const h=fixture(fixtureLink());
  const organization=h.state.tables.organizations[0];
  const origin=new URL(baseUrl).origin;
  h.state.publicIntakeAllowedOrigins=` ${origin}/ `;
  const valid=await read(h);
  expect(valid.data.baseUrl).toBe(baseUrl);
  expect(validPublicIntakeLinks(valid.data)).toBe(true);
  for(const address of [
    'https://unauthorized-fixture.vercel.app/',
    'https://secondcareer-fixture-git-branch-team.vercel.app/',
    'https://secondcareer-fixture.vercel.app.example.invalid/',
    origin+':444/intake',
    'https://unapproved.example.invalid/'
  ]){
    organization.assessment_url=address;
    const {data}=await read(h);
    expect(data.baseUrl).toBeNull();
    expect(publicIntakeStatus(data,data.links[0],Date.parse(data.serverTime))).toBe('invalid');
  }
  organization.assessment_url=baseUrl;
  for(const setting of [undefined,'','https://*.vercel.app',origin+'/intake']){
    h.state.publicIntakeAllowedOrigins=setting;
    expect((await read(h)).data.baseUrl).toBeNull();
  }
  organization.assessment_url='https://demo.localhost/';
  h.state.publicIntakeAllowedOrigins='https://demo.localhost';
  expect((await read(h)).data.baseUrl).toBeNull();
});

test('distinguishes link data states and fails closed for database and malformed rows',async()=>{
  const expired=fixtureLink({expires_at:'2000-01-01T00:00:00Z'});
  const h=fixture(fixtureLink(),fixtureLink({enabled:false}),expired);
  const statuses=async()=>{
    const {data}=await read(h);
    return data.links.map(link=>publicIntakeStatus(data,link,Date.parse(data.serverTime))).sort();
  };
  expect(await statuses()).toEqual(['active','disabled','expired']);
  h.state.publicIntakeEnabled=false;
  expect(await statuses()).toEqual(['disabled','expired','stopped']);
  h.state.publicIntakeEnabled=true;
  for(const value of [null,baseUrl.replace('https:','http:'),'https://localhost',baseUrl+'?secret=fixture',baseUrl+'#fragment']){
    h.state.tables.organizations[0].assessment_url=value;
    const {data}=await read(h);
    expect(data.baseUrl).toBeNull();
    expect(data.links.map(link=>publicIntakeStatus(data,link,Date.parse(data.serverTime)))).toContain('invalid');
    expect(JSON.stringify(data)).not.toContain('secret=fixture');
  }
  h.state.tables.public_intake_links=[];
  expect((await read(h)).data.links).toEqual([]);
  for(const table of ['organizations','public_intake_links']){
    h.state.failReadsOf=table;
    const response=await read(h);
    expect(response.status).toBe(503);
    expect(response.data).toEqual({error:'QUERY_FAILED'});
  }
  h.state.failReadsOf=null;
  h.state.tables.public_intake_links=[fixtureLink({expires_at:'invalid'})];
  expect((await read(h)).data).toEqual({error:'QUERY_FAILED'});
});

test.describe('admin link screens',()=>{
  let server;
  test.beforeAll(async()=>{server=await serve('src')});
  test.afterAll(async()=>{await server.close()});
  const dashboard=page=>page.locator('[data-intake-dashboard]');
  const settings=page=>page.locator('[data-intake-settings]');
  const manage=page=>dashboard(page).getByRole('button',{name:'진단 링크 관리'}).click();
  const login=async(page,id='admin01')=>{
    await page.locator('#lg-id').fill(id);
    await page.locator('#lg-pw').fill('Fixture-password-123!');
    await page.getByRole('button',{name:'로그인',exact:true}).click();
  };
  async function open(page,h,options={}){
    const calls=[];
    await page.route('**/main.js',route=>route.fulfill({contentType:'text/javascript',body:"import './live/app.js';"}));
    await page.route('**/functions/v1/**',async route=>{
      const request=route.request(),url=new URL(request.url()),body=request.postDataJSON();
      const token=request.headers().authorization?.replace(/^Bearer /,'');
      const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
      calls.push(url.pathname);
      const common=[
        ['/secondcareer-account',h.account.handleAccount],
        ['/secondcareer-admin-progress',h.progress.handleAdminProgress],
        ['/secondcareer-admin-directory',h.directory.handleAdminDirectory],
        ['/secondcareer-admin-companies',h.companies.handleAdminCompanies],
        ['/secondcareer-assessment',h.assessment]
      ];
      let result;
      if(url.pathname.endsWith('/secondcareer-login')){
        const user=h.signIn(body.loginId,body.password);
        result=user?{status:200,data:{access_token:user.id,refresh_token:'refresh-'+user.id,expires_in:3600}}:{status:401,data:{error:'FIXTURE'}};
      }else if(url.pathname===apiPath){
        result=await read(h,token);
        if(options.override)result=await options.override(result);
      }else{
        const handler=common.find(([suffix])=>url.pathname.endsWith(suffix))?.[1];
        result=handler?await h.call(handler,token,body,request.method(),url.href):{status:404,data:{error:'FIXTURE_NOT_FOUND'}};
      }
      await route.fulfill({status:result.status,headers,json:result.data});
    });
    await page.route('**/auth/v1/logout',route=>route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*'}}));
    await page.goto(server.url);
    return calls;
  }

  test('one active link is copyable, manual selection works and new tab is isolated',async({page,context})=>{
    const row=fixtureLink(),h=fixture(row);
    const expected=`${baseUrl}?entry=pre&linkId=${row.id}`;
    await page.addInitScript(()=>{
      Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{
        if(window.rejectClipboard)throw Error('fixture');
        window.copiedLink=value;
      }}});
    });
    const calls=await open(page,h);await login(page);
    await expect(dashboard(page).getByLabel('공용 설문 URL')).toHaveValue(expected);
    await dashboard(page).getByRole('button',{name:'복사',exact:true}).click();
    await expect(dashboard(page).getByRole('status')).toHaveText('공용 사전진단 링크를 복사했습니다.');
    expect(await page.evaluate(()=>window.copiedLink)).toBe(expected);
    await manage(page);
    await expect(settings(page)).toContainText('실제 임시 접수 기록이 생성될 수 있습니다.');
    await expect(settings(page)).toContainText('조회 시각 (한국시간)');
    await page.evaluate(()=>window.rejectClipboard=true);
    await settings(page).getByRole('button',{name:'복사',exact:true}).click();
    await expect(settings(page).getByRole('status')).toContainText('직접 복사');
    const input=settings(page).getByLabel('공용 설문 URL');
    await expect(input).toBeFocused();
    expect(await input.evaluate(el=>el.selectionEnd-el.selectionStart)).toBe(expected.length);
    const link=settings(page).getByRole('link',{name:'설문 새 탭에서 열기'});
    await expect(link).toHaveAttribute('href',expected);
    await expect(link).toHaveAttribute('rel','noopener noreferrer');
    await context.route(expected,route=>route.fulfill({body:'synthetic survey'}));
    const [tab]=await Promise.all([context.waitForEvent('page'),link.click()]);
    await tab.waitForLoadState();
    expect(await tab.evaluate(()=>window.opener)).toBeNull();
    expect(await tab.evaluate(()=>sessionStorage.getItem('sp-live-refresh-token'))).toBeNull();
    await tab.close();
    await expect(settings(page)).toBeVisible();
    expect(calls.filter(path=>path===apiPath)).toHaveLength(1);
    expect(calls.filter(path=>path.endsWith('secondcareer-admin-directory'))).toHaveLength(1);
    expect(calls).not.toContain('/functions/v1/secondcareer-public-assessment');
    for(const width of [1280,1440,1920,375]){
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(input).toBeVisible();
    }
  });

  test('multiple links are individual, expire without another read and refresh after address save',async({page})=>{
    await page.clock.install();
    const expiredSoon=fixtureLink({expires_at:new Date(Date.now()+30_000).toISOString()});
    const stable=fixtureLink(),disabled=fixtureLink({enabled:false});
    const h=fixture(expiredSoon,stable,disabled),options={},calls=await open(page,h,options);
    await login(page);
    await expect(dashboard(page)).toContainText('접수 가능한 링크가 2개');
    await expect(dashboard(page).locator('[data-intake-copy]')).toHaveCount(0);
    await manage(page);
    await expect(settings(page).locator('[data-intake-open]')).toHaveCount(2);
    const disabledRow=settings(page).locator(`[data-intake-link="${disabled.id}"]`);
    await expect(disabledRow).toContainText('비활성');
    await expect(disabledRow.locator('[data-intake-copy],[data-intake-open]')).toHaveCount(0);
    await page.clock.fastForward(40_000);
    const expiredRow=settings(page).locator(`[data-intake-link="${expiredSoon.id}"]`);
    await expect(expiredRow).toContainText('만료');
    await expect(expiredRow.locator('[data-intake-copy],[data-intake-open]')).toHaveCount(0);
    expect(calls.filter(path=>path===apiPath)).toHaveLength(1);
    options.override=result=>({...result,data:{
      ...result.data,serverTime:new Date(Date.parse(result.data.serverTime)+40_000).toISOString()
    }});
    const next=updatedUrl;
    await page.locator('#assessment-url').fill(next);
    await page.getByRole('button',{name:'주소 저장'}).click();
    await expect(settings(page).getByLabel('공용 설문 URL')).toHaveValue(`${next}?entry=pre&linkId=${stable.id}`);
    await expect(expiredRow).toContainText('만료');
    expect(calls.filter(path=>path===apiPath)).toHaveLength(2);
    expect(calls.filter(path=>path.endsWith('secondcareer-admin-directory'))).toHaveLength(1);
  });

  test('unavailable, forbidden and malformed reads are isolated from existing admin work and can retry',async({page})=>{
    const h=fixture(fixtureLink());
    const options={override:()=>({status:404,data:{error:'FIXTURE_NOT_DEPLOYED'}})};
    await open(page,h,options);await login(page);
    await expect(dashboard(page)).toContainText('공용 사전진단 링크를 불러오지 못했습니다.');
    await expect(page.locator('[data-admin-dashboard-kpi="participants"]')).toBeVisible();
    await page.getByRole('link',{name:'내담자 관리',exact:true}).click();
    await expect(page.locator('#admin-directory [data-dir-participant]')).toHaveCount(1);
    await page.getByRole('link',{name:'진단 링크 관리',exact:true}).click();
    const retry=settings(page).getByRole('button',{name:'다시 조회'});
    options.override=null;await retry.click();
    await expect(settings(page).getByLabel('공용 설문 URL')).toBeVisible();
    options.override=result=>({...result,data:{...result.data,baseUrl:'javascript:alert(1)'}});
    await retry.click();
    await expect(settings(page)).toContainText('불러오지 못했습니다.');
    await expect(settings(page).locator('[data-intake-url]')).toHaveCount(0);
    options.override=()=>({status:403,data:{error:'FORBIDDEN'}});
    await retry.click();
    await expect(settings(page)).toContainText('조회할 권한이 없습니다.');
    await expect(page.locator('#assessment-url')).toBeEnabled();
    options.override=null;h.state.publicIntakeEnabled=false;await retry.click();
    await expect(settings(page)).toContainText('접수가 중지되어 있습니다.');
    await expect(settings(page).locator('[data-intake-copy],[data-intake-open]')).toHaveCount(0);
    h.state.publicIntakeEnabled=true;
    h.state.tables.organizations[0].assessment_url='https://secondcareer-fixture-git-branch-team.vercel.app/';
    await retry.click();
    await expect(settings(page).locator('[data-intake-link]')).toContainText('기준 주소 오류');
    await expect(settings(page).locator('[data-intake-copy],[data-intake-open]')).toHaveCount(0);
    h.state.tables.public_intake_links=[];await retry.click();
    await expect(settings(page)).toContainText('등록된 공용 링크가 없습니다.');
  });

  test('a delayed old-organization response cannot replace a new session and other roles never request links',async({page})=>{
    const row=fixtureLink(),other=fixtureLink({organization_id:'other-org'}),h=fixture(row,other);
    h.state.tables.organizations.push({id:'other-org',name:'다른 합성 조직',assessment_url:otherUrl});
    h.state.tables.user_profiles.find(profile=>profile.user_id===ids.other).role='admin';
    let release,enter;
    const held=new Promise(resolve=>{release=resolve});
    const started=new Promise(resolve=>{enter=resolve});
    const options={override:async result=>{
      if(result.data.links?.some(link=>link.id===row.id)){enter();await held}
      return result;
    }};
    const calls=await open(page,h,options);await login(page);await started;
    await expect(dashboard(page)).toContainText('공용 링크를 조회하고 있습니다.');
    await page.getByRole('button',{name:'로그아웃',exact:true}).click();
    await expect(page.locator('#lg-id')).toBeVisible();
    await login(page,'other01');
    const newUrl=`${otherUrl}?entry=pre&linkId=${other.id}`;
    await expect(dashboard(page).getByLabel('공용 설문 URL')).toHaveValue(newUrl);
    const delayed=page.waitForResponse(response=>response.url().endsWith(apiPath)&&response.request().headers().authorization==='Bearer '+ids.admin);
    release();await delayed;
    await expect(dashboard(page).getByLabel('공용 설문 URL')).toHaveValue(newUrl);
    await expect(page.locator('#app')).not.toContainText(row.id);
    await page.getByRole('button',{name:'로그아웃',exact:true}).click();
    await expect(page.locator('#lg-id')).toBeVisible();
    await login(page,'consult01');
    await expect(page.getByRole('heading',{name:'상담사 페이지'})).toBeVisible();
    await expect(page.locator('[data-intake-dashboard],[data-intake-settings]')).toHaveCount(0);
    expect(calls.filter(path=>path===apiPath)).toHaveLength(2);
  });
});
