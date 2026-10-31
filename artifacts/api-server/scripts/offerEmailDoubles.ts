export const settingsTable = { key: "key", value: "value" };
export const agentsTable = { email: "email", status: "status", notifyByEmail: "notifyByEmail" };
export const state = { rows: new Map<string, any>(), agents: [] as any[], sent: [] as any[], alerts: [] as any[], fail: false, notices: 0 };
export const eq = (key: string, value: any) => (r: any) => r[key] === value;
export const and = (...ps: any[]) => (r: any) => ps.every(p => p(r));
export const like = (key: string, value: string) => (r: any) => r[key].startsWith(value.replace(/%$/, ""));
export const db: any = {
  select: () => ({ from: (table: any) => {
    const rows = () => table === agentsTable ? state.agents : [...state.rows.values()];
    return { where: async (p: any) => rows().filter(p), then: (resolve: any) => Promise.resolve(rows()).then(resolve) };
  }}),
  insert: () => ({ values: (row: any) => ({ onConflictDoNothing: async () => {
    if (!state.rows.has(row.key)) state.rows.set(row.key, { ...row });
  }}) }),
  update: () => ({ set: (fields: any) => ({ where: (p: any) => {
    const run = () => {
      const rows = [...state.rows.values()].filter(p);
      rows.forEach(r => state.rows.set(r.key, { ...r, ...fields }));
      return rows;
    };
    return { returning: async () => run(), then: (resolve: any) => Promise.resolve(run()).then(resolve) };
  }}) }),
};
export async function sendEmailStrict(to: string, subject: string, htmlBody: string) {
  await new Promise(r => setTimeout(r, 2));
  if (state.fail) throw new Error("SMTP failed");
  state.sent.push({ to, subject, htmlBody });
}
export async function reportOperationalFailure(...args: any[]) { state.alerts.push(args); }
export function notifyDataChanged() { state.notices++; }
export const logger = { error() {} };
