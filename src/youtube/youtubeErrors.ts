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
  'YouTube casting is currently handled separately from native route casting.';
