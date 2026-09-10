import type { PlayerConfig, TitleType } from "./types";

export interface EmbedTarget {
  tmdbId: number;
  type: TitleType;
  season?: number | undefined;
  episode?: number | undefined;
}

/**
 * Builds the embed URL for a title. Series need both a season and an episode
 * number; TMDB numbering is used, not the catalogue's internal episode ids.
 */
export function buildEmbedUrl(config: PlayerConfig, target: EmbedTarget): string | null {
  if (!config.enabled || !config.domain) return null;

  const host = config.domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  if (target.type === "tv") {
    if (!target.season || !target.episode) return null;
    return `https://${host}/tv/${target.tmdbId}/${target.season}/${target.episode}`;
  }

  return `https://${host}/movie/${target.tmdbId}`;
}
