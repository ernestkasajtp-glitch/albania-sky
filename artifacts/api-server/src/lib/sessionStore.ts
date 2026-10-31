import { Store } from "express-session";
import { db, sessionsTable, bookingUsersTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";

export class DrizzleSessionStore extends Store {
  constructor() {
    super();
    // Clean up expired sessions every 30 min
    setInterval(() => this.cleanup().catch(() => {}), 30 * 60 * 1000);
  }

  get(sid: string, callback: (err: any, session: any) => void): void {
    db.select().from(sessionsTable).where(eq(sessionsTable.sid, sid))
      .then(rows => {
        const row = rows[0];
        if (!row || row.expiredAt < new Date()) {
          return callback(null, null);
        }
        try {
          callback(null, JSON.parse(row.sess));
        } catch {
          callback(null, null);
        }
      })
      .catch(err => callback(err, null));
  }

  set(sid: string, session: any, callback?: (err?: any) => void): void {
    const maxAge = (session.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000);
    const expiredAt = new Date(Date.now() + maxAge);
    const sess = JSON.stringify(session);

    db.transaction(async tx => {
      // Serialize BE session saves with agency reassignments so in-flight requests
      // cannot resurrect a revoked session with the previous agency identity.
      if (session.source === "be" && session.userId) {
        const [user] = await tx.select({ agentId: bookingUsersTable.agentId })
          .from(bookingUsersTable).where(eq(bookingUsersTable.id, session.userId)).for("share");
        if (!user || (user.agentId ?? null) !== (session.agentId ?? null)) {
          await tx.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
          return;
        }
      }
      await tx.insert(sessionsTable).values({ sid, sess, expiredAt })
        .onConflictDoUpdate({ target: sessionsTable.sid, set: { sess, expiredAt } });
    })
      .then(() => { if (callback) callback(); })
      .catch(err => { if (callback) callback(err); });
  }

  // Called by express-session on every request whose session is unmodified
  // (rolling:true). Without this method express-session falls back to a full
  // set() — re-serializing and rewriting the entire session blob on EVERY
  // request. touch() only bumps expired_at: a single indexed write on the sid
  // primary key, drastically reducing per-request DB work and lock churn.
  touch(sid: string, session: any, callback?: (err?: any) => void): void {
    const maxAge = (session.cookie?.maxAge ?? 7 * 24 * 60 * 60 * 1000);
    const expiredAt = new Date(Date.now() + maxAge);
    db.update(sessionsTable)
      .set({ expiredAt })
      .where(eq(sessionsTable.sid, sid))
      .then(() => { if (callback) callback(); })
      .catch(err => { if (callback) callback(err); });
  }

  destroy(sid: string, callback?: (err?: any) => void): void {
    db.delete(sessionsTable)
      .where(eq(sessionsTable.sid, sid))
      .then(() => { if (callback) callback(); })
      .catch(err => { if (callback) callback(err); });
  }

  async cleanup(): Promise<void> {
    await db.delete(sessionsTable).where(lt(sessionsTable.expiredAt, new Date()));
  }
}
