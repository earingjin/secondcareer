import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import {makeHandler} from "./service.ts";

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(makeHandler(db,()=>Deno.env.get('SECONDCAREER_PUBLIC_INTAKE_ENABLED')==='true'));
