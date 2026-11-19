import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import {
  worldSchema, layerSchema, locationSchema, markerTypeSchema, searchItemSchema,
  timelineRecordSchema, eraRecordSchema, eventRecordSchema, chronicleEventSchema,
  mythosPantheonSchema, mythosDeitySchema, mythosRelationSchema, mythosMythSchema,
  mythosBeliefSchema, mythosSacredSiteSchema, mythosChronicleLinkSchema,
  mythosCosmicNodeSchema, mythosCosmicLinkSchema, mythosLocationRefSchema,
  type WorldRecord, type LayerRecord, type LocationRecord, type MarkerTypeRecord, type SearchItem,
  type TimelineRecord, type EraRecord, type EventRecord, type ChronicleEventRecord, type ChronicleEventInput,
  type MythosPantheonRecord, type MythosPantheonInput, type MythosDeityRecord, type MythosDeityInput,
  type MythosRelationRecord, type MythosRelationInput, type MythosMythRecord, type MythosMythInput,
  type MythosBeliefRecord, type MythosBeliefInput, type MythosSacredSiteRecord, type MythosSacredSiteInput,
  type MythosChronicleLinkRecord, type MythosChronicleLinkInput,
  type MythosCosmicNodeRecord, type MythosCosmicNodeInput,
  type MythosCosmicLinkRecord, type MythosCosmicLinkInput, type MythosLocationRef,
} from '@atlas/shared';

