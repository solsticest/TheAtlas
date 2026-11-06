import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type FocusKind = 'world' | 'layer' | 'location' | 'event';
export type MapFocus = { kind: FocusKind; id: string; sequence: number };
type ViewState = {
  worldId: string;
  timelineId: string;
  eraId: string;
  hiddenTypes: string[];
  focus: MapFocus | null;
};
function initialView(): ViewState {
  const params = typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);
  return {
    worldId: params.get('world') ?? '',
    timelineId: params.get('timeline') ?? '',
    eraId: params.get('era') ?? '',
    hiddenTypes: [],
    focus: null,
  };
}

const viewSlice = createSlice({
  name: 'atlasView',
  initialState: initialView,
  reducers: {
    selectWorld(state, action: PayloadAction<string>) {
      state.worldId = action.payload;
      state.timelineId = '';
      state.eraId = '';
      state.focus = { kind: 'world', id: action.payload, sequence: (state.focus?.sequence ?? 0) + 1 };
    },
    resolveDefaultWorld(state, action: PayloadAction<string>) {
      if (!state.worldId) state.worldId = action.payload;
    },
    navigateToWorld(state, action: PayloadAction<string>) {
      if (state.worldId !== action.payload) {
        state.worldId = action.payload;
        state.timelineId = '';
        state.eraId = '';
      }
    },
    selectTimeline(state, action: PayloadAction<string>) {
      state.timelineId = action.payload;
      state.eraId = '';
    },
    selectEra(state, action: PayloadAction<string>) {
      state.eraId = action.payload;
    },
    toggleMarkerType(state, action: PayloadAction<{ id: string; visible: boolean }>) {
      const { id, visible } = action.payload;
      state.hiddenTypes = visible
        ? state.hiddenTypes.filter(type => type !== id)
        : [...new Set([...state.hiddenTypes, id])];
    },
    focusMap(state, action: PayloadAction<{ kind: FocusKind; id: string }>) {
      state.focus = { ...action.payload, sequence: (state.focus?.sequence ?? 0) + 1 };
    },
  },
});

export const {
  selectWorld, resolveDefaultWorld, navigateToWorld, selectTimeline, selectEra,
  toggleMarkerType, focusMap,
} = viewSlice.actions;
export const viewReducer = viewSlice.reducer;
