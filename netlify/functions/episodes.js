exports.handler = async function () {
  const res = await fetch(
    'https://itunes.apple.com/lookup?id=1592192374&entity=podcastEpisode&limit=100&sort=recent'
  );
  const data = await res.json();
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=1800',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(data),
  };
};
