import { openRunscapeDb } from './database';
import type { WorkoutRecord } from '../workout/types';

const STORE = 'workouts';

export const workoutRepository = {
  async list(): Promise<WorkoutRecord[]> {
    const all = await (await openRunscapeDb()).getAll(STORE);
    return all.sort((a, b) => (a.date < b.date ? 1 : -1));
  },

  async get(id: string): Promise<WorkoutRecord | undefined> {
    return (await openRunscapeDb()).get(STORE, id);
  },

  async save(record: WorkoutRecord): Promise<void> {
    await (await openRunscapeDb()).put(STORE, record);
  },

  async remove(id: string): Promise<void> {
    await (await openRunscapeDb()).delete(STORE, id);
  },
};
