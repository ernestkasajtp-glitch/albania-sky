// Run on the VPS with Node --env-file; never prints credentials or passenger data.
// Inserts only an ephemeral, isolated chatbot credential and removes it in finally.
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
const require = createRequire("/root/lib/db/package.json");
const { Client } = require("pg");
const client = new Client({connectionString:process.env.DATABASE_URL});
await client.connect();
const setting = "nesti_chatbot_readonly_v1";
let inserted = false, value;
try {
  const previous = await client.query("SELECT 1 FROM settings WHERE key=$1",[setting]);
  assert.equal(previous.rowCount,0,"Existing credential: stop; do not overwrite it");
  const key = "nsk_"+randomBytes(32).toString("hex");
  value = JSON.stringify({agentId:21,hash:createHash("sha256").update(key).digest("hex")});
  await client.query("INSERT INTO settings(key,value) VALUES($1,$2)",[setting,value]);
  inserted = true;
  const origin="https://albaniasky.com";
  const request=async(body,token=key)=>{
    const r=await fetch(origin+"/api/chatbot/v1/flights/search",{
      method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
      body:JSON.stringify(body),signal:AbortSignal.timeout(20000),
    });
    return {status:r.status,data:await r.json()};
  };
  const input={from:"TIA",to:"BGY",departure_date:"2027-01-15",adults:1};
  assert.equal((await request(input,"invalid")).status,401);
  assert.equal((await request({...input,agent_id:1})).status,400);
  assert.equal((await request({...input,departure_date:"2027-02-30"})).status,400);
  assert.equal((await fetch(origin+"/api/chatbot/admin")).status,403);
  assert.equal((await fetch(origin+"/api/chatbot/credential",{method:"POST"})).status,403);
  const result=await request({...input,return_date:"2027-01-20"});
  assert.equal(result.status,200);
  assert.equal(result.data.agency,"KINGS NESTI");
  assert.ok(Array.isArray(result.data.outbound));
  for(const f of [...result.data.outbound,...result.data.inbound]){
    assert.equal(f.pricing.basis,"agency_portal");
    assert.equal(f.pricing.total,f.pricing.tickets_total+f.pricing.taxes_total);
    assert.ok(f.available_seats>=1);
    for(const field of ["netPrice","notes","adultPrice","agentId","apiKey"])assert.ok(!(field in f));
  }
  // With an impossible route there must be no fallback to other dates/routes.
  const empty=await request({...input,from:"ZZZ",to:"YYY"});
  assert.equal(empty.status,200);
  assert.deepEqual(empty.data.outbound,[]);
  await client.query("DELETE FROM settings WHERE key=$1 AND value=$2",[setting,value]); inserted=false;
  assert.equal((await request(input)).status,401);
  const partner=await fetch(origin+"/api/v1/agent/flights");
  assert.equal(partner.status,401);
  console.log(JSON.stringify({ok:true,checks:["invalid-token","agency-injection","invalid-date","admin-denied","credential-denied","roundtrip","empty-results","revocation","partner-still-authenticated"],outboundCount:result.data.outbound.length,inboundCount:result.data.inbound.length,credentialRemoved:true}));
} finally {
  if(inserted)await client.query("DELETE FROM settings WHERE key=$1 AND value=$2",[setting,value]);
  await client.end();
}
