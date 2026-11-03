import { LocalVideoOutput } from './LocalVideoOutput';
import type { RouteMedia, VideoOutput } from './types';
import { YouTubeVideoOutput } from '../youtube/YouTubeVideoOutput';

/**
 * Pick an output from the media type. Callers pass the element they already own.
 * YouTube never falls through to the local file player or the MP4 cast sender.
 */
export function createVideoOutput(media: RouteMedia, video?: HTMLVideoElement): VideoOutput {
  if (media.type === 'youtube') return new YouTubeVideoOutput();
  if (!video) throw new Error('Local video output needs a video element.');
  return new LocalVideoOutput(video);
}
