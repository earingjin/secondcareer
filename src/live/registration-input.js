// The fourth legacy password column is intentionally replaced by company.
// Passwords are never accepted from files or generated in the browser.
export function parseRegistrationText(text){
  text=String(text).replace(/^\uFEFF/,'');
  if(text.length>2*1024*1024)throw Error('입력 데이터는 2MB 이하로 나누어 주세요.');
  const delimiter=(text.split(/\r?\n/).find(line=>line.trim())||'').includes('\t')?'\t':',';
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++}
      else if(quoted||!cell)quoted=!quoted;
      else throw Error('따옴표 형식을 확인해 주세요.');
    }else if(ch===delimiter&&!quoted){row.push(cell.trim());cell=''}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell=''}
    else cell+=ch;
  }
  if(quoted)throw Error('닫히지 않은 따옴표가 있습니다.');
  row.push(cell.trim());if(row.some(Boolean))rows.push(row);
  return rows;
}
export function registrationRows(rows,{profile,counselors=[],organizationName='',defaultCounselorId=''}={}){
  if(rows[0]&&/^(닉네임|이름|이름 또는 닉네임|참여자 이름)$/.test(rows[0][0]))rows=rows.slice(1);
  if(!rows.length)throw Error('등록할 이름과 연락처를 입력해 주세요.');
  if(rows.length>100)throw Error('한 번에 100명 이하로 나누어 등록해 주세요.');
  const seen=new Set();
  return rows.map((cells,index)=>{
    const [displayName='',rawPhone='',counselorName='',rawCompany='']=cells.map(c=>String(c??'').trim());
    const phone=rawPhone.replace(/\D/g,''),loginId=phone.slice(-8);
    let counselorUserId=profile.role==='counselor'?profile.user_id:defaultCounselorId;
    const errors=[],fieldErrors={};
    if(cells.length>4)errors.push('이름·연락처·상담사·소속기업의 4개 열을 사용해 주세요');
    if(!displayName||displayName.length>12)errors.push(fieldErrors.displayName='이름은 1~12자로 입력해 주세요');
    if(phone.length<8||phone.length>20)errors.push(fieldErrors.phone='연락처는 숫자 8~20자리가 필요합니다');
    if(rawCompany.length>200)errors.push(fieldErrors.companyName='소속기업은 200자 이내로 입력해 주세요');
    if(profile.role==='admin'&&counselorName){
      const matches=counselors.filter(c=>c.id===counselorName||c.name===counselorName);
      if(matches.length===1)counselorUserId=matches[0].id;else errors.push(fieldErrors.counselorName='같은 조직의 상담사 이름 또는 ID를 확인해 주세요');
    }
    if(!counselors.some(c=>c.id===counselorUserId))errors.push(fieldErrors.counselorName='담당 상담사를 선택해 주세요');
    if(seen.has(loginId))errors.push(fieldErrors.phone='입력 안에 같은 로그인 아이디가 있습니다');
    seen.add(loginId);
    return {line:index+1,displayName,phone,loginId,counselorUserId,companyName:rawCompany||organizationName,error:errors.join(' · '),fieldErrors};
  });
}

