export const chatbotAdminHtml = `<!doctype html>
<html lang="sq"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>API Chatbot — NESTI</title>
<style>body{font:16px system-ui;background:#edf0f4;color:#182a40;margin:0;padding:40px 20px}main{max-width:720px;margin:auto;background:white;border:1px solid #d7dde5;border-radius:12px;padding:30px}h1{font-size:25px}p{line-height:1.6}button{padding:12px 18px;border:0;border-radius:6px;background:#173a62;color:white;cursor:pointer;margin:5px}button:disabled{opacity:.5}textarea{width:100%;box-sizing:border-box;padding:12px;margin:12px 0;font:14px monospace}#status{padding:12px;background:#f0f4f8}small{color:#516176}a{color:#164e85}</style>
<main><h1>API Chatbot · KINGS NESTI</h1>
<p>Vetëm kërkim fluturimesh, me lejet dhe çmimet e agjencisë. Nuk lejon rezervime, pagesa apo ndryshime. API-ja e partnerëve mbetet e veçantë.</p>
<p id="status">Duke kontrolluar…</p>
<button id="create">Krijo / zëvendëso çelësin</button><button id="revoke">Çaktivizo çelësin</button>
<section id="secret" hidden><strong>Çelësi shfaqet vetëm këtë herë.</strong>
<textarea id="token" readonly rows="3" autocomplete="off" spellcheck="false"></textarea>
<button id="copy">Kopjo çelësin</button>
<p>Vendose në Render si <b>ALBANIA_SKY_API_KEY</b>. Mos e vendos në kod, dokumentacion apo bisedën me Claude. Rifreskimi i kësaj faqeje e heq çelësin nga ekrani.</p></section>
<p><a href="./openapi.json">Shkarko specifikimin OpenAPI</a></p>
<small>POST /api/chatbot/v1/flights/search · Authorization: Bearer · 30 kërkesa/minutë · EUR</small></main>
<script>
const base=location.pathname.replace(/\\/admin\\/?$/,"");
const status=document.querySelector("#status"), token=document.querySelector("#token");
async function call(method) {
 const r=await fetch(base+"/credential",{method,credentials:"same-origin",headers:{"X-Chatbot-Admin":"1"}});
 const d=await r.json(); if(!r.ok)throw Error(d.error||"Kërkesa dështoi"); return d;
}
async function refresh(){const d=await call("GET");status.textContent=d.enabled?"API aktive · KINGS NESTI":"API joaktive — krijoni një çelës."}
async function action(method){
 if(!confirm(method==="POST"?"Çelësi i mëparshëm, nëse ekziston, do të çaktivizohet. Vazhdo?":"Të çaktivizohet aksesi i chatbot-it?"))return;
 document.querySelectorAll("button").forEach(b=>b.disabled=true);
 token.value="";document.querySelector("#secret").hidden=true;
 try{const d=await call(method);if(d.api_key){token.value=d.api_key;document.querySelector("#secret").hidden=false;}await refresh();}
 catch(e){status.textContent=e.message;}finally{document.querySelectorAll("button").forEach(b=>b.disabled=false);}
}
document.querySelector("#create").onclick=()=>action("POST");
document.querySelector("#revoke").onclick=()=>action("DELETE");
document.querySelector("#copy").onclick=async()=>{try{await navigator.clipboard.writeText(token.value);status.textContent="Çelësi u kopjua."}catch{status.textContent="Përzgjidhni dhe kopjoni çelësin nga fusha."}};
refresh().catch(e=>status.textContent=e.message);
</script></html>`;
