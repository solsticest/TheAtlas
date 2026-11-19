import type { ChronicleEventRecord } from '@atlas/shared';

export type ChronicleFilterState={
  query:string;
  worldIds:string[];
  tags:string[];
  significances:ChronicleEventRecord['significance'][];
  kinds:ChronicleEventRecord['kind'][];
  visibilities:ChronicleEventRecord['visibility'][];
};

export function emptyChronicleFilters():ChronicleFilterState{
  return {query:'',worldIds:[],tags:[],significances:[],kinds:[],visibilities:[]};
}

const normalize=(value:string)=>value.trim().toLocaleLowerCase('ru');

export function chronicleFilterCount(filters:ChronicleFilterState){
  return (filters.query.trim()?1:0)+filters.worldIds.length+filters.tags.length+
    filters.significances.length+filters.kinds.length+filters.visibilities.length;
}

export function chronicleEventMatches(event:ChronicleEventRecord,filters:ChronicleFilterState){
  const query=normalize(filters.query);
  if(query){
    const haystack=[
      event.title,event.summary,event.article,
      ...event.tags.map(tag=>tag.name),
      ...event.worlds.map(world=>world.name),
    ].join(' ').toLocaleLowerCase('ru');
    if(!haystack.includes(query))return false;
  }
  if(filters.worldIds.length&&!event.worlds.some(world=>filters.worldIds.includes(world.id)))return false;
  if(filters.tags.length){
    const selectedTags=new Set(filters.tags.map(normalize));
    if(!event.tags.some(tag=>selectedTags.has(normalize(tag.name))))return false;
  }
  if(filters.significances.length&&!filters.significances.includes(event.significance))return false;
  if(filters.kinds.length&&!filters.kinds.includes(event.kind))return false;
  if(filters.visibilities.length&&!filters.visibilities.includes(event.visibility))return false;
  return true;
}

export function filterChronicleEvents(events:ChronicleEventRecord[],filters:ChronicleFilterState){
  return events.filter(event=>chronicleEventMatches(event,filters));
}

export function chronicleTagOptions(events:ChronicleEventRecord[]){
  const names=new Map<string,string>();
  for(const event of events){
    for(const tag of event.tags){
      const key=normalize(tag.name);
      if(key&&!names.has(key))names.set(key,tag.name);
    }
  }
  return [...names.values()].sort((a,b)=>a.localeCompare(b,'ru'));
}

export function toggleFilterValue<T extends string>(values:T[],value:T){
  return values.includes(value)?values.filter(item=>item!==value):[...values,value];
}
