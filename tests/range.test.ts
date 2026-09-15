import test from 'node:test';
import assert from 'node:assert/strict';
import {demoLedger, rangeReport, reportFor, monthsBetween, ledgerSchema} from '../app/lib/ledger.ts';
test('range reports sum monthly amounts and preserve source adjustments',()=>{
 const d=demoLedger();const source=structuredClone(d);const r=rangeReport(d,'2026-07','2026-08','a0');
 const a=reportFor(d,'2026-07','a0'),b=reportFor(d,'2026-08','a0');
 assert.equal(r.net,a.net+b.net);assert.equal(r.gallery,a.gallery+b.gallery);assert.equal(r.payout,a.payout+b.payout);assert.equal(r.lines.length,a.lines.length+b.lines.length);assert.deepEqual(d,source);
 assert.ok(rangeReport(d,'2026-01','2026-08','a0').errors.some(e=>e.includes('Sync sales')));
 assert.deepEqual(monthsBetween('2025-12','2026-02'),['2025-12','2026-01','2026-02']);assert.throws(()=>monthsBetween('2026-08','2026-07'));
 d.artists[0].automatic=true;d.artists[0].enabled=false;assert.equal(ledgerSchema.parse(d).artists[0].automatic,true);
});
