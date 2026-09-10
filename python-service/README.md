# StreamApp - Rdn — Python service

Small FastAPI wrapper around [`streamingcommunity-unofficialapi`](https://pypi.org/project/streamingcommunity-unofficialapi/)
(module `scuapi`). It serves exactly the JSON the dashboard reads.

## Run locally

```bash
cd python-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
SC_DOMAIN=<current-streamingcommunity-domain> uvicorn main:app --reload --port 8000
```

Check it: `curl localhost:8000/health` then `curl "localhost:8000/search?q=dark"`.

## Or with Docker

```bash
docker build -t streaming-api python-service
docker run -p 8000:8000 -e SC_DOMAIN=<domain> streaming-api
```

## Connect the dashboard

Set the environment variable `STREAMING_API_URL` for the web app to the service
URL (e.g. `http://localhost:8000`). Without it the app keeps showing its sample
catalogue.

## Endpoints

| Endpoint          | Returns                                     | Source                         |
| ----------------- | ------------------------------------------- | ------------------------------ |
| `GET /health`     | `{ ok, domain }`                            | —                              |
| `GET /player`     | `{ provider, domain, enabled }`             | —                              |
| `GET /stream`     | `{ provider, playlistUrl, expiresAt, fhd }` | playback host API + scrape     |
| `GET /search?q=`  | `TitleSummary[]`                            | `API.search()`                 |
| `GET /trending`   | `TitleSummary[]`                            | site `/it/browse/trending`     |
| `GET /latest`     | `TitleSummary[]`                            | site `/it/browse/latest`       |
| `GET /title/{id}` | `TitleDetail` (seasons, episodes, `tmdbId`) | `API.load()`                   |
| `GET /stats`      | `LibraryStats`                              | browse sliders + archive total |

`{id}` is the `"<numeric-id>-<slug>"` value returned in each summary's `slug`.

## Notes

- The upstream site rotates its domain; if everything 502s, update `SC_DOMAIN`.
- Listings come from the site's own page routes: asking `/it/browse/{slider}` for
  `application/json` returns the payload it would otherwise render. `trending`,
  `latest` and `top10` are the sliders, `/it/browse/genre?g=<name>` filters by
  genre, and each carries at most 60 titles. `api/tv/browse` needs credentials
  and `scuapi` has no browse method, so there is no cleaner route.
- Those payloads carry no genres, so summaries from `/trending`, `/latest` and
  `/search` come back with `genres: []` and `/stats` reports an empty
  `genreBreakdown`. Genres are only available per title, from `API.load()`.
- `/stats` takes `totalTitles`, `movies` and `series` from the paginated
  `/it/archive?type=` endpoint, because counting the sliders would report a
  library of ~100 titles instead of the real tens of thousands.
- Playback is keyed by TMDB id and served to the dashboard via `GET /player`
  (embed host) and `GET /stream?tmdb=&type=movie|tv[&s=&e=]` (direct playlist).
  The host comes from `SC_VIXSRC_DOMAIN` (default `vixsrc.to`) and rotates just as
  often; set it empty to disable playback.
- `API.get_links()` is deliberately unused: it scrapes `window.masterPlaylist`
  from the host's public `/movie/{tmdb}` and `/tv/{tmdb}/{s}/{e}` pages, which no
  longer contain it. `resolve_playlist()` instead calls the host's private
  `/api/{movie,tv}/...` JSON endpoint and scrapes the token'd `/embed/...` page it
  returns.
- The embed token lives ~2 minutes, so both hops run back to back; the playlist
  token it yields lasts ~60 days, which is why caching it for `SC_CACHE_TTL` is
  safe. Titles the host does not carry return `404` and scrape failures `502`, so
  the dashboard can fall back to the iframe embed.
- If the host ever starts signing playlists to a network, `resolve_playlist()`
  logs a warning about a non-empty `asn` param — server-side resolving would then
  hand the browser a playlist it cannot use.
- Set `SC_LOG_LEVEL=DEBUG` for cache-hit and upstream-request tracing.
- Responses are cached in-process for `SC_CACHE_TTL` seconds (default 600).
- `cast` and `quality` are not exposed upstream, so they are left empty/`"HD"`.
- The site publishes no view analytics and no catalogue-wide rating aggregate:
  `weeklyViews` is scaled from the sampled titles and `averageScore` is averaged
  over them, so both describe the sample rather than the whole library.
