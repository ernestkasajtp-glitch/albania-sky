import {readFileSync} from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {build} from "esbuild";
import pino from "esbuild-plugin-pino";
globalThis.require=createRequire(import.meta.url);
const root=process.cwd();
const original=readFileSync("build.mjs","utf8");
const externals=Function("return "+original.match(/const externals = (\[[\s\S]*?\]);/)[1])();
const live=JSON.parse(readFileSync("/tmp/nesti-live-api.map","utf8"));
const preserve=new Map();
for(let i=0;i<live.sources.length;i++){
  if(/\/src\/lib\/(pnlImport|cron)\.ts$/.test(live.sources[i])){
    preserve.set(path.resolve(root,"dist",live.sources[i]),live.sourcesContent[i]);
  }
}
if(preserve.size!==2)throw Error("Missing live import/cron source; refuse mixed deployment");
const outdir=path.resolve(root,"../../generated-artifacts/nesti-release/api");
const banner={js:`import {createRequire as __bannerCrReq} from 'node:module';import __bannerPath from 'node:path';import __bannerUrl from 'node:url';globalThis.require=__bannerCrReq(import.meta.url);globalThis.__filename=__bannerUrl.fileURLToPath(import.meta.url);globalThis.__dirname=__bannerPath.dirname(globalThis.__filename);`};
const common={platform:"node",bundle:true,format:"esm",external:externals,sourcemap:"linked",banner,logLevel:"info"};
await build({...common,entryPoints:["src/index.ts"],outdir,outExtension:{".js":".mjs"},plugins:[
  {name:"preserve-live-unrelated-sources",setup(b){b.onLoad({filter:/\/(pnlImport|cron)\.ts$/},args=>{
    const contents=preserve.get(args.path);
    if(contents===undefined)throw Error("Unexpected source "+args.path);
    return {contents,loader:"ts",resolveDir:path.dirname(args.path)};
  });}},
  pino({transports:["pino-pretty"]}),
]});
await build({...common,entryPoints:["src/lib/excelWorker.ts"],outfile:path.join(outdir,"excelWorker.mjs")});
const release=JSON.parse(readFileSync(path.join(outdir,"index.mjs.map"),"utf8"));
const previous=new Map(live.sources.map((s,i)=>[path.resolve(root,"dist",s),live.sourcesContent[i]]));
const changes=[];
for(let i=0;i<release.sources.length;i++){
  const p=path.resolve(outdir,release.sources[i]);
  if(p.includes("/node_modules/")||!p.includes("/src/") ||
      !(p.startsWith(path.resolve(root,"../../lib")+"/") || p.startsWith(root+"/src/")))continue;
  if(previous.get(p)!==release.sourcesContent[i]){
    const relative=path.relative(root,p);
    if(!/^src\/(routes\/(index|public|chatbot)\.ts|lib\/chatbot[A-Za-z]+\.ts)$/.test(relative))
      throw Error("Unexpected production change: "+relative);
    changes.push(relative);
  }
}
console.log("Verified isolated release:",changes.join(", "));
