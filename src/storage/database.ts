import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SavedYouTubeRoute } from './savedRoute';
import type { WorkoutRecord } from '../workout/types';

interface RunscapeDb extends DBSchema {
  workouts: {
    key: string;
    value: WorkoutRecord;
  };
  routes: {
    key: string;
    value: SavedYouTubeRoute;
  };
}

const DB_NAME = 'runscape';

let database: Promise<IDBPDatabase<RunscapeDb>> | null = null;

export function openRunscapeDb(): Promise<IDBPDatabase<RunscapeDb>> {
  if (!database) {
    database = openDB<RunscapeDb>(DB_NAME, 2, {
      upgrade(next) {
        if (!next.objectStoreNames.contains('workouts')) next.createObjectStore('workouts', { keyPath: 'id' });
        if (!next.objectStoreNames.contains('routes')) next.createObjectStore('routes', { keyPath: 'id' });
      },
    });
  }
  return database;
}
