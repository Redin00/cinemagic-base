import { useEffect, useRef, useState } from "react";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { z } from "zod";

import { HlsPlayer } from "@/components/HlsPlayer";
import { AdBlockPrompt, useAdBlockPrompt } from "@/components/AdBlockPrompt";
import { useBrowserInfo } from "@/hooks/use-browser-info";
import { historyQuery } from "@/lib/auth/queries";
import {
  getWatchMarker,
  recordPlay,
  updateWatchMarker,
  formatWatchPosition,
} from "@/lib/library.functions";
import { getPlayerConfig, getStreamSource, getTitle } from "@/lib/streaming.functions";
import { buildEmbedUrl } from "@/lib/streaming/player";
import { useTranslation } from "@/lib/i18n-hook";

const titleQuery = (id: string) =>
  queryOptions({
    queryKey: ["title", id],
    queryFn: () => getTitle({ data: { id } }),
  });

const playerQuery = queryOptions({
  queryKey: ["player-config"],
  queryFn: () => getPlayerConfig(),
});

export const Route = createFileRoute("/_auth/watch/$id")({
  validateSearch: (search: Record<string, unknown>) => {
    const parsed = z
      .object({
        s: z.coerce.number().int().positive().optional(),
        e: z.coerce.number().int().positive().optional(),
      })
      .safeParse(search);
    return parsed.success ? parsed.data : {};
  },
  loader: async ({ context, params }) => {
    const [title] = await Promise.all([
      context.queryClient.ensureQueryData(titleQuery(params.id)),
      context.queryClient.ensureQueryData(playerQuery),
    ]);
    if (!title) throw notFound();
    return { name: title.name };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? `Watch ${loaderData.name} - StreamApp - Rdn`
          : "Watch - StreamApp - Rdn",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WatchPage,
});

function WatchPage() {
  const { id } = Route.useParams();
  const { s, e } = Route.useSearch();
  const queryClient = useQueryClient();
  const { data: title } = useSuspenseQuery(titleQuery(id));
  const { data: player } = useSuspenseQuery(playerQuery);
  const { t } = useTranslation();

  const isSeries = title?.type === "tv";
  const activeSeason = isSeries
    ? (title?.seasons.find((x) => x.number === s) ?? title?.seasons[0])
    : undefined;
  const activeEpisode = isSeries
    ? (activeSeason?.episodes.find((x) => x.number === e) ?? activeSeason?.episodes[0])
    : undefined;

  const [hlsFailed, setHlsFailed] = useState(false);
  useEffect(() => setHlsFailed(false), [id, s, e]);

  const { browser: detectedBrowser, adblockActive } = useBrowserInfo();
  const adBlockPrompt = useAdBlockPrompt({ browser: detectedBrowser, adblockActive });

  const streamQuery = useQuery({
    queryKey: ["stream", title?.tmdbId, title?.type, activeSeason?.number, activeEpisode?.number],
    queryFn: () => {
      if (!title?.tmdbId) return null;
      return getStreamSource({
        data: {
          tmdbId: title.tmdbId,
          type: title.type,
          season: activeSeason?.number,
          episode: activeEpisode?.number,
        },
      });
    },
    enabled: Boolean(title?.tmdbId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const playlistUrl = streamQuery.data?.playlistUrl ?? null;
  const embedUrl = title?.tmdbId
    ? buildEmbedUrl(player, {
        tmdbId: title.tmdbId,
        type: title.type,
        season: activeSeason?.number,
        episode: activeEpisode?.number,
      })
    : null;

  // --- resume position ---

  const [marker, setMarker] = useState<number | null>(null);
  const [markerLoaded, setMarkerLoaded] = useState(false);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playLoggedRef = useRef(false);
  const latestSecondsRef = useRef<number | null>(null);
  const embedFrameRef = useRef<HTMLIFrameElement>(null);

  const slug = title?.slug ?? "";
  const season = activeSeason?.number ?? 0;
  const episode = activeEpisode?.number ?? 0;
  const resumeEmbedUrl = embedUrl
    ? buildEmbedUrl(player, {
        tmdbId: title.tmdbId!,
        type: title.type,
        season: activeSeason?.number,
        episode: activeEpisode?.number,
        startAt: marker ?? undefined,
      })
    : null;

  // Load the marker from the server first; fall back to a localStorage copy
  // that was saved as a cross-session safety net when the service was down.
  useEffect(() => {
    if (!title) return;

    let cancelled = false;
    setMarker(null);
    setMarkerLoaded(false);

    (async () => {
      const watched = await getWatchMarker({
        data: { slug, season, episode },
      });
      if (cancelled) return;
      let saved = watched?.marker;
      if (saved === undefined || saved === null) {
        try {
          const local = localStorage.getItem(`watch-marker:${slug}:${season}:${episode}`);
          if (local !== null) {
            const parsed = parseInt(local, 10);
            if (!Number.isNaN(parsed) && parsed > 0) saved = parsed;
          }
        } catch {
          // localStorage unavailable — ignore.
        }
      }
      setMarker(saved !== undefined && saved !== null ? saved : null);
      setMarkerLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [title, slug, season, episode]);

  // Record a play row the moment playback has a resolvable source, so the
  // title shows up in "recently watched" and resume can find a marker row
  // even if the user stops before the debounced marker write fires.
  useEffect(() => {
    if (!title || (!playlistUrl && !embedUrl)) return;

    let cancelled = false;
    playLoggedRef.current = false;

    (async () => {
      await recordPlay({
        data: { slug, title, season, episode },
      });
      if (cancelled) return;
      playLoggedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [title, playlistUrl, embedUrl, slug, season, episode]);

  // Debounced persistence of the current playback position.
  // Flush a pending write when leaving this title or episode so the marker is
  // stored under the same context that produced it.
  useEffect(() => {
    return () => {
      const seconds = latestSecondsRef.current;
      if (seconds !== null) {
        if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
        const clamped = Math.max(0, Math.round(seconds));
        void updateWatchMarker({
          data: { slug, title, season, episode, marker: clamped },
        });
        try {
          const key = `watch-marker:${slug}:${season}:${episode}`;
          localStorage.setItem(key, String(clamped));
        } catch {
          // Ignore quota/storage errors — the server write is the source of truth.
        }
      }
    };
  }, [slug, title, season, episode]);

  function persistMarker(seconds: number, immediate = false) {
    if (!markerLoaded) return;
    latestSecondsRef.current = seconds;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    const save = () => {
      saveDebounceRef.current = null;
      if (!title) return;
      const clamped = Math.max(0, Math.round(seconds));
      void updateWatchMarker({
        data: { slug, title, season, episode, marker: clamped },
      });
      // Persist to localStorage as a cross-session fallback so the resume
      // marker survives even when the streaming service is unreachable.
      try {
        const key = `watch-marker:${slug}:${season}:${episode}`;
        localStorage.setItem(key, String(clamped));
      } catch {
        // Ignore quota/storage errors — the server write is the source of truth.
      }
    };
    if (immediate) {
      save();
    } else {
      saveDebounceRef.current = setTimeout(save, 2000);
    }
  }

  function flushMarker() {
    const seconds = latestSecondsRef.current;
    if (seconds === null || !title) return;
    persistMarker(seconds, true);
  }

  useEffect(() => {
    if (!resumeEmbedUrl || !markerLoaded) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushMarker();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flushMarker);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flushMarker);
    };
  }, [resumeEmbedUrl, markerLoaded, slug, title, season, episode]);

  useEffect(() => {
    if (!resumeEmbedUrl || !markerLoaded) return;

    const handlePlayerMessage = (event: MessageEvent) => {
      const frameWindow = embedFrameRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;

      let payload = event.data as {
        type?: unknown;
        event?: unknown;
        currentTime?: unknown;
        duration?: unknown;
        data?: {
          event?: unknown;
          currentTime?: unknown;
          time?: unknown;
          duration?: unknown;
        };
      };
      if (typeof event.data === "string") {
        try {
          payload = JSON.parse(event.data) as typeof payload;
        } catch {
          return;
        }
      }
      const playerEvent = payload?.data?.event ?? payload?.event;
      if (
        payload?.type !== "PLAYER_EVENT" ||
        !["timeupdate", "pause", "seeked", "ended"].includes(String(playerEvent))
      ) {
        return;
      }
      const rawSeconds = payload.currentTime ?? payload.data?.currentTime ?? payload.data?.time;
      const seconds =
        typeof rawSeconds === "number"
          ? rawSeconds
          : typeof rawSeconds === "string"
            ? Number(rawSeconds)
            : Number.NaN;
      const rawDuration = payload.duration ?? payload.data?.duration;
      const duration =
        typeof rawDuration === "number"
          ? rawDuration
          : typeof rawDuration === "string"
            ? Number(rawDuration)
            : Number.NaN;
      if (Number.isFinite(seconds) && seconds >= 0) {
        // Vixsrc owns the iframe lifecycle, so a debounced write can be lost
        // when the user leaves the route before the timeout fires.
        persistMarker(seconds, true);
      } else if (playerEvent === "ended" && Number.isFinite(duration) && duration > 0) {
        persistMarker(duration, true);
      }
    };

    window.addEventListener("message", handlePlayerMessage);
    return () => window.removeEventListener("message", handlePlayerMessage);
  }, [resumeEmbedUrl, markerLoaded, slug, title, season, episode]);

  if (!title) return null;

  const showFallbackNotice = hlsFailed || (streamQuery.isFetched && !playlistUrl);

  return (
    <div className="space-y-6">
      <div className="min-w-0 space-y-1">
        <Link
          to="/title/$id"
          params={{ id }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("watch_backToDetails")}
        </Link>
        <h1 className="truncate font-display text-2xl font-semibold text-foreground">
          {title.name}
        </h1>
        {activeSeason && activeEpisode ? (
          <p className="text-sm text-muted-foreground">
            S{activeSeason.number} - E{activeEpisode.number} - {activeEpisode.name}
          </p>
        ) : null}
      </div>

      {playlistUrl && !hlsFailed ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
          <HlsPlayer
            src={playlistUrl}
            title={`${title.name} player`}
            onFatal={() => setHlsFailed(true)}
            onTimeUpdate={persistMarker}
            initialSeconds={marker ?? undefined}
          />
        </div>
      ) : streamQuery.isLoading ? (
        <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-border bg-black">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : embedUrl ? (
        <div className="space-y-2">
          {showFallbackNotice ? (
            <p className="text-xs text-muted-foreground">{t("watch_unavailable")}</p>
          ) : null}
          {adBlockPrompt.shouldShow ? <AdBlockPrompt browser={adBlockPrompt.info.browser} /> : null}
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
            <iframe
              ref={embedFrameRef}
              src={resumeEmbedUrl ?? embedUrl}
              title={`${title.name} player`}
              className="size-full"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-card-foreground">{t("title_unavailable")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {title.tmdbId ? t("watch_noHostConfigured") : t("watch_noExternalId")}
          </p>
        </div>
      )}

      {activeSeason && activeSeason.episodes.length > 0 ? (
        <section className="space-y-4">
          <div className="flex overflow-x-auto overflow-y-hidden whitespace-nowrap -mx-1 px-1 scrollbar-none sm:overflow-visible sm:whitespace-normal">
            {title.seasons.map((sn) => (
              <Link
                key={sn.number}
                to="/watch/$id"
                params={{ id }}
                search={{ s: sn.number, e: undefined }}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
                  sn.number === activeSeason.number
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {sn.name}
              </Link>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeSeason.episodes.map((ep) => (
              <Link
                key={ep.id}
                to="/watch/$id"
                params={{ id }}
                search={{ s: activeSeason.number, e: ep.number }}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                  ep.number === activeEpisode?.number
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <span className="w-6 shrink-0 font-display text-sm text-muted-foreground">
                  {ep.number}
                </span>
                <span className="truncate text-sm text-card-foreground">{ep.name}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
