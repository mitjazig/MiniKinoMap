export type SavedYouTubeRoute = {
  id: string;
  name: string;
  videoId: string;
  originalUrl?: string;
  mode: 'scenic' | 'synced';
  distanceMeters: number;
  videoStartSeconds?: number;
  videoEndSeconds?: number;
  difficulty: 'easy' | 'moderate' | 'hard';
  tags: string[];
  createdAt: string;
  videoDurationSeconds?: number;
};
