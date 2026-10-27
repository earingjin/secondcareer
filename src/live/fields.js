export const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const getPath=(o,p)=>p.split('.').reduce((a,k)=>a==null?a:a[k],o);
export function setPath(o,p,v){const k=p.split('.');let c=o;for(let i=0;i<k.length-1;i++){if(c[k[i]]==null)c[k[i]]={};c=c[k[i]]}c[k[k.length-1]]=v}
