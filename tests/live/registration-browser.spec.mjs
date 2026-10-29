import {test,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {deflateRawSync,crc32} from 'node:zlib';
import {serve} from '../tools/serve-static.mjs';
const {harness,ids}=createRequire(import.meta.url)('./server-harness.cjs');
let server;
test.beforeAll(async()=>{server=await serve('src')});
test.afterAll(async()=>{await server.close()});

// Real ZIP compression, shared strings, inline strings and sparse cell refs.
function xlsx({formula=false,scientific=false}={}){
  const entries={
    '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="참여자" sheetId="1" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Target="worksheets/participants.xml"/></Relationships>',
    'xl/sharedStrings.xml':'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>엑셀참여자</t></si></sst>',
    'xl/worksheets/participants.xml':`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>이름</t></is></c><c r="B1" t="inlineStr"><is><t>연락처</t></is></c></row><row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2">${formula?'<f>12345678+1</f>':''}<v>${scientific?'1.012345678E9':'1012345678'}</v></c><c r="D2" t="inlineStr"><is><t>엑셀기업</t></is></c></row></sheetData></worksheet>`
  };
  const locals=[],centrals=[];let offset=0;
  for(const [name,text] of Object.entries(entries)){
    const n=Buffer.from(name),data=Buffer.from(text),compressed=deflateRawSync(data),crc=crc32(data);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);
    locals.push(local,n,compressed);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(n.length,28);central.writeUInt32LE(offset,42);centrals.push(central,n);
    offset+=local.length+n.length+compressed.length;
  }
  const central=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,central,end]);
}

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
      result=id?{status:200,data:{access_token:id,expires_at:Math.floor(Date.now()/1000)+3600}}:{status:401,data:{error:'INVALID_CREDENTIALS'}};
    }else if(url.pathname.endsWith('/secondcareer-account'))result=await h.call(h.account.handleAccount,token,body,request.method());
    else if(url.pathname.endsWith('/secondcareer-register-participant'))result=await h.call(h.registration.handleRegistration,token,body,request.method());
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
        result={status:200,data:{profile,participants:parts,assessments:parts.map(p=>assessments.get(p.id)).filter(Boolean),counselors:{[ids.counselor]:{code:ids.counselor,n:'상담사',tel:'',mail:''}}}};
      }
    }else if(url.pathname==='/auth/v1/logout'){await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*'}});return}
    else throw Error('Unexpected API path: '+url.pathname);
    await route.fulfill({status:result.status,headers:{'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'no-store'},body:JSON.stringify(result.data)});
  });
  await page.goto(server.url);
  return {h,assessments,reads:()=>assessmentReads,drafts:()=>drafts,submissions:()=>submissions};
}
async function login(page,id,password='Fixture-password-123!'){await page.locator('#lg-id').fill(id);await page.locator('#lg-pw').fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click()}

test('CSV quoting, Excel paste, duplicate IDs and admin counselor resolution',async({page})=>{
  await page.goto(server.url+'/live/fields.js');
  const result=await page.evaluate(async()=>{
    const {parseRegistrationText:parse,registrationRows:rows}=await import('/live/registration-input.js');
    const context={profile:{role:'counselor',user_id:'self'},counselors:[{id:'self',name:'상담사'}],organizationName:'기본기업'};
    const csv=parse('\uFEFF이름,연락처,담당 상담사,소속기업\r\n"가상,참여자",010-1234-5678,다른상담사,"가상,기업"');
    const pasted=rows(parse('\n이름\t연락처\t담당 상담사\t소속기업\n가상\t010-1234-5678\t다른상담사\t기업'),context);
    const duplicate=rows(parse('가상,01012345678\n중복,01112345678'),context);
    const admin=rows(parse('가상,01012345678,상담사,기업'),{...context,profile:{role:'admin'}});
    let invalid='';try{parse('"닫히지않음')}catch(e){invalid=e.message}
    return {csv,pasted,duplicate,admin,invalid};
  });
  expect(result.csv[1]).toEqual(['가상,참여자','010-1234-5678','다른상담사','가상,기업']);
  expect(result.pasted[0]).toMatchObject({loginId:'12345678',counselorUserId:'self',error:''});
  expect(result.duplicate[1].error).toContain('같은 로그인');expect(result.admin[0].counselorUserId).toBe('self');expect(result.invalid).toBeTruthy();
});

test('separate CSV and compressed XLSX uploads, formula rejection, safe server credential delivery and erasure',async({page})=>{
  const {h}=await setup(page);await login(page,'consult01');
  await page.locator('[data-file="xlsx"]').setInputFiles({name:'participants.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:xlsx({scientific:true})});
  await expect(page.locator('#registration-bulk')).toContainText('엑셀참여자');
  await expect(page.getByRole('cell',{name:'12345678',exact:true})).toBeVisible();
  await page.locator('[data-file="xlsx"]').setInputFiles({name:'formula.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:xlsx({formula:true})});
  await expect(page.getByRole('status').filter({hasText:'수식은 값으로'})).toBeVisible();
  await page.locator('[data-file="csv"]').setInputFiles({name:'participants.csv',mimeType:'text/csv',buffer:Buffer.from('이름,연락처,담당 상담사,소속기업\n가상참여자,010-1234-5678,무시됨,테스트기업')});
  await page.getByRole('button',{name:'실제 계정 일괄 등록'}).click();
  await expect(page.getByRole('cell',{name:'등록 완료',exact:true})).toBeVisible();
  expect(h.state.tables.participants.at(-1).counselor_user_id).toBe(ids.counselor);
  const secret=page.getByLabel('가상참여자 임시 비밀번호');await expect(secret).toHaveAttribute('type','password');
  await page.getByRole('button',{name:'발급 비밀번호 확인'}).click();await expect(secret).toHaveAttribute('type','text');
  const password=await secret.inputValue();expect(password.length).toBeGreaterThanOrEqual(12);
  expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
  await page.getByRole('button',{name:'발급 비밀번호 지우기'}).click();await expect(secret).toHaveCount(0);
  expect(await page.content()).not.toContain(password);
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await login(page,'12345678',password);
  await expect(page.getByRole('heading',{name:'최초 비밀번호 변경'})).toBeVisible();
  await page.locator('#new-password').fill('Participant-new-123!');await page.locator('#confirm-password').fill('Participant-new-123!');
  await page.getByRole('button',{name:'변경하고 진단 시작'}).click();await expect(page.locator('#live-save')).toBeVisible();
  expect(h.state.users[h.state.created[0].id].app_metadata.must_change_password).toBe(false);
  await page.evaluate(()=>goStep(1));
  await expect(page.locator('#q-PH input')).toHaveValue('010-1234-5678');
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await login(page,'12345678',password);
  await expect(page.getByRole('alert')).toContainText('아이디 또는 비밀번호');
  await login(page,'12345678','Participant-new-123!');await expect(page.locator('#live-save')).toBeVisible();
});

test('temporary participant cannot open diagnosis before password change; changing resumes survey and draft save',async({page})=>{
  const mock=await setup(page,{pending:true});await login(page,'client01');
  await expect(page.getByRole('heading',{name:'최초 비밀번호 변경'})).toBeVisible();expect(mock.reads()).toBe(0);
  await page.evaluate(()=>{nav('wizard');submitPre()});expect(mock.reads()).toBe(0);
  const blocked=await page.evaluate(async()=>{
    const {createAPI}=await import('/live/api.js'),api=createAPI(()=>{}),messages=[];
    try{
      await api.login('client01','Fixture-password-123!');
      for(const call of [()=>api.write('draft',{answers:{}}),()=>api.report('existing-participant')]){
        try{await call();messages.push('unexpected success')}catch(error){messages.push(error.message)}
      }
    }finally{api.clear()}
    return messages;
  });
  expect(blocked).toEqual(['먼저 임시 비밀번호를 변경해 주세요.','먼저 임시 비밀번호를 변경해 주세요.']);
  expect(mock.reads()).toBe(0);expect(mock.drafts()).toBe(0);
  await page.locator('#new-password').fill('New-password-123!');await page.locator('#confirm-password').fill('New-password-123!');
  await page.getByRole('button',{name:'변경하고 진단 시작'}).click();await expect(page.locator('#live-save')).toBeVisible();
  expect(mock.reads()).toBe(1);expect(mock.h.state.updated[0].password).toBe('New-password-123!');
  await page.evaluate(()=>setF('reg.name','수정이름'));
  await expect.poll(()=>mock.drafts()).toBe(1);
});

test('issued passwords expire after five minutes and on tab hiding',async({page})=>{
  await setup(page);await login(page,'consult01');
  await page.clock.install();
  await page.locator('#registration-bulk').fill('시간검증,010-1234-5678,,테스트기업');
  await page.getByRole('button',{name:'실제 계정 일괄 등록'}).click();
  await expect(page.getByLabel('시간검증 임시 비밀번호')).toHaveCount(1);
  await page.clock.fastForward(5*60*1000+1);
  await expect(page.getByLabel('시간검증 임시 비밀번호')).toHaveCount(0);
  await page.locator('#registration-bulk').fill('탭검증,010-8765-4321,,테스트기업');
  await page.getByRole('button',{name:'입력 확인',exact:true}).click();
  await page.getByRole('button',{name:'실제 계정 일괄 등록'}).click();
  await expect(page.getByLabel('탭검증 임시 비밀번호')).toHaveCount(1);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
  await expect(page.getByLabel('탭검증 임시 비밀번호')).toHaveCount(0);
});

test('registration input stays usable at desktop and mobile widths',async({page})=>{
  await setup(page);await login(page,'consult01');
  await page.locator('#registration-bulk').fill('화면확인,010-1234-5678,,테스트기업');
  await page.getByRole('button',{name:'입력 확인',exact:true}).click();
  for(const width of [1100,375]){
    await page.setViewportSize({width,height:900});
    await expect(page.locator('#registration-bulk')).toBeVisible();
    const bounds=await page.locator('#registration-bulk').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
    await page.screenshot({path:`test-results/registration-${width}.png`,fullPage:true});
  }
});

test('existing participant still opens survey; administrator gets only registration screen',async({page})=>{
  const mock=await setup(page);await login(page,'client01');await expect(page.locator('#live-save')).toBeVisible();expect(mock.reads()).toBe(1);
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await login(page,'admin01');
  await expect(page.getByRole('heading',{name:'관리자 참여자 등록'})).toBeVisible();expect(mock.reads()).toBe(1);
  await page.locator('#registration-counselor').selectOption(ids.counselor);
  await page.locator('#registration-bulk').fill('관리자등록,010-8765-4321,,테스트기업');
  await page.getByRole('button',{name:'실제 계정 일괄 등록'}).click();await expect(page.getByRole('cell',{name:'등록 완료',exact:true})).toBeVisible();
});

test('disabled registration does not prevent existing counselor data access',async({page})=>{
  const mock=await setup(page,{enabled:false});await login(page,'consult01');
  await expect(page.getByRole('heading',{name:'상담사 페이지'})).toBeVisible();
  await expect(page.getByRole('cell',{name:'기존참여자',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'참여자 일괄 등록'})).toHaveCount(0);
  expect(mock.h.state.created).toHaveLength(0);
});

test('newly linked participant can resume a draft and submit via the existing request contract (protocol mock)',async({page})=>{
  const mock=await setup(page);await login(page,'consult01');
  await page.locator('#registration-bulk').fill('진단연결,010-2468-1357,,가상기업');
  await page.getByRole('button',{name:'실제 계정 일괄 등록'}).click();
  const secret=page.getByLabel('진단연결 임시 비밀번호');await expect(secret).toHaveCount(1);
  const temporaryPassword=await secret.inputValue();
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await login(page,'24681357',temporaryPassword);
  await page.locator('#new-password').fill('Diagnosis-password-123!');await page.locator('#confirm-password').fill('Diagnosis-password-123!');
  await page.getByRole('button',{name:'변경하고 진단 시작'}).click();await expect(page.locator('#live-save')).toBeVisible();
  await page.evaluate(()=>{goStep(1);setF('reg.name','이어쓰기검증')});
  await page.getByRole('button',{name:'지금 임시저장'}).click();await expect.poll(()=>mock.drafts()).toBe(1);
  const part=mock.h.state.tables.participants.find(p=>p.auth_user_id===mock.h.state.created[0].id);
  expect(mock.assessments.get(part.id).answers.reg.name).toBe('이어쓰기검증');
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();await login(page,'24681357','Diagnosis-password-123!');
  await expect(page.locator('#live-save')).toBeVisible();await page.evaluate(()=>goStep(1));
  await expect(page.locator('#q-A3 input')).toHaveValue('이어쓰기검증');
  // Seed complete synthetic responses, then exercise the existing review /
  // submit UI. This tests the wire contract, not missing server calculation.
  await page.evaluate(async()=>{
    const {S}=await import('/shared/state.js'),{OPT}=await import('/js/03-options.js'),{ITEM_COUNT}=await import('/js/02-eval-config.js');
    Object.assign(S.user,{
      reg:{a1:'동의',consent:true,name:'이어쓰기검증',gender:'남',birthDate:'1966-01-01',birth:'1966',phone:'010-2468-1357',email:'fixture@example.invalid',careers:[{co:'가상기업',title:'가상직책',task:'가상업무'}],industry:OPT['reg.industry'][0],income:OPT['reg.income'][0]},
      goal:{b11:OPT['goal.b11'].slice(0,1),b12:OPT['goal.b12'].slice(0,1),b13:OPT['goal.b13'].slice(0,2),b14:OPT['goal.b14'].slice(0,1),b15:'70',b16:'6'},
      pre:Array(ITEM_COUNT).fill(3),expect:{d32:OPT['expect.d32'].slice(0,1),d33:OPT['expect.d33'].slice(0,3),d34:OPT['expect.d34'].slice(0,1),d35:OPT['expect.d35'].slice(0,2),d36:OPT['expect.d36'].slice(0,1)},done:{reg:true,goal:true,expect:true}
    });goStep(5);
  });
  await page.getByRole('button',{name:'최종 제출',exact:true}).click();
  await expect(page.getByRole('heading',{name:'이어쓰기검증님, 제출이 완료되었습니다'})).toBeVisible();
  expect(mock.submissions()).toBe(1);expect(mock.assessments.get(part.id).status).toBe('submitted');
  expect(mock.assessments.has('existing-participant')).toBe(false);
});
