const PRODUCTION_URL='https://tafrbtqjlrokdnhudswb.supabase.co';
const PRODUCTION_KEY='sb_publishable_va6hVj1FwfrxMiD6IQb81Q_AWE5m0-8';

// Only publishable keys belong in this browser configuration.
export function resolveConfig(env={}){
  const mode=env.VITE_SP_ENV??(env.MODE==='test'?'test':'production');
  if(env.MODE==='test'&&mode!=='test')throw Error('서비스 환경 설정이 올바르지 않습니다.');
  if(mode==='production')return Object.freeze({mode,url:PRODUCTION_URL,key:PRODUCTION_KEY});
  if(mode!=='test')throw Error('서비스 환경 설정이 올바르지 않습니다.');
  const id=env.VITE_SP_TEST_PROJECT_ID,url=env.VITE_SP_TEST_SUPABASE_URL,key=env.VITE_SP_TEST_PUBLISHABLE_KEY;
  if(typeof id!=='string'||!/^[a-z0-9]{20}$/.test(id)||typeof url!=='string'||typeof key!=='string'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)||key===PRODUCTION_KEY)throw Error('테스트 환경 설정을 확인해 주세요.');
  let parsed;
  try{parsed=new URL(url)}catch{throw Error('테스트 환경 설정을 확인해 주세요.')}
  if(parsed.origin!==`https://${id}.supabase.co`||parsed.href!==parsed.origin+'/'||parsed.origin===PRODUCTION_URL)throw Error('테스트 환경 설정을 확인해 주세요.');
  return Object.freeze({mode,url:parsed.origin,key});
}

export function requestTarget(config,path){
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))throw Error('요청 주소가 올바르지 않습니다.');
  const target=new URL(path,config.url);
  if(target.origin!==config.url||(config.mode==='test'&&target.origin===PRODUCTION_URL))throw Error('요청 주소가 올바르지 않습니다.');
  return target.href;
}
