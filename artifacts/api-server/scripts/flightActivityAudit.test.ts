import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pool, databaseAuditContext } from "@workspace/db";
import { attachDatabaseAudit, attachDatabaseAuditPool, tagAuditQuery } from "../../../lib/db/src/auditContext.js";
import { readFlightActivity } from "../src/lib/flightActivityHistory.js";
import { drizzle } from "drizzle-orm/node-postgres";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import type { AuditContext } from "../../../lib/db/src/auditContext.js";

const schema = `flight_audit_test_${randomUUID().replaceAll("-", "")}`;
const Pool = pool.constructor as any;
// One physical connection forces different requests to reuse the same client.
// No public-schema fallback: all fixture DDL, triggers and writes stay isolated.
const isolated = new Pool({connectionString:process.env.DATABASE_URL, max:1,
  connectionTimeoutMillis:5000, options:`-c search_path=${schema} -c statement_timeout=10000`});
isolated.on("connect",(client:any)=>attachDatabaseAudit(client));
attachDatabaseAuditPool(isolated);

const alice: AuditContext = {userId:700001,userName:"Audit Fixture A",userRole:"admin",source:"PATCH /fixture/a"};
const bob: AuditContext = {userId:700002,userName:"Audit Fixture B",userRole:"manager",source:"PATCH /fixture/b"};
const unknownOrigin = "Proces serveri / DB — burimi i paregjistruar";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return {promise, resolve};
}
const inContext = <T>(actor: AuditContext, fn: () => T): T =>
  databaseAuditContext.run(() => actor, fn);
const updateText = "UPDATE flights SET adult_price=$1 WHERE id=1 RETURNING adult_price";
let price = 2000;
async function assertActor(value: number, actor?: AuditContext) {
  const {rows} = await isolated.query(`SELECT user_id,user_name,user_role,origin
    FROM flight_activity_audit
    WHERE entity_table='flights' AND entity_id='1' AND operation='UPDATE'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(changes) c
      WHERE c->>'field'='adult_price' AND c->>'new'=$1)`, [String(value)]);
  assert.equal(rows.length, 1, `exactly one audit event for price ${value}`);
  assert.deepEqual(rows[0], {
    user_id: actor?.userId ?? null, user_name: actor?.userName ?? null,
    user_role: actor?.userRole ?? null, origin: actor?.source ?? unknownOrigin,
  }, `statement ${value} must retain its own actor, never a pooled predecessor`);
}

