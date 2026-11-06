import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import {
  worldSchema, layerSchema, locationSchema, markerTypeSchema, searchItemSchema,
  type WorldRecord, type LayerRecord, type LocationRecord, type MarkerTypeRecord, type SearchItem,
} from '@atlas/shared';

export const atlasApi = createApi({
  reducerPath: 'atlasApi',
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
    search: build.query<SearchItem[], string>({
      query: (q) => 'search?q=' + encodeURIComponent(q),
      transformResponse: (payload: unknown) => searchItemSchema.array().parse(payload),
    }),
  }),
});

export const {
  useWorldsQuery, useMarkerTypesQuery, useLayersQuery, useLocationsQuery, useSearchQuery,
} = atlasApi;
