import { createClient } from "npm:@supabase/supabase-js@2.95.0";
const h={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Cache-Control":"no-store"};
const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:h});
const fail=()=>out({error:"INVALID_CREDENTIALS"},401);
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
 if(req.method!=="POST")return out({error:"METHOD_NOT_ALLOWED"},405);
 if(Number(req.headers.get("content-length")||0)>2048)return out({error:"INVALID_REQUEST"},400);
 let body:Record<string,unknown>;
 try{body=await req.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error();}catch{return out({error:"INVALID_REQUEST"},400)}
 const loginId=typeof body.loginId==="string"?body.loginId.trim().toLowerCase():"";
 const password=typeof body.password==="string"?body.password:"";
 const managerEmail=loginId.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginId);
 const legacyLogin=/^[a-z0-9][a-z0-9_-]{5,31}$/.test(loginId);
 if((!managerEmail&&!legacyLogin)||password.length<8||password.length>128)return fail();
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),pub=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!secret||!pub)return out({error:"SERVER_CONFIG"},503);
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const encoder=new TextEncoder();
 const digest=await crypto.subtle.digest("SHA-256",encoder.encode(loginId));
 const hash=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
 const now=Date.now();
 const {data:limit,error:limitError}=await admin.from("login_attempt_limits").select("attempts,window_started_at,locked_until").eq("login_hash",hash).maybeSingle();
 if(limitError)return out({error:"AUTH_TEMPORARILY_UNAVAILABLE"},503);
 if(limit?.locked_until&&new Date(limit.locked_until).getTime()>now)return out({error:"TOO_MANY_ATTEMPTS"},429);
 const start=limit&&now-new Date(limit.window_started_at).getTime()<15*60*1000?limit.window_started_at:new Date(now).toISOString();
 const count=limit&&start===limit.window_started_at?limit.attempts+1:1;
 const locked=count>=5?new Date(now+15*60*1000).toISOString():null;
 const {error:rateError}=await admin.from("login_attempt_limits").upsert({login_hash:hash,window_started_at:start,attempts:count,locked_until:locked},{onConflict:"login_hash"});
 if(rateError)return out({error:"AUTH_TEMPORARILY_UNAVAILABLE"},503);
 if(count>5)return out({error:"TOO_MANY_ATTEMPTS"},429);
 let mapping: {internal_email:string;user_id:string}|null=null;
 if(managerEmail){
   // Email login applies only to client-company managers. Keep existing Auth credentials unchanged.
   const {data:managers,error:managerError}=await admin.from("company_manager_accounts").select("user_id").eq("email_key",loginId).limit(2);
   if(managerError)return out({error:"AUTH_TEMPORARILY_UNAVAILABLE"},503);
   if(!managers||managers.length!==1)return fail();
   const {data:linked,error:linkError}=await admin.from("server_login_lookup").select("internal_email,user_id").eq("user_id",managers[0].user_id).maybeSingle();
   if(linkError)return out({error:"AUTH_TEMPORARILY_UNAVAILABLE"},503);
   mapping=linked;
 }else{
   // Existing admin, counselor, and participant IDs continue to work unchanged.
   const {data:linked,error:linkError}=await admin.from("server_login_lookup").select("internal_email,user_id").eq("login_id",loginId).maybeSingle();
   if(linkError)return out({error:"AUTH_TEMPORARILY_UNAVAILABLE"},503);
   mapping=linked;
 }
 if(!mapping)return fail();
 const client=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:session,error:signError}=await client.auth.signInWithPassword({email:mapping.internal_email,password});
 if(signError||!session.session||session.user?.id!==mapping.user_id)return fail();
 await admin.from("login_attempt_limits").delete().eq("login_hash",hash);
 return out({access_token:session.session.access_token,refresh_token:session.session.refresh_token,expires_at:session.session.expires_at,token_type:"bearer"});
});