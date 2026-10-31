const money = {type:"number",minimum:0};
const airport = {type:"string",pattern:"^[A-Z]{3}$"};
const date = {type:"string",format:"date"};
export const chatbotOpenApi = {
  openapi:"3.0.3",
  info:{title:"Albania Sky — NESTI Read-only Flight Search",version:"1.0.0",
    description:"Server-to-server REST API. Agency is fixed by the credential. Prices match KINGS NESTI's Booking Engine rules, agency-channel offers and checkout rounding. No booking, payment or passenger data access. Existing partner API is separate."},
  servers:[{url:"https://albaniasky.com/api/chatbot/v1"}],
  security:[{bearerAuth:[]}],
  paths:{
    "/flights/search":{post:{
      operationId:"searchNestiFlights",summary:"Search flights available to KINGS NESTI",
      description:"30 requests/minute per credential per API process; at most 2 concurrent searches. Shared authentication protection: 300 attempts/minute per process. Fixed windows reset on process restart. Retry-After is returned on 429. No inventory holds. Only EUR. Up to 9 seated passengers, at least 1 adult; infants <= adults and do not consume seats. Optional return_date searches reverse direction independently; pair choices and add segment totals in the bot. All flight times use the system's Europe/Tirane wall-clock convention, not airport-local or UTC. No live Google requests are performed.",
      requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/Search"},
        example:{from:"TIA",to:"BGY",departure_date:"2027-01-15",adults:1,children:0,infants:0,currency:"EUR"}}}},
      responses:{
        "200":{description:"Search completed. Empty segment arrays mean no eligible results; not a provider error.",
          content:{"application/json":{schema:{$ref:"#/components/schemas/SearchResponse"}}}},
        "400":{description:"INVALID_REQUEST — invalid JSON fields, IATA, dates, currency, passenger counts or unknown parameter",content:{"application/json":{schema:{$ref:"#/components/schemas/Error"}}}},
        "401":{description:"UNAUTHORIZED — missing, invalid or revoked Bearer credential",content:{"application/json":{schema:{$ref:"#/components/schemas/Error"}}}},
        "403":{description:"AGENCY_UNAVAILABLE — agency inactive/deleted or group missing",content:{"application/json":{schema:{$ref:"#/components/schemas/Error"}}}},
        "429":{description:"RATE_LIMITED or BUSY",headers:{"Retry-After":{description:"Seconds before retry",schema:{type:"integer"}}},
          content:{"application/json":{schema:{$ref:"#/components/schemas/Error"}}}},
        "503":{description:"SEARCH_UNAVAILABLE — temporary failure; never interpret as zero flights",content:{"application/json":{schema:{$ref:"#/components/schemas/Error"}}}},
      },
    }},
  },
  components:{
    securitySchemes:{bearerAuth:{type:"http",scheme:"bearer",description:"Dedicated nsk_ credential. Store only in Render ALBANIA_SKY_API_KEY; never put into prompts, query strings or client-side code."}},
    schemas:{
      Search:{type:"object",additionalProperties:false,required:["from","to","departure_date"],properties:{
        from:airport,to:airport,departure_date:date,return_date:date,
        adults:{type:"integer",minimum:1,maximum:9,default:1},
        children:{type:"integer",minimum:0,maximum:8,default:0},
        infants:{type:"integer",minimum:0,maximum:9,default:0},
        currency:{type:"string",enum:["EUR"],default:"EUR"},
      }},
      SearchResponse:{type:"object",required:["agency","currency","generated_at","request","outbound","inbound","notice"],properties:{
        agency:{type:"string",enum:["KINGS NESTI"]},currency:{type:"string",enum:["EUR"]},
        generated_at:{type:"string",format:"date-time"},request:{$ref:"#/components/schemas/Search"},
        outbound:{type:"array",items:{$ref:"#/components/schemas/Flight"}},
        inbound:{type:"array",items:{$ref:"#/components/schemas/Flight"}},
        notice:{type:"string"},
      }},
      Flight:{type:"object",additionalProperties:false,required:["id","airline","flight_number","from","to","departure_date","departure_time","arrival_date","arrival_time","time_zone","available_seats","pricing","baggage"],properties:{
        id:{type:"integer"},airline:{type:"string"},flight_number:{type:"string"},from:airport,to:airport,
        departure_date:date,arrival_date:date,departure_time:{type:"string",example:"13:00"},
        arrival_time:{type:"string",example:"15:00"},time_zone:{type:"string",enum:["Europe/Tirane"]},
        available_seats:{type:"integer",minimum:1},
        pricing:{type:"object",required:["currency","basis","adult_ticket","child_ticket","infant_ticket","tax_per_passenger","tickets_total","taxes_total","total","extras_included"],properties:{
          currency:{type:"string",enum:["EUR"]},basis:{type:"string",enum:["agency_portal"]},
          adult_ticket:money,child_ticket:money,infant_ticket:money,tax_per_passenger:money,
          tickets_total:money,taxes_total:money,total:money,extras_included:{type:"boolean",enum:[false]},
        }},
        baggage:{type:"object",properties:{
          cabin_kg:{...money,nullable:true},checked_count:{type:"integer",nullable:true},
          checked_kg:{...money,nullable:true},checked_price:{...money,nullable:true},
        }},
      }},
      Error:{type:"object",required:["error"],properties:{error:{type:"object",required:["code","message"],
        properties:{code:{type:"string"},message:{type:"string"}}}}},
    },
  },
};
