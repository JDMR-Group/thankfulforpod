const HANDLE = '@whatamithankfulfor';
const API_KEY = process.env.YOUTUBE_API_KEY;
const SHORT_MAX_SECONDS = 185; // YouTube's Shorts ceiling is 3:00; small buffer for rounding

async function ytFetch(path, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  url.search = new URLSearchParams({ ...params, key: API_KEY }).toString();
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API error on ${path} (${res.status}): ${body}`);
  }
  return res.json();
}

function parseDuration(iso) {
  const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return (parseInt(h) || 0) * 3600 + (parseInt(min) || 0) * 60 + (parseInt(s) || 0);
}

exports.handler = async function () {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (!API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing YOUTUBE_API_KEY' }) };
  }

  try {
    // Resolve the channel handle to its uploads playlist.
    const channelData = await ytFetch('channels', {
      part: 'contentDetails',
      forHandle: HANDLE,
    });
    const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) throw new Error(`Could not resolve uploads playlist for ${HANDLE}`);

    // Pull enough recent uploads to find both a full-length video and Shorts.
    const playlistData = await ytFetch('playlistItems', {
      part: 'snippet',
      playlistId: uploadsPlaylistId,
      maxResults: '20',
    });
    const videoIds = (playlistData.items || [])
      .map((i) => i.snippet?.resourceId?.videoId)
      .filter(Boolean);
    if (!videoIds.length) throw new Error('No uploads found');

    // Duration is what distinguishes a Short from full-length content.
    const videosData = await ytFetch('videos', {
      part: 'contentDetails,snippet',
      id: videoIds.join(','),
    });

    const videos = (videosData.items || [])
      .map((v) => ({
        id: v.id,
        title: v.snippet.title,
        publishedAt: v.snippet.publishedAt,
        seconds: parseDuration(v.contentDetails.duration),
      }))
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    const shorts = videos.filter((v) => v.seconds > 0 && v.seconds <= SHORT_MAX_SECONDS).slice(0, 2);
    const fullVideo = videos.find((v) => v.seconds > SHORT_MAX_SECONDS) || null;

    return {
      statusCode: 200,
      headers: { ...headers, 'Cache-Control': 'public, max-age=1800' },
      body: JSON.stringify({
        fullVideo: fullVideo ? { id: fullVideo.id, title: fullVideo.title } : null,
        shorts: shorts.map((s) => ({ id: s.id, title: s.title })),
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
