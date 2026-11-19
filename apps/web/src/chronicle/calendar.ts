export const DAYS_PER_WEEK=7;
export const CURRENT_YEAR=1837;

export const CHRONICLE_MONTHS=[
  {name:'Ард',dateName:'Арда',season:'Весна',days:45},
  {name:'Аврис',dateName:'Авриса',season:'Весна',days:45},
  {name:'Одра',dateName:'Одры',season:'Лето',days:45},
  {name:'Сол',dateName:'Сола',season:'Лето',days:45},
  {name:'Вайрен',dateName:'Вайрена',season:'Осень',days:45},
  {name:'Марин',dateName:'Марина',season:'Осень',days:45},
  {name:'Ундра',dateName:'Ундры',season:'Зима',days:45},
  {name:'Нокт',dateName:'Нокта',season:'Зима',days:45},
  {name:'Излом',dateName:'Излома',season:'Излом',days:14},
] as const;

export const DAYS_PER_YEAR=CHRONICLE_MONTHS.reduce((sum,month)=>sum+month.days,0);

export type ChronicleEra='AS'|'BS';
export type ChronicleDate={era:ChronicleEra;year:number;monthIndex:number;day:number};

function assertDate(date:ChronicleDate){
  if(!Number.isInteger(date.year)||date.year<1)throw Error('Chronicle has no year zero');
  const month=CHRONICLE_MONTHS[date.monthIndex];
  if(!month)throw Error('Unknown Chronicle month');
  if(!Number.isInteger(date.day)||date.day<1||date.day>month.days)throw Error('Invalid Chronicle day');
}
export function dayOfYear(date:ChronicleDate){
  assertDate(date);
  let result=date.day-1;
  for(let index=0;index<date.monthIndex;index++)result+=CHRONICLE_MONTHS[index]!.days;
  return result;
}
export function chronicleDateToDay(date:ChronicleDate){
  const offset=dayOfYear(date);
  return date.era==='AS'?(date.year-1)*DAYS_PER_YEAR+offset:-date.year*DAYS_PER_YEAR+offset;
}
export function dayToChronicleDate(absoluteDay:number):ChronicleDate{
  if(!Number.isFinite(absoluteDay))throw Error('Chronicle day must be finite');
  const whole=Math.floor(absoluteDay);
  let era:ChronicleEra,year:number,offset:number;
  if(whole>=0){
    era='AS';year=Math.floor(whole/DAYS_PER_YEAR)+1;offset=whole-(year-1)*DAYS_PER_YEAR;
  }else{
    era='BS';year=Math.floor((-whole-1)/DAYS_PER_YEAR)+1;offset=whole+year*DAYS_PER_YEAR;
  }
  let monthIndex=0;
  while(monthIndex<CHRONICLE_MONTHS.length-1&&offset>=CHRONICLE_MONTHS[monthIndex]!.days){offset-=CHRONICLE_MONTHS[monthIndex]!.days;monthIndex++;}
  return {era,year,monthIndex,day:offset+1};
}
export function formatChronicleDate(value:ChronicleDate){
  assertDate(value);
  return value.day+' '+CHRONICLE_MONTHS[value.monthIndex]!.dateName+', '+value.year+' '+value.era;
}
export function formatChronicleYearBoundary(absoluteDay:number){
  const index=Math.round(absoluteDay/DAYS_PER_YEAR);
  return index>=0?(index+1)+' AS':(-index)+' BS';
}
export function startOfYear(era:ChronicleEra,year:number){
  if(!Number.isInteger(year)||year<1)throw Error('Chronicle has no year zero');
  return era==='AS'?(year-1)*DAYS_PER_YEAR:-year*DAYS_PER_YEAR;
}
