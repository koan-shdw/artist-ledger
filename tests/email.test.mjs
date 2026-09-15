import test from 'node:test';
import assert from 'node:assert/strict';
import {demoLedger} from '../app/lib/ledger.ts';
const rows=[];let requests=[];let fail=false;
globalThis.__ledgerTestDb={artistReport:{async findUnique({where}){const k=where.shop_month_artistId;return rows.find(r=>r.shop===k.shop&&r.month===k.month&&r.artistId===k.artistId)||null},async create({data}){if(rows.some(r=>r.shop===data.shop&&r.month===data.month&&r.artistId===data.artistId))throw Error('Duplicate');const row={...data,createdAt:new Date()};rows.push(row);return row},async update({where,data}){const row=rows.find(r=>r.id===where.id);Object.assign(row,data);return row}}};
process.env.RESEND_API_KEY='test-only';process.env.EMAIL_FROM='test@example.com';
globalThis.fetch=async(url,options)=>{requests.push({url,options,body:JSON.parse(options.body)});if(fail)throw Error('Simulated network failure');return Response.json({id:'mock-'+options.headers['Idempotency-Key']})};
const {sendReports}=await import('./.generated/email.mjs');
test('sending isolates shops, recipients, and months and skips duplicates',async()=>{rows.length=0;requests=[];const d=demoLedger();const first=await sendReports('one.myshopify.com',d,'2026-06',['a0']);assert.equal(first.sent,1);assert.deepEqual(requests[0].body.to,['alex.morgan@example.com']);assert.match(requests[0].body.subject,/June 2026/);assert.doesNotMatch(requests[0].body.text,/Yuki/);const again=await sendReports('one.myshopify.com',d,'2026-06',['a0']);assert.equal(again.skipped,1);assert.equal(requests.length,1);await sendReports('two.myshopify.com',d,'2026-06',['a0']);assert.equal(requests.length,2);assert.notEqual(requests[0].options.headers['Idempotency-Key'],requests[1].options.headers['Idempotency-Key'])});
test('uncertain delivery retries the frozen body and idempotency key',async()=>{rows.length=0;requests=[];fail=true;const d=demoLedger();d.settings.replyTo='first@example.com';await sendReports('one.myshopify.com',d,'2026-07',['a0']);d.artists[0].email='changed@example.com';d.artists[0].galleryBps=9000;d.settings.replyTo='changed@example.com';fail=false;await sendReports('one.myshopify.com',d,'2026-07',['a0']);assert.deepEqual(requests[1].body,requests[0].body);assert.equal(requests[1].options.headers['Idempotency-Key'],requests[0].options.headers['Idempotency-Key'])});
test('expired uncertain deliveries require reconciliation',async()=>{rows.length=0;requests=[];fail=true;const d=demoLedger();await sendReports('one.myshopify.com',d,'2026-08',['a0']);rows[0].createdAt=new Date(Date.now()-25*60*60*1000);fail=false;const result=await sendReports('one.myshopify.com',d,'2026-08',['a0']);assert.equal(requests.length,1);assert.equal(result.sent,0);assert.match(result.failures[0],/manual reconciliation/)});

test('manual ranges are independent of monthly delivery and retry without duplicates',async()=>{
 rows.length=0;requests=[];fail=false;const d=demoLedger();
 await sendReports('one.myshopify.com',d,'2026-08',['a0']);
 d.artists[0].enabled=false; d.artists[0].automatic=false;
 const context={from:'2026-07',to:'2026-08',version:3};
 const first=await sendReports('one.myshopify.com',d,'2026-07',['a0'],context);
 assert.equal(first.sent,1);assert.equal(rows.length,2);
 assert.match(requests[1].body.subject,/July 2026.*August 2026/);
 assert.equal(JSON.parse(rows[1].snapshot).lines.length, d.months['2026-07'].lines.filter(l=>d.products.find(p=>p.id===l.productId)?.artistId==='a0'&&d.products.find(p=>p.id===l.productId)?.included&&!d.months['2026-07'].excluded.includes(l.id)).length+JSON.parse(rows[0].snapshot).lines.length);
 assert.equal((await sendReports('one.myshopify.com',d,'2026-07',['a0'],context)).skipped,1);
 assert.equal(requests.length,2);
});
