// Offline review helper for synthetic/exported administrative data only. No I/O,
// writes or automatic assignments. Mirrors STEP 14-A JS normalization; database
// POSIX whitespace/locale behavior still requires real DB validation before migration.
const key=s=>String(s??'').trim().replace(/\s+/gu,' ').replace(/[A-Z]/g,c=>c.toLowerCase());
export function previewCompanyLinks(participants,companies){
  const groups=new Map();
  for(const p of participants){
    if(p.company_id!=null)continue;
    const normalized=key(p.company_name),matches=companies.filter(c=>c.organization_id===p.organization_id&&key(c.name)===normalized);
    const outcome=!normalized?'blank':!matches.length?'unmatched':matches.length>1?'ambiguous':matches[0].status==='active'?'candidate_review':'inactive_review';
    const companyId=['candidate_review','inactive_review'].includes(outcome)?matches[0].id:null;
    const groupKey=JSON.stringify([p.organization_id,outcome,companyId]);
    if(!groups.has(groupKey))groups.set(groupKey,{organizationId:p.organization_id,outcome,companyId,participants:0});
    groups.get(groupKey).participants++;
  }
  return [...groups.values()];
}
