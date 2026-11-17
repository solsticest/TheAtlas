'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');

test('Chronicle calendar has eight 45-day months plus 14-day Rift',async()=>{
  const c=await import('../apps/web/src/chronicle/calendar.ts');
  assert.equal(c.CHRONICLE_MONTHS.length,9);
  assert.equal(c.DAYS_PER_YEAR,374);
  assert.equal(c.DAYS_PER_WEEK,7);
  assert.deepEqual(c.CHRONICLE_MONTHS.map(m=>m.days),[45,45,45,45,45,45,45,45,14]);
});
test('AS and BS form one continuous day axis without year zero',async()=>{
  const c=await import('../apps/web/src/chronicle/calendar.ts');
  assert.equal(c.chronicleDateToDay({era:'AS',year:1,monthIndex:0,day:1}),0);
  assert.equal(c.chronicleDateToDay({era:'BS',year:1,monthIndex:8,day:14}),-1);
  assert.deepEqual(c.dayToChronicleDate(-1),{era:'BS',year:1,monthIndex:8,day:14});
  assert.deepEqual(c.dayToChronicleDate(0),{era:'AS',year:1,monthIndex:0,day:1});
});
test('Chronicle month boundaries and labels are stable',async()=>{
  const c=await import('../apps/web/src/chronicle/calendar.ts');
  const avris=c.chronicleDateToDay({era:'AS',year:1837,monthIndex:1,day:1});
  const ardLast=c.chronicleDateToDay({era:'AS',year:1837,monthIndex:0,day:45});
  assert.equal(avris-ardLast,1);
  assert.equal(c.formatChronicleYearBoundary(c.startOfYear('AS',1837)),'1837 AS');
  assert.equal(c.formatChronicleYearBoundary(c.startOfYear('BS',1837)),'1837 BS');
  assert.equal(c.formatChronicleDate({era:'AS',year:1837,monthIndex:8,day:14}),'14 Излома, 1837 AS');
});
