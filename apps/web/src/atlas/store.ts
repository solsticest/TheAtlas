import { configureStore } from '@reduxjs/toolkit';
import { atlasApi } from './api';

export const store = configureStore({
  reducer: {
    [atlasApi.reducerPath]: atlasApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(atlasApi.middleware),
});
