import {
  CHRONICLE_MONTHS, DAYS_PER_WEEK, DAYS_PER_YEAR, dayToChronicleDate,
  formatChronicleYearBoundary,
} from './calendar';

export const MIN_TIMELINE_SCALE=.0025;
export const MAX_TIMELINE_SCALE=72;
export const DEFAULT_TIMELINE_SCALE=.08;

export type TimelineGranularity='years'|'months'|'weeks'|'days';
export type TimelineTickKind='year'|'month'|'week'|'day';
export type TimelineTick={
  day:number;
  label:string;
  secondary?:string;
  major:boolean;
  kind:TimelineTickKind;
};

const MONTH_OFFSETS=CHRONICLE_MONTHS.map((_month,index)=>
  CHRONICLE_MONTHS.slice(0,index).reduce((sum,month)=>sum+month.days,0));

export function timelineGranularity(scale:number):TimelineGranularity{
  if(scale>=18)return 'days';
  if(scale>=4)return 'weeks';
  if(scale>=.7)return 'months';
  return 'years';
}

export function timelineGranularityLabel(value:TimelineGranularity){
  if(value==='days')return 'Дни';
  if(value==='weeks')return 'Недели';
  if(value==='months')return 'Месяцы';
  return 'Годы';
}

function yearStep(scale:number){
  const candidates=[1,2,5,10,25,50,100,250,500,1000,2500];
  return candidates.find(years=>years*DAYS_PER_YEAR*scale>=86)??5000;
}

function yearTicks(start:number,end:number,scale:number):TimelineTick[]{
  const years=yearStep(scale),step=years*DAYS_PER_YEAR;
  const first=Math.floor(start/step)*step;
  const result:TimelineTick[]=[];
  for(let day=first;day<=end+step;day+=step){
    result.push({
      day,label:formatChronicleYearBoundary(day),kind:'year',
      major:years>=10||Math.abs(Math.round(day/DAYS_PER_YEAR))%5===0,
    });
  }
  return result;
}

function monthTicks(start:number,end:number):TimelineTick[]{
  const result:TimelineTick[]=[];
  const firstYear=Math.floor((start-DAYS_PER_YEAR)/DAYS_PER_YEAR)*DAYS_PER_YEAR;
  for(let yearStart=firstYear;yearStart<=end+DAYS_PER_YEAR;yearStart+=DAYS_PER_YEAR){
    for(let monthIndex=0;monthIndex<CHRONICLE_MONTHS.length;monthIndex++){
      const day=yearStart+MONTH_OFFSETS[monthIndex]!;
      if(day<start-60||day>end+60)continue;
      const month=CHRONICLE_MONTHS[monthIndex]!;
      result.push({
        day,kind:'month',label:month.name,
        secondary:monthIndex===0?formatChronicleYearBoundary(yearStart):undefined,
        major:monthIndex===0||month.season==='Излом',
      });
    }
  }
  return result;
}

function weekTicks(start:number,end:number):TimelineTick[]{
  const result:TimelineTick[]=[];
  const first=Math.floor(start/DAYS_PER_WEEK)*DAYS_PER_WEEK;
  for(let day=first;day<=end+DAYS_PER_WEEK;day+=DAYS_PER_WEEK){
    const date=dayToChronicleDate(day);
    result.push({day,kind:'week',label:String(date.day),major:false});
  }
  return result;
}

function dayTicks(start:number,end:number):TimelineTick[]{
  const result:TimelineTick[]=[];
  for(let day=Math.floor(start);day<=Math.ceil(end)+1;day++){
    const date=dayToChronicleDate(day);
    result.push({
      day,kind:'day',label:String(date.day),
      major:date.day===1||date.day%5===0,
    });
  }
  return result;
}

export function timelineTicks(center:number,width:number,scale:number):TimelineTick[]{
  if(width<=0||scale<=0)return[];
  const start=center-width/(2*scale);
  const end=center+width/(2*scale);
  const granularity=timelineGranularity(scale);
  if(granularity==='years')return yearTicks(start,end,scale);
  const months=monthTicks(start,end);
  if(granularity==='months')return months;
  if(granularity==='weeks')return [...months,...weekTicks(start,end)].sort((a,b)=>a.day-b.day);
  return [...months,...dayTicks(start,end)].sort((a,b)=>a.day-b.day);
}

export function visibleRangeLabel(width:number,scale:number){
  if(width<=0||scale<=0)return '';
  const days=width/scale;
  if(days>=DAYS_PER_YEAR*2)return '≈ '+Math.max(1,Math.round(days/DAYS_PER_YEAR))+' лет на экране';
  if(days>=90)return '≈ '+Math.max(1,Math.round(days/45))+' месяцев на экране';
  if(days>=21)return '≈ '+Math.max(1,Math.round(days/DAYS_PER_WEEK))+' недель на экране';
  return '≈ '+Math.max(1,Math.round(days))+' дней на экране';
}

export function dayAtViewportX(center:number,width:number,scale:number,x:number){
  return center+(x-width/2)/scale;
}

export function drillInScale(granularity:TimelineGranularity,current:number){
  if(granularity==='years')return Math.max(current,1.1);
  if(granularity==='months')return Math.max(current,6);
  if(granularity==='weeks')return Math.max(current,24);
  return Math.min(MAX_TIMELINE_SCALE,current*1.6);
}
