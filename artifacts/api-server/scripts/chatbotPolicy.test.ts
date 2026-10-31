import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseChatbotSearch,hashChatbotKey,matchesChatbotKey,createChatbotBudget} from "../src/lib/chatbotPolicy";
const valid={from:"TIA",to:"BGY",departure_date:"2027-01-15"};
test("one-way defaults and round trip",()=>{
  assert.deepEqual(parseChatbotSearch(valid,"2026-10-31"),{...valid,adults:1,children:0,infants:0,currency:"EUR"});
  assert.equal(parseChatbotSearch({...valid,return_date:"2027-01-20",adults:2,infants:2},"2026-10-31").infants,2);
});
test("fails closed on agency injection, invalid dates, IATA, counts and currency",()=>{
  for(const patch of [
    {agent_id:14},{from:"TIA%"},{to:"TIA"},{departure_date:"2027-02-30"},
    {departure_date:"2026-01-01"},{return_date:"2027-01-14"},{adults:0},{adults:"1"},
    {children:-1},{children:1.2},{children:9},{infants:2},{currency:"USD"},
  ])assert.throws(()=>parseChatbotSearch({...valid,...patch},"2026-10-31"));
  for(const b of [null,[],42]) assert.throws(()=>parseChatbotSearch(b,"2026-10-31"));
});
test("token hash equality and malformed credentials",()=>{
  const key="nsk_"+"a".repeat(64),hash=hashChatbotKey(key);
  assert.equal(matchesChatbotKey(key,hash),true);
  assert.equal(matchesChatbotKey("nsk_"+"b".repeat(64),hash),false);
  assert.equal(matchesChatbotKey(key,"bad"),false);
  assert.equal(matchesChatbotKey("global-partner-key",hash),false);
});
test("bounded rate budget resets",()=>{
  const budget=createChatbotBudget(2);
  assert.equal(budget(60_000),0);
  assert.equal(budget(60_001),0);
  assert.equal(budget(60_002),60);
  assert.equal(budget(120_000),0);
});
test("separate routes use shared access, agency-channel discounts and sale cutoff",()=>{
  const source=readFileSync("src/routes/chatbot.ts","utf8");
  assert.match(source,/getFlightVisibilityForAgent\(agent.id/);
  assert.match(source,/bookingEngineVisibilityConds\(access\)/);
  assert.match(source,/discountForChannel\(discounts.get\(f.id\) \?\? null,"agents"\)/);
  assert.match(source,/isSaleOpenForFlight\(f,cutoff,confirmedCutoff\)/);
  assert.match(source,/input.adults \+ input.children/);
  assert.doesNotMatch(source,/externalApi|external_api_key|agentsTable.apiKey/);
});
