import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const live=process.argv.includes('--live');
let source=readFileSync('scripts/verify_mobile_scroll.js','utf8');
if(live)source=source.replace('http://127.0.0.1:4173/','https://hidrocultiv.ar/');
const raw=execFileSync('npx',['--yes','@playwright/cli','-s=cultivar-growth','--raw','run-code',source],{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
const result=JSON.parse(raw);
writeFileSync('artifacts/mobile-scroll-'+(live?'live':'local')+'-checks.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({live,checks:result.checks.length,failed:result.checks.filter(c=>!c.passed),errors:result.errors}));
