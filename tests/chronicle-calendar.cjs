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


test('Chronicle timeline changes semantic detail as the user zooms',async()=>{
  const t=await import('../apps/web/src/chronicle/timeline.ts');
  assert.equal(t.timelineGranularity(.08),'years');
  assert.equal(t.timelineGranularity(1),'months');
  assert.equal(t.timelineGranularity(6),'weeks');
  assert.equal(t.timelineGranularity(24),'days');
  assert.ok(t.drillInScale('years',.08)>=.7);
  assert.ok(t.drillInScale('months',1)>=4);
  assert.ok(t.drillInScale('weeks',6)>=18);
});
test('Chronicle timeline exposes real month, week and day boundaries',async()=>{
  const c=await import('../apps/web/src/chronicle/calendar.ts');
  const t=await import('../apps/web/src/chronicle/timeline.ts');
  const center=c.chronicleDateToDay({era:'AS',year:1837,monthIndex:0,day:23});
  const monthTicks=t.timelineTicks(center,900,1);
  const monthNames=monthTicks.filter(item=>item.kind==='month').map(item=>item.label);
  assert.ok(monthNames.includes('Ард'));
  assert.ok(monthNames.includes('Аврис'));
  const weekTicks=t.timelineTicks(center,900,6);
  assert.ok(weekTicks.some(item=>item.kind==='week'));
  const dayTicks=t.timelineTicks(center,900,24);
  assert.ok(dayTicks.some(item=>item.kind==='day'&&item.label==='23'));
  assert.ok(dayTicks.some(item=>item.kind==='month'&&item.label==='Ард'));
});
test('Timeline cursor math keeps the date under the pointer stable',async()=>{
  const t=await import('../apps/web/src/chronicle/timeline.ts');
  const center=1000,width=1000,scale=2;
  assert.equal(t.dayAtViewportX(center,width,scale,width/2),center);
  assert.equal(t.dayAtViewportX(center,width,scale,width/2+200),center+100);
});
