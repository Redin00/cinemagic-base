import { useTranslation } from "@/lib/i18n-hook";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";

import type { TitleSummary } from "@/lib/streaming/types";

export function TitleCard({ title, badge }: { title: TitleSummary; badge?: string | undefined }) {
  const { t } = useTranslation();
  return (
    <Link
      to="/title/$id"
      params={{ id: title.slug }}
      className="group block overflow-hidden rounded-xl border border-border bg-card transition-transform duration-300 hover:-translate-y-1 hover:border-primary/60"
    >
      <div className="relative aspect-[2/3] overflow-hidden">
        <img
          src={title.posterUrl}
          alt={`${title.name} poster`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute left-2 top-2 rounded-md bg-background/80 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur">
          {title.type === "tv" ? t("titlecard_series") : t("titlecard_film")}
        </span>
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-background/80 px-2 py-0.5 text-[11px] font-semibold text-primary backdrop-blur">
          <Star className="size-3 fill-current" />
          {title.score.toFixed(1)}
        </span>
        {badge ? (
          <span className="absolute bottom-2 left-2 rounded-md bg-background/80 px-2 py-0.5 text-[11px] font-semibold text-card-foreground backdrop-blur">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="space-y-1 p-3">
        <h3 className="truncate text-sm font-semibold text-card-foreground">
          {title.name}
        </h3>
        <p className="truncate text-xs text-muted-foreground">
          {[title.year || null, ...title.genres.slice(0, 2)].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  );
}
