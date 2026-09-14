import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { formatWatchPosition } from "@/lib/library.functions";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n-hook";

import { TitleCard } from "@/components/TitleCard";
import { Button } from "@/components/ui/button";
import { removeFromHistory, removeFromLibrary } from "@/lib/library.functions";
import { historyQuery, libraryQuery } from "@/lib/auth/queries";
import type { WatchEntry } from "@/lib/auth/types";

export const Route = createFileRoute("/_auth/library")({
  head: () => ({
    meta: [
      { title: "Library - StreamApp - Rdn" },
      {
        name: "description",
        content: "Titles you saved and the ones you watched recently, per profile.",
      },
      { property: "og:title", content: "Library - StreamApp - Rdn" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(historyQuery),
      context.queryClient.ensureQueryData(libraryQuery),
    ]),
  component: LibraryPage,
});

function episodeBadge(entry: WatchEntry) {
  return entry.season > 0 ? `S${entry.season} - E${entry.episode}` : undefined;
}

function LibraryPage() {
  const queryClient = useQueryClient();
  const { data: history } = useSuspenseQuery(historyQuery);
  const { data: library } = useSuspenseQuery(libraryQuery);
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function remove(slug: string) {
    setBusy(slug);
    const result = await removeFromLibrary({ data: { slug } });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    void queryClient.invalidateQueries({ queryKey: libraryQuery.queryKey });
  }

  async function removeHistory(entry: WatchEntry) {
    setBusy(`${entry.slug}-${entry.season}-${entry.episode}`);
    const result = await removeFromHistory({
      data: { slug: entry.slug, season: entry.season, episode: entry.episode },
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    void queryClient.invalidateQueries({ queryKey: historyQuery.queryKey });
  }

  if (!history && !library) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-semibold text-foreground">
          {t("library_title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("misc_error")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <div>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          {t("library_title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("library_emptySub")}</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">
          {t("library_myList")}
        </h2>
        {library && library.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {library.map((item) => (
              <div key={item.slug} className="space-y-1.5">
                <TitleCard title={item.title} />
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="truncate text-[11px] text-muted-foreground">
                    {t("library_addedAgo")} {formatDistanceToNow(item.addedAt, { addSuffix: true })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === item.slug}
                    onClick={() => void remove(item.slug)}
                    className="h-6 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                  >
                    {t("library_remove")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("library_noWatchlistSub")}</p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">
          {t("library_recentlyWatched")}
        </h2>
        {history && history.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {history.map((entry) => (
              <div key={`${entry.slug}-${entry.season}-${entry.episode}`} className="space-y-1.5">
                <TitleCard title={entry.title} badge={episodeBadge(entry)} />
                <div className="flex items-center justify-between gap-2 px-1">
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatDistanceToNow(entry.watchedAt, { addSuffix: true })}
                  </p>
                  {entry.marker > 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      {formatWatchPosition(entry.marker)}
                    </p>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === `${entry.slug}-${entry.season}-${entry.episode}`}
                    onClick={() => void removeHistory(entry)}
                    className="h-6 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                  >
                    {t("library_removeFromHistory")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("library_noHistorySub")}</p>
        )}
      </section>
    </div>
  );
}