const nodes=(root,name)=>Array.from(root.getElementsByTagNameNS('*',name));
function xml(text){
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('지원하지 않는 XML 형식입니다.');
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(nodes(doc,'parsererror').length)throw Error('엑셀 파일 구조를 확인해 주세요.');
  return doc;
}
export async function readXlsx(file){
  if(file.size>5*1024*1024)throw Error('5MB 이하 XLSX 파일을 선택해 주세요.');
  const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break}
  if(end<0)throw Error('암호화되지 않은 XLSX 파일을 선택해 주세요.');
  const count=view.getUint16(end+10,true);let pos=view.getUint32(end+16,true);
  if(count>2000||view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0)throw Error('지원하지 않는 엑셀 파일입니다.');
  const entries=new Map(),decoder=new TextDecoder();
  for(let i=0;i<count;i++){
    if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)throw Error('엑셀 ZIP 구조가 올바르지 않습니다.');
    const nameLength=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);
    const name=decoder.decode(bytes.slice(pos+46,pos+46+nameLength));
    entries.set(name,{flags:view.getUint16(pos+8,true),method:view.getUint16(pos+10,true),size:view.getUint32(pos+24,true),compressed:view.getUint32(pos+20,true),offset:view.getUint32(pos+42,true)});
    pos+=46+nameLength+extra+comment;
  }
  let expanded=0;
  async function read(name){
    const e=entries.get(name);if(!e)throw Error('엑셀 워크시트를 찾지 못했습니다.');
    const p=e.offset;if(p+30>bytes.length||view.getUint32(p,true)!==0x04034b50||e.flags&1||![0,8].includes(e.method)||e.size>20*1024*1024)throw Error('지원하지 않는 엑셀 압축 형식입니다.');
    const start=p+30+view.getUint16(p+26,true)+view.getUint16(p+28,true);
    if(start+e.compressed>bytes.length)throw Error('엑셀 파일이 잘렸습니다.');
    let stream=new Blob([bytes.slice(start,start+e.compressed)]).stream();
    if(e.method===8)stream=stream.pipeThrough(new DecompressionStream('deflate-raw'));
    const reader=stream.getReader(),chunks=[];let length=0;
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;expanded+=value.length;if(length>e.size||expanded>20*1024*1024){await reader.cancel();throw Error('엑셀 압축 해제 크기가 너무 큽니다.')}chunks.push(value)}
    if(length!==e.size)throw Error('엑셀 파일 크기가 올바르지 않습니다.');
    return new Response(new Blob(chunks)).text();
  }
  const workbook=xml(await read('xl/workbook.xml')),sheet=nodes(workbook,'sheet')[0];
  if(!sheet)throw Error('워크시트가 없습니다.');
  const relationship=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
  const rels=xml(await read('xl/_rels/workbook.xml.rels'));
  const rel=nodes(rels,'Relationship').find(r=>r.getAttribute('Id')===relationship);
  if(!rel||rel.getAttribute('TargetMode')==='External')throw Error('워크시트 연결을 확인해 주세요.');
  let target=rel.getAttribute('Target')||'';
  target=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');
  if(target.includes('..')||!target.startsWith('xl/'))throw Error('지원하지 않는 워크시트 경로입니다.');
  const strings=entries.has('xl/sharedStrings.xml')?nodes(xml(await read('xl/sharedStrings.xml')),'si').map(si=>nodes(si,'t').map(t=>t.textContent).join('')):[];
  const doc=xml(await read(target)),rows=[];
  for(const row of nodes(doc,'row')){
    const cells=[];
    for(const c of nodes(row,'c')){
      if(nodes(c,'f').length)throw Error('수식은 값으로 붙여넣은 뒤 업로드해 주세요.');
      const reference=/^([A-Z]+)[0-9]+$/.exec(c.getAttribute('r')||'');
      if(!reference)throw Error('셀 주소 형식을 확인해 주세요.');
      let column=0;for(const letter of reference[1])column=column*26+letter.charCodeAt(0)-64;
      const type=c.getAttribute('t'),value=nodes(c,'v')[0]?.textContent||'';
      let text=type==='s'?strings[Number(value)] : type==='inlineStr'?nodes(c,'t').map(t=>t.textContent).join(''):value;
      if((!type||type==='n')&&/[eE]/.test(value)){
        const number=Number(value);
        if(!Number.isSafeInteger(number)||number<0)throw Error('연락처 등 긴 숫자는 텍스트 셀로 저장해 주세요.');
        text=String(number);
      }
      if(column>4&&text)throw Error('이름·연락처·상담사·소속기업의 4개 열을 사용해 주세요.');
      if(column<=4)cells[column-1]=text||'';
    }
    if(cells.some(v=>String(v).trim()))rows.push(Array.from({length:Math.max(2,cells.length)},(_,i)=>cells[i]||''));
    if(rows.length>101)throw Error('한 번에 100명 이하로 나누어 등록해 주세요.');
  }
  return rows;
}