async function concurrencyCases() {
  // Query overloads on both Pool and a checked-out Client. Frozen config objects
  // are reused across identities to catch mutation/cached-tag regressions.
  for (const checkedOut of [false, true]) {
    const target = checkedOut ? await isolated.connect() : isolated;
    const expected: Array<[number, AuditContext | undefined]> = [];
    try {
      for (const actor of [alice, bob]) {
        await inContext(actor, async () => {
          for (const config of [false, true]) {
            for (const callback of [false, true]) {
              const value = ++price;
              const query = Object.freeze({text:updateText, values:[value], rowMode:"array"});
              const args = config ? [query] : [updateText, [value]];
              const result = callback
                ? await new Promise<any>((resolve,reject) => target.query(...args,
                    (error:any, result:any) => error ? reject(error) : resolve(result)))
                : await target.query(...args);
              assert.equal(Number(config ? result.rows[0][0] : result.rows[0].adult_price), value);
              assert.equal(query.text, updateText);
              expected.push([value, actor]);
            }
          }
          // String + callback (without values).
          const value = ++price;
          await new Promise<void>((resolve,reject) => target.query(
            `UPDATE flights SET adult_price=${value} WHERE id=1`,
            (error:any) => error ? reject(error) : resolve()));
          expected.push([value, actor]);
        });
      }
      // Queue writes from two ALS scopes on the exact same client.
      const sharedConfig = Object.freeze({text:updateText});
      await Promise.all(Array.from({length:12}, (_, i) => {
        const actor = [alice, bob, undefined][i % 3];
        const value = ++price;
        expected.push([value, actor]);
        const write = () => target.query(sharedConfig, [value]);
        return actor ? inContext(actor, write) : write();
      }));
      assert.equal(sharedConfig.text, updateText);
    } finally {
      if (checkedOut) target.release();
    }
    for (const [value, actor] of expected) await assertActor(value, actor);
  }

  // Explicit transaction must use a pinned client (Pool.query BEGIN does not
  // guarantee this on a multi-connection pool). Context is statement-scoped,
  // even when different scopes enqueue on a single transaction.
  const client = await isolated.connect();
  const committed: Array<[number, AuditContext | undefined]> = [];
  const rolledBack = ++price;
  try {
    await client.query("BEGIN");
    for (const actor of [alice, bob, undefined]) {
      const value = ++price;
      const write = () => client.query(updateText, [value]);
      await (actor ? inContext(actor, write) : write());
      committed.push([value, actor]);
    }
    await client.query("COMMIT");
    await client.query("BEGIN");
    await inContext(bob, () => client.query(updateText, [rolledBack]));
    await assert.rejects(client.query("SELECT 1/0"), /division by zero/);
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
  for (const [value, actor] of committed) await assertActor(value, actor);
  assert.equal((await isolated.query(`SELECT count(*)::int AS n FROM flight_activity_audit
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(changes) c
      WHERE c->>'field'='adult_price' AND c->>'new'=$1)`, [String(rolledBack)])).rows[0].n, 0);

  // The SQL text for a named statement must remain byte-identical across
  // Parse/Bind executions. Attribution is deliberately unknown, not cached A.
  const prepared = Object.freeze({name:"fixture_price_update",text:updateText});
  for (const actor of [alice, bob, undefined, alice]) {
    const value = ++price;
    const write = () => isolated.query(prepared, [value]);
    const result = await (actor ? inContext(actor, write) : write());
    assert.equal(Number(result.rows[0].adult_price), value);
    await assertActor(value);
  }
  assert.equal(prepared.text, updateText);
  const afterPrepared = ++price;
  await inContext(bob, () => isolated.query(updateText, [afterPrepared]));
  await assertActor(afterPrepared, bob);

  // Real overlapping HTTP lifecycles without importing the production app
  // (which starts unrelated workers). The lazy getter mirrors app.ts: session
  // and route can be resolved after middleware enters the ALS scope.
  const bothEntered = deferred();
  const runAfterResponse = deferred();
  let entered = 0;
  let lateWrite: Promise<void> | undefined;
  const values = {a:++price,b:++price,late:++price,background:++price};
  const errors: unknown[] = [];
  const server = createServer((req,res) => {
    const actor = req.url === "/a" ? alice : bob;
    const request = {session:{} as Partial<AuditContext>, source:"middleware"};
    databaseAuditContext.run(() => ({...request.session,source:request.source}), () => {
      void (async () => {
        request.session = actor;
        request.source = actor.source;
        if (++entered === 2) bothEntered.resolve();
        await bothEntered.promise;
        await isolated.query(updateText, [actor === alice ? values.a : values.b]);
        if (actor === alice) {
          // Detached work created by A retains A after the response; it must
          // neither become B nor contaminate unrelated background work.
          lateWrite = (async () => {
            await runAfterResponse.promise;
            await isolated.query(updateText, [values.late]);
          })().catch(error => { errors.push(error); });
        }
        res.end("ok");
      })().catch(error => { errors.push(error); res.statusCode=500; res.end("failed"); });
    });
  });
  try {
    server.listen(0,"127.0.0.1");
    await once(server,"listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const responses = await Promise.all(["a","b"].map(async path => {
      const response = await fetch(`http://127.0.0.1:${address.port}/${path}`,
        {signal:AbortSignal.timeout(10000)});
      assert.equal(response.status,200);
      return response.text();
    }));
    assert.deepEqual(responses,["ok","ok"]);
    assert.equal(databaseAuditContext.getStore(),undefined);
    assert.ok(lateWrite);
    runAfterResponse.resolve();
    await Promise.all([lateWrite, new Promise<void>((resolve,reject) => {
      setImmediate(() => {
        isolated.query(updateText,[values.background]).then(() => resolve(),reject);
      });
    })]);
    assert.deepEqual(errors,[]);
    await assertActor(values.a,alice);
    await assertActor(values.b,bob);
    await assertActor(values.late,alice);
    await assertActor(values.background);
  } finally {
    bothEntered.resolve();
    runAfterResponse.resolve();
    await lateWrite;
    server.closeAllConnections();
    await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
  }
  console.log("Audit isolation: concurrent HTTP, pooled reuse, overloads, transactions, prepared statements and post-response jobs passed");
}

