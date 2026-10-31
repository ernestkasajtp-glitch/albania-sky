import { AsyncLocalStorage } from "node:async_hooks";

export type AuditContext = {
  userId?: number | null;
  userName?: string | null;
  userRole?: string | null;
  source: string;
};
export const databaseAuditContext = new AsyncLocalStorage<() => AuditContext>();

// pg-pool drains queued acquisitions from the releasing client's async scope.
// Restore the acquirer's context before Pool.query calls the client's wrapper.
// Promise connect callers already resume in their own scope; callback callers
// (including Pool.query itself) need this explicit boundary.
export function attachDatabaseAuditPool(pool: { connect: (...args: any[]) => any }): void {
  const original = pool.connect;
  pool.connect = function (...args: any[]) {
    if (typeof args[0] === "function") {
      const callback = args[0];
      const context = databaseAuditContext.getStore();
      args[0] = function (this: unknown, ...values: any[]) {
        const invoke = () => callback.apply(this, values);
        return context ? databaseAuditContext.run(context, invoke) : databaseAuditContext.exit(invoke);
      };
    }
    return original.apply(this, args);
  };
}

// Context travels with this statement, never with a pooled connection. No extra
// round trip, SET state, transaction boundary, or changes to query parameters.
export function tagAuditQuery(text: string, named = false): string {
  const getContext = databaseAuditContext.getStore();
  if (!getContext || named || !/\b(insert|update|delete)\b/i.test(text)) return text;
  const context = getContext();
  const tag = Buffer.from(JSON.stringify({
    userId: context.userId ?? null,
    userName: context.userName?.slice(0, 200) ?? null,
    userRole: context.userRole?.slice(0, 50) ?? null,
    source: context.source.slice(0, 300),
  })).toString("base64");
  return `${text}\n/*fms_audit:${tag}*/`;
}

export function attachDatabaseAudit(client: { query: (...args: any[]) => any }): void {
  const original = client.query;
  client.query = function (...args: any[]) {
    if (typeof args[0] === "string") args[0] = tagAuditQuery(args[0]);
    else if (args[0] && typeof args[0].text === "string")
      args[0] = { ...args[0], text: tagAuditQuery(args[0].text, !!args[0].name) };
    return original.apply(this, args);
  };
}
