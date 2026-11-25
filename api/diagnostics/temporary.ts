import { timingSafeEqual } from "node:crypto";
function matches(a: unknown, b: string): boolean {
  if (typeof a !== "string") return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function safeMessage(value: unknown, secret: string): string | null {
  if (typeof value !== "string") return null;
  return value.split(secret).join("[redacted]").replace(/[\r\n\t]+/g, " ").slice(0, 240);
}
async function postJson(url: string, headers: Record<string,string>, body: object) {
  const response = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  return {ok:response.ok,status:response.status,payload:await response.json().catch(()=>null)};
}
export default async function handler(req:any,res:any) {
  res.setHeader("Cache-Control","no-store, max-age=0");
  res.setHeader("X-Robots-Tag","noindex, nofollow");
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed."});
  const expected=process.env.ZORD_TEMP_DIAGNOSTIC_SECRET;
  if(!expected || !matches(req.headers["x-zord-diagnostic-key"],expected)) return res.status(404).json({error:"Not found."});
  const aiKey=process.env.ZORD_AI_API_KEY, aiUrl=process.env.ZORD_AI_API_URL;
  const models={sentinel:"gemini-2.5-flash-lite",poly_shield:"gemini-2.5-flash",omini_glitch:"gemini-2.5-pro"};
  const ai:Record<string,any>={};
  for(const [agent,model] of Object.entries(models)) {
    try {
      const r=aiKey&&aiUrl ? await postJson(aiUrl,{Authorization:`Bearer ${aiKey}`},{model,temperature:0,max_tokens:8,messages:[{role:"user",content:"Reply with OK."}]}) : {ok:false,status:0,payload:null};
      const good=Boolean(r.ok && typeof r.payload?.choices?.[0]?.message?.content==="string");
      ai[agent]={passed:good,http_status:r.status,error:good?null:safeMessage(r.payload?.error?.message??r.payload?.message,aiKey??"")};
    } catch(e:any) { ai[agent]={passed:false,http_status:0,error:safeMessage(e?.name??"request_failed",aiKey??"")}; }
  }
  let telegram:any={token_valid:false,webhook_configured:false};
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(token) try {
    const [me,hook]=await Promise.all([
      postJson(`https://api.telegram.org/bot${token}/getMe`,{},{ }),
      postJson(`https://api.telegram.org/bot${token}/getWebhookInfo`,{},{ })
    ]);
    const tokenValid=me.ok&&me.payload?.ok===true, hookResult=hook.payload?.result??{};
    let host=null; try { host=hookResult.url?new URL(hookResult.url).host:null; } catch {}
    telegram={token_valid:tokenValid,webhook_configured:Boolean(hook.ok&&hook.payload?.ok===true&&hookResult.url),webhook_host:host,pending_update_count:Number.isInteger(hookResult.pending_update_count)?hookResult.pending_update_count:null,last_error_date_present:Number.isFinite(hookResult.last_error_date)};
  } catch { telegram={token_valid:false,webhook_configured:false}; }
  return res.status(200).json({ai_models:ai,telegram});
}