try {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await isolated.query(`CREATE TABLE flights(id serial primary key,from_city text,to_city text,departure_date text,total_seats int,sold_seats int,adult_price numeric);
    CREATE TABLE bookings(id serial primary key,flight_id int,booking_ref text,status text);
    CREATE TABLE passengers(id serial primary key,booking_id int,first_name text,passport_number text);
    CREATE TABLE payments(id serial primary key,booking_id int,amount numeric);
    CREATE TABLE payment_change_logs(id serial primary key,payment_id int,action text,field_name text,old_value text,new_value text,note text,user_name text,user_role text,created_at timestamptz);
    CREATE TABLE tasks(id serial primary key,entity_type text,entity_id int,parent_id int,title text);
    CREATE TABLE task_activity(id serial primary key,task_id int,action text,meta jsonb,user_name text,created_at timestamptz);
    CREATE TABLE claim_bookings(claim_id int,booking_id int);
    CREATE TABLE agency_group_rules(id serial primary key,group_id int,airport text,direction text,date_from date,date_to date);
    CREATE TABLE agency_groups(id serial primary key,name text);
    CREATE TABLE settings(key text,value text);
    CREATE TABLE flight_change_history(id serial,flight_id int,source text,changes jsonb,note text,user_name text,user_role text,created_at timestamptz);
    CREATE TABLE flight_seat_history(id serial,flight_id int,event_type text,old_total int,total_seats int,sold_seats int,note text,user_name text,user_role text,created_at timestamptz);
    CREATE TABLE flight_price_history(id serial,flight_id int,old_adult_price numeric,new_adult_price numeric,user_name text,user_role text,created_at timestamptz);
    CREATE TABLE flight_notes(id serial,flight_id int,message text,author_name text,author_role text,created_at timestamptz);
    CREATE TABLE booking_change_logs(id serial,booking_id int,action text,field_name text,old_value text,new_value text,note text,user_name text,user_role text,created_at timestamptz);`);
  await isolated.query(readFileSync("../../deploy/migrations/flight-universal-audit.sql","utf8"));
  await databaseAuditContext.run(()=>({userId:7,userName:"Fixture",userRole:"admin",source:"PATCH /api/flights/1"}),async()=>{
    await isolated.query("INSERT INTO flights VALUES(1,'TIA','FCO','2028-01-01',20,0,100),(2,'BER','TIA','2028-02-01',20,0,100)");
    await isolated.query("UPDATE flights SET adult_price=105 WHERE id=1");
  });
  const audit=async()=> (await isolated.query("SELECT * FROM flight_activity_audit ORDER BY id")).rows;
  assert.equal((await audit()).at(-1).user_name,"Fixture");
  assert.equal((await audit()).at(-1).origin,"PATCH /api/flights/1");
  await isolated.query("INSERT INTO bookings VALUES(1,1,'KTF1234','draft')");
  await isolated.query("INSERT INTO passengers VALUES(1,1,'Example','SECRET-PASSPORT')");
  assert.ok(!JSON.stringify(await audit()).includes("SECRET-PASSPORT"));
  await isolated.query("UPDATE bookings SET flight_id=2 WHERE id=1");
  assert.deepEqual((await audit()).slice(-2).map((x:any)=>x.flight_id).sort(),[1,2]);
  await isolated.query("INSERT INTO agency_group_rules VALUES(1,1,'TIA','either',null,null)");
  assert.deepEqual((await audit()).slice(-2).map((x:any)=>x.flight_id).sort(),[1,2]);
  await isolated.query("INSERT INTO settings VALUES('unrelated_secret','DO-NOT-COPY'),('flightDiscount.1','{\"amount\":5}')");
  assert.ok(!JSON.stringify(await audit()).includes("DO-NOT-COPY"));
  assert.equal((await audit()).at(-1).entity_table,"settings");
  const before=(await audit()).length;
  const rollbackClient = await isolated.connect();
  try {
    await rollbackClient.query("BEGIN");
    await rollbackClient.query("UPDATE flights SET adult_price=999 WHERE id=1");
    await rollbackClient.query("ROLLBACK");
  } finally {
    rollbackClient.release();
  }
  assert.equal((await audit()).length,before);
  await isolated.query("DELETE FROM passengers WHERE id=1");
  assert.equal((await audit()).at(-1).flight_id,2);
  await isolated.query("INSERT INTO payments VALUES(1,1,20);INSERT INTO payment_change_logs(id,payment_id,action) VALUES(1,1,'paid')");
  assert.equal((await audit()).at(-1).flight_id,2);
  const history = await readFlightActivity(1,0,drizzle(isolated) as any);
  assert.ok(history.data.length>0);
  assert.ok(history.data.some((e:any)=>e.user_name==="Fixture"));
  assert.equal(tagAuditQuery("SELECT 1"),"SELECT 1");
  await concurrencyCases();
  console.log("Universal audit: actor, source, moves, groups, privacy, delete and rollback passed");
} finally {
  await isolated.end();
  await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
  await pool.end();
}
