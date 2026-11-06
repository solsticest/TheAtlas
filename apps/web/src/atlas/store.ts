import { configureStore } from '@reduxjs/toolkit';
import { atlasApi } from './api';
import { viewReducer } from './viewSlice';

export const store = configureStore({
  reducer: {
    [atlasApi.reducerPath]: atlasApi.reducer,
    atlasView: viewReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(atlasApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
