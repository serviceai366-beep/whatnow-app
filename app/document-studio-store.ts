import type { D1DatabaseLike } from "./file-store.ts";
import { validateGeneratedDocument, type GeneratedDocument } from "./document-studio-schema.ts";
import type { SubscriptionPlanCode } from "./subscription-types.ts";

// Free access is useful for occasional real work; Pro is exactly 10x higher
// for generation and preparation-assistant requests.
export const STUDIO_LIMITS = { free: { day: 3, month: 30, words: 3500 }, pro: { day: 30, month: 300, words: 12000 } } as const;
export const STUDIO_ASSISTANT_LIMITS = { free: { day: 3, month: 30 }, pro: { day: 30, month: 300 } } as const;
const DAY = 86_400_000;

export class StudioStoreError extends Error {
  readonly code: "studio_limit_reached" | "studio_service_limit" | "studio_not_found";
  readonly status: 404 | 429 | 503;
  constructor(code: "studio_limit_reached" | "studio_service_limit" | "studio_not_found", status: 404 | 429 | 503) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export type StudioQuota = { planCode: SubscriptionPlanCode; dailyUsed: number; dailyLimit: number; monthlyUsed: number; monthlyLimit: number; remaining: number };
export type SavedStudioDocument = { id: string; createdAt: number; result: GeneratedDocument };

async function rows<T>(s: ReturnType<D1DatabaseLike["prepare"]>): Promise<T[]> { const x = await s.all<T>(); return Array.isArray(x) ? x : x.results ?? []; }

function createStore(db: D1DatabaseLike) {
  let ready: Promise<void> | null = null;
  const init = () => ready ??= (async () => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS generated_documents (id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL,result_json TEXT NOT NULL,created_at INTEGER NOT NULL)`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS document_studio_usage (id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','completed')),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS document_studio_assistant_usage (id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','completed')),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`).run();
    await db.batch([db.prepare("CREATE INDEX IF NOT EXISTS generated_documents_owner_idx ON generated_documents(user_id,created_at DESC)"), db.prepare("CREATE INDEX IF NOT EXISTS studio_usage_owner_idx ON document_studio_usage(user_id,created_at DESC)"), db.prepare("CREATE INDEX IF NOT EXISTS studio_assistant_usage_owner_idx ON document_studio_assistant_usage(user_id,created_at DESC)")]);
  })();
  const quota = async (userId: string, plan: SubscriptionPlanCode, now = Date.now()): Promise<StudioQuota> => {
    await init(); const limits = STUDIO_LIMITS[plan];
    const r = await db.prepare(`SELECT SUM(CASE WHEN created_at>? THEN 1 ELSE 0 END) daily, COUNT(*) monthly FROM document_studio_usage WHERE user_id=? AND created_at>?`).bind(now-DAY,userId,now-30*DAY).first<{daily:number|null;monthly:number|null}>();
    const dailyUsed=Number(r?.daily??0), monthlyUsed=Number(r?.monthly??0);
    return { planCode:plan,dailyUsed,dailyLimit:limits.day,monthlyUsed,monthlyLimit:limits.month,remaining:Math.max(0,Math.min(limits.day-dailyUsed,limits.month-monthlyUsed)) };
  };
  return {
    quota,
    async reserve(userId:string,plan:SubscriptionPlanCode,now=Date.now()){ await init(); await db.prepare("DELETE FROM document_studio_usage WHERE status='pending' AND updated_at<=?").bind(now-600000).run(); const q=await quota(userId,plan,now); if(q.remaining<1) throw new StudioStoreError("studio_limit_reached",429); const id=crypto.randomUUID(); const x=await db.prepare(`INSERT INTO document_studio_usage(id,user_id,status,created_at,updated_at) SELECT ?,?,'pending',?,? WHERE (SELECT COUNT(*) FROM document_studio_usage WHERE user_id=? AND created_at>?)<? AND (SELECT COUNT(*) FROM document_studio_usage WHERE user_id=? AND created_at>?)<? AND (SELECT COUNT(*) FROM document_studio_usage WHERE created_at>?)<500 RETURNING id`).bind(id,userId,now,now,userId,now-DAY,STUDIO_LIMITS[plan].day,userId,now-30*DAY,STUDIO_LIMITS[plan].month,now-DAY).first<{id:string}>(); if(x?.id!==id) throw new StudioStoreError("studio_service_limit",503); return id; },
    async release(userId:string,id:string){await init();await db.prepare("DELETE FROM document_studio_usage WHERE id=? AND user_id=? AND status='pending'").bind(id,userId).run();},
    async reserveAssistant(userId:string,plan:SubscriptionPlanCode,now=Date.now()){await init();const limits=STUDIO_ASSISTANT_LIMITS[plan];await db.prepare("DELETE FROM document_studio_assistant_usage WHERE status='pending' AND updated_at<=?").bind(now-600000).run();const id=crypto.randomUUID();const x=await db.prepare(`INSERT INTO document_studio_assistant_usage(id,user_id,status,created_at,updated_at) SELECT ?,?,'pending',?,? WHERE (SELECT COUNT(*) FROM document_studio_assistant_usage WHERE user_id=? AND created_at>?)<? AND (SELECT COUNT(*) FROM document_studio_assistant_usage WHERE user_id=? AND created_at>?)<? AND (SELECT COUNT(*) FROM document_studio_assistant_usage WHERE created_at>?)<2000 RETURNING id`).bind(id,userId,now,now,userId,now-DAY,limits.day,userId,now-30*DAY,limits.month,now-DAY).first<{id:string}>();if(x?.id!==id)throw new StudioStoreError("studio_limit_reached",429);return id;},
    async completeAssistant(userId:string,id:string,now=Date.now()){await init();await db.prepare("UPDATE document_studio_assistant_usage SET status='completed',updated_at=? WHERE id=? AND user_id=?").bind(now,id,userId).run();},
    async releaseAssistant(userId:string,id:string){await init();await db.prepare("DELETE FROM document_studio_assistant_usage WHERE id=? AND user_id=? AND status='pending'").bind(id,userId).run();},
    async complete(userId:string,id:string,result:GeneratedDocument,now=Date.now()){await init();const docId=crypto.randomUUID();await db.batch([db.prepare("UPDATE document_studio_usage SET status='completed',updated_at=? WHERE id=? AND user_id=?").bind(now,id,userId),db.prepare("INSERT INTO generated_documents(id,user_id,result_json,created_at) VALUES(?,?,?,?)").bind(docId,userId,JSON.stringify(result),now)]);await db.prepare("DELETE FROM generated_documents WHERE user_id=? AND id NOT IN (SELECT id FROM generated_documents WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 10)").bind(userId,userId).run();return docId;},
    async completeUpdate(userId:string,documentId:string,usageId:string,result:GeneratedDocument,now=Date.now()){await init();const updated=await db.prepare("UPDATE generated_documents SET result_json=?,created_at=? WHERE id=? AND user_id=? RETURNING id").bind(JSON.stringify(result),now,documentId,userId).first<{id:string}>();if(updated?.id!==documentId)throw new StudioStoreError("studio_not_found",404);await db.prepare("UPDATE document_studio_usage SET status='completed',updated_at=? WHERE id=? AND user_id=?").bind(now,usageId,userId).run();return documentId;},
    async list(userId:string){await init();const r=await rows<{id:string,result_json:string,created_at:number}>(db.prepare("SELECT id,result_json,created_at FROM generated_documents WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 10").bind(userId));return r.flatMap(x=>{try{const result=JSON.parse(x.result_json);return validateGeneratedDocument(result)?[{id:x.id,createdAt:x.created_at,result}]:[]}catch{return []}});},
    async get(userId:string,id:string){await init();const x=await db.prepare("SELECT id,result_json,created_at FROM generated_documents WHERE user_id=? AND id=? LIMIT 1").bind(userId,id).first<{id:string,result_json:string,created_at:number}>();if(!x)return null;try{const result=JSON.parse(x.result_json);return validateGeneratedDocument(result)?{id:x.id,createdAt:x.created_at,result}:null}catch{return null}},
    async remove(userId:string,id:string){await init();const x=await db.prepare("DELETE FROM generated_documents WHERE user_id=? AND id=? RETURNING id").bind(userId,id).first<{id:string}>();return x?.id===id;},
  };
}
export type DocumentStudioStore=ReturnType<typeof createStore>;
let singleton:Promise<DocumentStudioStore|null>|null=null;
export async function getDocumentStudioStore(){singleton??=(async()=>{try{const runtime=await import("cloudflare:workers");const db=(runtime.env as unknown as {DB?:D1DatabaseLike}).DB;return db?createStore(db):null}catch{return null}})();return singleton;}
export function createDocumentStudioStoreForTests(db:D1DatabaseLike){return createStore(db);}
