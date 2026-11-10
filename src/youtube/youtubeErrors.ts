/** YouTube IFrame player onError data codes, mapped to a sentence. The numeric code stays in the log. */
export function youtubeErrorMessage(code: number): string {
  switch (code) {
    case 2:
      return 'Invalid video';
    case 5:
      return 'Video unavailable';
    case 100:
      return 'Video removed/private';
    case 101:
    case 150:
      return 'This YouTube video cannot be embedded. Please choose another video.';
    default:
      return 'Video unavailable';
  }
}

export const YOUTUBE_CAST_MESSAGE =
  'Chromecast plays this from YouTube, not as a video file. Use Cast in the YouTube tab that just opened. The walk stays here.';