export const atlasApi = createApi({
  reducerPath: 'atlasApi',
  tagTypes: ['ChronicleEvent','MythosPantheon','MythosDeity','MythosRelation','MythosMyth',
    'MythosBelief','MythosSite','MythosHistory','MythosCosmology'],
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  endpoints: (build) => ({
    worlds: build.query<WorldRecord[], void>({
      query: () => 'worlds',
      transformResponse: (payload: unknown) => worldSchema.array().parse(payload),
    }),
    markerTypes: build.query<MarkerTypeRecord[], void>({
      query: () => 'types',
      transformResponse: (payload: unknown) => markerTypeSchema.array().parse(payload),
    }),
    layers: build.query<LayerRecord[], string>({
      query: (worldId) => 'worlds/' + encodeURIComponent(worldId) + '/layers',
      transformResponse: (payload: unknown) => layerSchema.array().parse(payload),
    }),
    locations: build.query<LocationRecord[], string>({
      query: (worldId) => 'worlds/' + encodeURIComponent(worldId) + '/locations',
      transformResponse: (payload: unknown) => locationSchema.array().parse(payload),
    }),
    timelines: build.query<TimelineRecord[], string>({
      query: (worldId) => 'worlds/' + encodeURIComponent(worldId) + '/timelines',
      transformResponse: (payload: unknown) => timelineRecordSchema.array().parse(payload),
    }),
    eras: build.query<EraRecord[], string>({
      query: (timelineId) => 'timelines/' + encodeURIComponent(timelineId) + '/eras',
      transformResponse: (payload: unknown) => eraRecordSchema.array().parse(payload),
    }),
    events: build.query<EventRecord[], string>({
      query: (eraId) => 'eras/' + encodeURIComponent(eraId) + '/events',
      transformResponse: (payload: unknown) => eventRecordSchema.array().parse(payload),
    }),
    chronicleEvents: build.query<ChronicleEventRecord[], void>({
      query: () => 'chronicle/events',
      transformResponse: (payload: unknown) => chronicleEventSchema.array().parse(payload),
      providesTags: ['ChronicleEvent'],
    }),
    createChronicleEvent: build.mutation<ChronicleEventRecord,{input:ChronicleEventInput;csrf:string}>({
      query: ({input,csrf}) => ({
        url: 'admin/chronicle/events', method: 'POST', body: input,
        headers: {'x-csrf-token': csrf},
      }),
      transformResponse: (payload: unknown) => chronicleEventSchema.parse(payload),
      invalidatesTags: ['ChronicleEvent'],
    }),
    updateChronicleEvent: build.mutation<ChronicleEventRecord,{id:string;input:ChronicleEventInput;csrf:string}>({
      query: ({id,input,csrf}) => ({
        url: 'admin/chronicle/events/' + encodeURIComponent(id), method: 'PATCH', body: input,
        headers: {'x-csrf-token': csrf},
      }),
      transformResponse: (payload: unknown) => chronicleEventSchema.parse(payload),
      invalidatesTags: ['ChronicleEvent'],
    }),
    deleteChronicleEvent: build.mutation<{ok:true},{id:string;csrf:string}>({
      query: ({id,csrf}) => ({
        url: 'admin/chronicle/events/' + encodeURIComponent(id), method: 'DELETE',
        headers: {'x-csrf-token': csrf},
      }),
      invalidatesTags: ['ChronicleEvent'],
    }),
    mythosPantheons: build.query<MythosPantheonRecord[],void>({
      query:()=> 'mythos/pantheons',
      transformResponse:(value:unknown)=>mythosPantheonSchema.array().parse(value),
      providesTags:['MythosPantheon'],
    }),
    mythosDeities: build.query<MythosDeityRecord[],void>({
      query:()=> 'mythos/deities',
      transformResponse:(value:unknown)=>mythosDeitySchema.array().parse(value),
      providesTags:['MythosDeity'],
    }),
    createMythosPantheon: build.mutation<MythosPantheonRecord,{input:MythosPantheonInput;csrf:string}>({
      query:({input,csrf})=>({url:'admin/mythos/pantheons',method:'POST',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosPantheonSchema.parse(value),
      invalidatesTags:['MythosPantheon'],
    }),
    updateMythosPantheon: build.mutation<MythosPantheonRecord,{id:string;input:MythosPantheonInput;csrf:string}>({
      query:({id,input,csrf})=>({url:'admin/mythos/pantheons/'+encodeURIComponent(id),
        method:'PATCH',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosPantheonSchema.parse(value),
      invalidatesTags:['MythosPantheon','MythosDeity'],
    }),
    deleteMythosPantheon: build.mutation<{ok:true},{id:string;csrf:string}>({
      query:({id,csrf})=>({url:'admin/mythos/pantheons/'+encodeURIComponent(id),method:'DELETE',
        headers:{'x-csrf-token':csrf}}),
      invalidatesTags:['MythosPantheon','MythosDeity'],
    }),
    createMythosDeity: build.mutation<MythosDeityRecord,{input:MythosDeityInput;csrf:string}>({
      query:({input,csrf})=>({url:'admin/mythos/deities',method:'POST',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosDeitySchema.parse(value),
      invalidatesTags:['MythosDeity'],
    }),
    updateMythosDeity: build.mutation<MythosDeityRecord,{id:string;input:MythosDeityInput;csrf:string}>({
      query:({id,input,csrf})=>({url:'admin/mythos/deities/'+encodeURIComponent(id),
        method:'PATCH',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosDeitySchema.parse(value),
      invalidatesTags:['MythosDeity'],
    }),
    deleteMythosDeity: build.mutation<{ok:true},{id:string;csrf:string}>({
      query:({id,csrf})=>({url:'admin/mythos/deities/'+encodeURIComponent(id),
        method:'DELETE',headers:{'x-csrf-token':csrf}}),
      invalidatesTags:['MythosDeity'],
    }),
    mythosRelations: build.query<MythosRelationRecord[],void>({
      query:()=> 'mythos/relations',
      transformResponse:(value:unknown)=>mythosRelationSchema.array().parse(value),
      providesTags:['MythosRelation'],
    }),
    mythosMyths: build.query<MythosMythRecord[],void>({
      query:()=> 'mythos/myths',
      transformResponse:(value:unknown)=>mythosMythSchema.array().parse(value),
      providesTags:['MythosMyth'],
    }),
    mythosBeliefs: build.query<MythosBeliefRecord[],void>({
      query:()=> 'mythos/beliefs',
      transformResponse:(value:unknown)=>mythosBeliefSchema.array().parse(value),
      providesTags:['MythosBelief'],
    }),
    mythosSites: build.query<MythosSacredSiteRecord[],void>({
      query:()=> 'mythos/sites',
      transformResponse:(value:unknown)=>mythosSacredSiteSchema.array().parse(value),
      providesTags:['MythosSite'],
    }),
    mythosHistoryLinks: build.query<MythosChronicleLinkRecord[],void>({
      query:()=> 'mythos/history-links',
      transformResponse:(value:unknown)=>mythosChronicleLinkSchema.array().parse(value),
      providesTags:['MythosHistory'],
    }),
    mythosCosmicNodes: build.query<MythosCosmicNodeRecord[],void>({
      query:()=> 'mythos/cosmology/nodes',
      transformResponse:(value:unknown)=>mythosCosmicNodeSchema.array().parse(value),
      providesTags:['MythosCosmology'],
    }),
    mythosCosmicLinks: build.query<MythosCosmicLinkRecord[],void>({
      query:()=> 'mythos/cosmology/links',
      transformResponse:(value:unknown)=>mythosCosmicLinkSchema.array().parse(value),
      providesTags:['MythosCosmology'],
    }),
    mythosLocations: build.query<MythosLocationRef[],void>({
      query:()=> 'mythos/locations',
      transformResponse:(value:unknown)=>mythosLocationRefSchema.array().parse(value),
    }),
    createMythosRelation: build.mutation<MythosRelationRecord,{input:MythosRelationInput;csrf:string}>({
      query:({input,csrf})=>({url:'admin/mythos/relations',method:'POST',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosRelationSchema.parse(value),
      invalidatesTags:['MythosRelation'],
    }),
    updateMythosRelation: build.mutation<MythosRelationRecord,{id:string;input:MythosRelationInput;csrf:string}>({
      query:({id,input,csrf})=>({url:'admin/mythos/relations/'+encodeURIComponent(id),method:'PATCH',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosRelationSchema.parse(value),
      invalidatesTags:['MythosRelation'],
    }),
    deleteMythosRelation: build.mutation<{ok:true},{id:string;csrf:string}>({
      query:({id,csrf})=>({url:'admin/mythos/relations/'+encodeURIComponent(id),method:'DELETE',headers:{'x-csrf-token':csrf}}),
      invalidatesTags:['MythosRelation'],
    }),
    createMythosMyth: build.mutation<MythosMythRecord,{input:MythosMythInput;csrf:string}>({
      query:({input,csrf})=>({url:'admin/mythos/myths',method:'POST',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosMythSchema.parse(value),
      invalidatesTags:['MythosMyth'],
    }),
    updateMythosMyth: build.mutation<MythosMythRecord,{id:string;input:MythosMythInput;csrf:string}>({
      query:({id,input,csrf})=>({url:'admin/mythos/myths/'+encodeURIComponent(id),method:'PATCH',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosMythSchema.parse(value),
      invalidatesTags:['MythosMyth'],
    }),
    deleteMythosMyth: build.mutation<{ok:true},{id:string;csrf:string}>({
      query:({id,csrf})=>({url:'admin/mythos/myths/'+encodeURIComponent(id),method:'DELETE',headers:{'x-csrf-token':csrf}}),
      invalidatesTags:['MythosMyth'],
    }),
    createMythosBelief: build.mutation<MythosBeliefRecord,{input:MythosBeliefInput;csrf:string}>({
      query:({input,csrf})=>({url:'admin/mythos/beliefs',method:'POST',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosBeliefSchema.parse(value),
      invalidatesTags:['MythosBelief'],
    }),
    updateMythosBelief: build.mutation<MythosBeliefRecord,{id:string;input:MythosBeliefInput;csrf:string}>({
      query:({id,input,csrf})=>({url:'admin/mythos/beliefs/'+encodeURIComponent(id),method:'PATCH',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosBeliefSchema.parse(value),
      invalidatesTags:['MythosBelief'],
    }),
    deleteMythosBelief: build.mutation<{ok:true},{id:string;csrf:string}>({
      query:({id,csrf})=>({url:'admin/mythos/beliefs/'+encodeURIComponent(id),method:'DELETE',headers:{'x-csrf-token':csrf}}),
      invalidatesTags:['MythosBelief'],
    }),
    createMythosSite: build.mutation<MythosSacredSiteRecord,{input:MythosSacredSiteInput;csrf:string}>({
      query:({input,csrf})=>({url:'admin/mythos/sites',method:'POST',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosSacredSiteSchema.parse(value),
      invalidatesTags:['MythosSite'],
    }),
    updateMythosSite: build.mutation<MythosSacredSiteRecord,{id:string;input:MythosSacredSiteInput;csrf:string}>({
      query:({id,input,csrf})=>({url:'admin/mythos/sites/'+encodeURIComponent(id),method:'PATCH',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosSacredSiteSchema.parse(value),
      invalidatesTags:['MythosSite'],
    }),
    deleteMythosSite: build.mutation<{ok:true},{id:string;csrf:string}>({
      query:({id,csrf})=>({url:'admin/mythos/sites/'+encodeURIComponent(id),method:'DELETE',headers:{'x-csrf-token':csrf}}),
      invalidatesTags:['MythosSite'],
    }),
    upsertMythosHistoryLink: build.mutation<MythosChronicleLinkRecord,{input:MythosChronicleLinkInput;csrf:string}>({
      query:({input,csrf})=>({url:'admin/mythos/history-links',method:'POST',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosChronicleLinkSchema.parse(value),
      invalidatesTags:['MythosHistory'],
    }),
    deleteMythosHistoryLink: build.mutation<{ok:true},{deityId:string;eventId:string;csrf:string}>({
      query:({deityId,eventId,csrf})=>({url:'admin/mythos/history-links/'+encodeURIComponent(deityId)+'/'+encodeURIComponent(eventId),method:'DELETE',headers:{'x-csrf-token':csrf}}),
      invalidatesTags:['MythosHistory'],
    }),
    createMythosCosmicNode: build.mutation<MythosCosmicNodeRecord,{input:MythosCosmicNodeInput;csrf:string}>({
      query:({input,csrf})=>({url:'admin/mythos/cosmology/nodes',method:'POST',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosCosmicNodeSchema.parse(value),
      invalidatesTags:['MythosCosmology'],
    }),
    updateMythosCosmicNode: build.mutation<MythosCosmicNodeRecord,{id:string;input:MythosCosmicNodeInput;csrf:string}>({
      query:({id,input,csrf})=>({url:'admin/mythos/cosmology/nodes/'+encodeURIComponent(id),method:'PATCH',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosCosmicNodeSchema.parse(value),
      invalidatesTags:['MythosCosmology'],
    }),
    deleteMythosCosmicNode: build.mutation<{ok:true},{id:string;csrf:string}>({
      query:({id,csrf})=>({url:'admin/mythos/cosmology/nodes/'+encodeURIComponent(id),method:'DELETE',headers:{'x-csrf-token':csrf}}),
      invalidatesTags:['MythosCosmology'],
    }),
    createMythosCosmicLink: build.mutation<MythosCosmicLinkRecord,{input:MythosCosmicLinkInput;csrf:string}>({
      query:({input,csrf})=>({url:'admin/mythos/cosmology/links',method:'POST',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosCosmicLinkSchema.parse(value),
      invalidatesTags:['MythosCosmology'],
    }),
    updateMythosCosmicLink: build.mutation<MythosCosmicLinkRecord,{id:string;input:MythosCosmicLinkInput;csrf:string}>({
      query:({id,input,csrf})=>({url:'admin/mythos/cosmology/links/'+encodeURIComponent(id),method:'PATCH',body:input,headers:{'x-csrf-token':csrf}}),
      transformResponse:(value:unknown)=>mythosCosmicLinkSchema.parse(value),
      invalidatesTags:['MythosCosmology'],
    }),
    deleteMythosCosmicLink: build.mutation<{ok:true},{id:string;csrf:string}>({
      query:({id,csrf})=>({url:'admin/mythos/cosmology/links/'+encodeURIComponent(id),method:'DELETE',headers:{'x-csrf-token':csrf}}),
      invalidatesTags:['MythosCosmology'],
    }),
    search: build.query<SearchItem[], string>({
      query: (q) => 'search?q=' + encodeURIComponent(q),
      transformResponse: (payload: unknown) => searchItemSchema.array().parse(payload),
    }),
  }),
});

export const {
  useWorldsQuery, useMarkerTypesQuery, useLayersQuery, useLocationsQuery, useSearchQuery,
  useTimelinesQuery, useErasQuery, useEventsQuery,
  useChronicleEventsQuery, useCreateChronicleEventMutation,
  useUpdateChronicleEventMutation, useDeleteChronicleEventMutation,
  useMythosPantheonsQuery, useMythosDeitiesQuery,
  useCreateMythosPantheonMutation, useUpdateMythosPantheonMutation, useDeleteMythosPantheonMutation,
  useCreateMythosDeityMutation, useUpdateMythosDeityMutation, useDeleteMythosDeityMutation,
  useMythosRelationsQuery, useMythosMythsQuery, useMythosBeliefsQuery, useMythosSitesQuery,
  useMythosHistoryLinksQuery, useMythosCosmicNodesQuery, useMythosCosmicLinksQuery, useMythosLocationsQuery,
  useCreateMythosRelationMutation, useUpdateMythosRelationMutation, useDeleteMythosRelationMutation,
  useCreateMythosMythMutation, useUpdateMythosMythMutation, useDeleteMythosMythMutation,
  useCreateMythosBeliefMutation, useUpdateMythosBeliefMutation, useDeleteMythosBeliefMutation,
  useCreateMythosSiteMutation, useUpdateMythosSiteMutation, useDeleteMythosSiteMutation,
  useUpsertMythosHistoryLinkMutation, useDeleteMythosHistoryLinkMutation,
  useCreateMythosCosmicNodeMutation, useUpdateMythosCosmicNodeMutation, useDeleteMythosCosmicNodeMutation,
  useCreateMythosCosmicLinkMutation, useUpdateMythosCosmicLinkMutation, useDeleteMythosCosmicLinkMutation,
} = atlasApi;
