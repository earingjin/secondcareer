import {esc} from './fields.js';

const linkIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
const seoul=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'medium'});
const format=value=>esc(seoul.format(new Date(value)));
const statusLabels={active:'접수 가능',disabled:'비활성',expired:'만료',stopped:'접수 중지',invalid:'기준 주소 오류'};

function validBaseUrl(value){
  // A non-null base URL has passed the authenticated API's server-side origin allowlist.
  if(typeof value!=='string'||!value.startsWith('https://')||value.length>2049)return false;
  try{
    const url=new URL(value),host=url.hostname;
    return url.href===value&&url.protocol==='https:'&&/^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*$/.test(host)&&
      !url.username&&!url.password&&!url.search&&!url.hash&&
      !/(^|[.-])(localhost|local)([.-]|$)/.test(host);
  }catch{return false}
}

export function validPublicIntakeLinks(data){
  return !!data&&timestamp(data.serverTime)&&typeof data.intakeEnabled==='boolean'&&
    (data.baseUrl===null||validBaseUrl(data.baseUrl))&&Array.isArray(data.links)&&
    data.links.every(link=>link&&typeof link.id==='string'&&linkIdPattern.test(link.id)&&
      typeof link.enabled==='boolean'&&timestamp(link.expiresAt)&&timestamp(link.createdAt))&&
    new Set(data.links.map(link=>link.id.toLowerCase())).size===data.links.length;
}

export function publicIntakeStatus(data,link,now){
  if(!link.enabled)return 'disabled';
  if(Date.parse(link.expiresAt)<=now)return 'expired';
  if(!data.intakeEnabled)return 'stopped';
  return data.baseUrl?'active':'invalid';
}

export function publicIntakeUrl(data,link,now){
  if(!data||!link||publicIntakeStatus(data,link,now)!=='active')return null;
  const url=new URL(data.baseUrl);
  url.searchParams.set('entry','pre');
  url.searchParams.set('linkId',link.id);
  return url.href;
}

export function publicIntakeView({data,loading,error,feedback},now,{dashboard=false}={}){
  const actions=dashboard?'<button type="button" class="btn ghost" data-admin-menu="admin-assessment-url">진단 링크 관리</button>':
    `<button type="button" class="btn ghost sm" data-intake-refresh aria-disabled="${loading}">다시 조회</button>`;
  const head=`<div class="admin-section-head"><h3>공용 사전진단 링크</h3>${actions}</div>`;
  const message=loading?'공용 링크를 조회하고 있습니다.':error;
  if(!data||loading)return head+`<p role="status">${esc(message||'공용 링크를 조회해 주세요.')}</p>`;

  const active=data.links.filter(link=>publicIntakeStatus(data,link,now)==='active');
  const notices=[
    !data.links.length?'등록된 공용 링크가 없습니다.':'',
    !data.intakeEnabled?'공용 사전진단 접수가 중지되어 있습니다.':'',
    !data.baseUrl?'배포용 기준 주소를 확인해 주세요.':'',
    dashboard&&active.length>1?`접수 가능한 링크가 ${active.length}개 있습니다. 진단 링크 관리에서 개별 링크를 확인해 주세요.`:'',
    dashboard&&!active.length&&data.links.length?`접수 가능한 링크가 없습니다. (${[...new Set(data.links.map(link=>statusLabels[publicIntakeStatus(data,link,now)]))].join(' · ')})`:''
  ].filter(Boolean);
  const links=dashboard?(active.length===1?active:[]):data.links;
  return head+notices.map(note=>`<p class="hintline">${esc(note)}</p>`).join('')+
    (dashboard?'':`<p class="hintline">조회 시각 (한국시간) ${format(data.serverTime)}</p>
    ${active.length?`<p class="hintline" id="intake-open-notice">설문을 새 탭에서 열면 실제 임시 접수 기록이 생성될 수 있습니다.</p>`:''}`)+
    links.map(link=>{
      const status=publicIntakeStatus(data,link,now),url=publicIntakeUrl(data,link,now);
      const key=`${dashboard?'dashboard':'settings'}-${link.id}`;
      return `<article class="admin-intake-link" data-intake-link="${esc(link.id)}">
        <div class="admin-intake-meta"><b class="admin-status-chip ${status==='active'?'':'needs-action'}">${statusLabels[status]}</b>
        <span>유효기간 (한국시간) <time datetime="${esc(link.expiresAt)}">${format(link.expiresAt)}</time></span></div>
        ${dashboard?'':`<p class="hintline">등록 시각 (한국시간) ${format(link.createdAt)} ${url?'':`· 링크 ID ${esc(link.id)}`}</p>`}
        ${url?`<label for="intake-url-${key}">공용 설문 URL</label>
        <textarea id="intake-url-${key}" class="in admin-intake-url" data-intake-url readonly rows="2" spellcheck="false">${esc(url)}</textarea>
        <div class="acts"><button type="button" class="btn ghost sm" data-intake-copy>복사</button>
        ${dashboard?'':`<a class="btn ghost sm" data-intake-open href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-describedby="intake-open-notice">설문 새 탭에서 열기</a>`}</div>`:''}
      </article>`;
    }).join('')+`<p role="status" data-intake-feedback>${esc(feedback||'')}</p>`;
}
