import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search as SearchIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/lib/i18n-hook";

import { TitleCard } from "@/components/TitleCard";
import { searchTitles } from "@/lib/streaming.functions";

export const Route = createFileRoute("/_auth/search")({
  head: () => ({
    meta: [
      { title: "Search Titles - StreamApp - Rdn" },
      {
        name: "description",
        content:
          "Search films and series by name or genre and open full details, seasons and episodes.",
      },
      { property: "og:title", content: "Search Titles - StreamApp - Rdn" },
      {
        property: "og:description",
        content: "Find any film or series by name or genre in seconds.",
      },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { t } = useTranslation();
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const run = useServerFn(searchTitles);

  const { data, isFetching } = useQuery({
    queryKey: ["search", query],
    queryFn: () => run({ data: { query } }),
    enabled: query.length > 0,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          {t("search_search")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("search_placeholder")}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(term);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("search_placeholder")}
            aria-label="Search titles"
            className="w-full rounded-md border border-input bg-card py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("search_search")}
        </button>
      </form>

      {isFetching ? <p className="text-sm text-muted-foreground">{t("search_searching")}</p> : null}

      {data && data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("search_nothingMatched")} "{query}".
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {(data ?? []).map((t) => (
          <TitleCard key={t.id} title={t} />
        ))}
      </div>
    </div>
  );
}
