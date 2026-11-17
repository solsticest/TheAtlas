import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import {
  worldSchema, layerSchema, locationSchema, markerTypeSchema, searchItemSchema,
  timelineRecordSchema, eraRecordSchema, eventRecordSchema, chronicleEventSchema,
  type WorldRecord, type LayerRecord, type LocationRecord, type MarkerTypeRecord, type SearchItem,
  type TimelineRecord, type EraRecord, type EventRecord, type ChronicleEventRecord, type ChronicleEventInput,
} from '@atlas/shared';

export const atlasApi = createApi({
  reducerPath: 'atlasApi',
  tagTypes: ['ChronicleEvent'],
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
} = atlasApi;
