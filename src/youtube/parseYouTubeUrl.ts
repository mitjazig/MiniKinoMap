const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isYouTubeVideoId(value: string): boolean {
  return VIDEO_ID.test(value);
}

/**
 * Accept only a real watch/share/embed/shorts URL or a bare 11-character id.
 * The result is an id, never HTML.
 */
export function parseYouTubeUrl(input: string): { videoId: string } | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 400) return null;
  if (isYouTubeVideoId(trimmed)) return { videoId: trimmed };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
    return isYouTubeVideoId(id) ? { videoId: id } : null;
  }
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') return null;

  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v') ?? '';
    return isYouTubeVideoId(id) ? { videoId: id } : null;
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if ((parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') && parts[1] && isYouTubeVideoId(parts[1])) {
    return { videoId: parts[1] };
  }
  return null;
}

export function youTubeThumbnailUrl(videoId: string): string | null {
  if (!isYouTubeVideoId(videoId)) return null;
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
