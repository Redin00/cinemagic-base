import type { LibraryStats, TitleDetail, TitleSummary } from "./types";

const poster = (seed: string) => `https://picsum.photos/seed/${seed}/400/600`;
const backdrop = (seed: string) => `https://picsum.photos/seed/${seed}-bg/1200/675`;

const base: Omit<TitleDetail, "posterUrl" | "backdropUrl">[] = [
  {
    id: 1,
    slug: "the-last-signal",
    name: "The Last Signal",
    type: "tv",
    year: 2025,
    score: 8.6,
    genres: ["Sci-Fi", "Drama"],
    seasonsCount: 2,
    plot: "A deep-space relay station picks up a transmission that should not exist, and the skeleton crew must decide who — or what — is calling.",
    quality: "4K",
    runtime: 52,
    status: "Returning Series",
    cast: ["Nora Whitfield", "Elias Ruiz", "Hana Ito"],
    tmdbId: 10101,
    seasons: [
      {
        number: 1,
        name: "Season 1",
        episodes: Array.from({ length: 8 }, (_, i) => ({
          id: 100 + i,
          number: i + 1,
          name: `Transmission ${i + 1}`,
          plot: "The crew decodes another fragment of the signal.",
          duration: 52,
        })),
      },
      {
        number: 2,
        name: "Season 2",
        episodes: Array.from({ length: 6 }, (_, i) => ({
          id: 200 + i,
          number: i + 1,
          name: `Echo ${i + 1}`,
          plot: "Earth answers back.",
          duration: 55,
        })),
      },
    ],
  },
  {
    id: 2,
    slug: "harbour-lights",
    name: "Harbour Lights",
    type: "movie",
    year: 2024,
    score: 7.4,
    genres: ["Drama", "Romance"],
    plot: "Two strangers share one night in a fading port town before the last ferry leaves at dawn.",
    quality: "FHD",
    runtime: 108,
    status: "Released",
    cast: ["Marta Bellini", "Owen Clarke"],
    seasons: [],
  },
  {
    id: 3,
    slug: "iron-verdict",
    name: "Iron Verdict",
    type: "movie",
    year: 2026,
    score: 8.1,
    genres: ["Action", "Thriller"],
    plot: "A disgraced prosecutor has twelve hours to prove a verdict was bought.",
    quality: "4K",
    runtime: 124,
    status: "Released",
    cast: ["Dev Anand", "Clara Fontaine", "Yusuf Adeyemi"],
    seasons: [],
  },
  {
    id: 4,
    slug: "midnight-kitchen",
    name: "Midnight Kitchen",
    type: "tv",
    year: 2023,
    score: 7.9,
    genres: ["Comedy", "Slice of Life"],
    seasonsCount: 3,
    plot: "A 24-hour diner and the regulars who keep it alive between 1am and sunrise.",
    quality: "FHD",
    runtime: 28,
    status: "Ended",
    cast: ["Sora Kimura", "Tomas Vidal"],
    seasons: [
      {
        number: 1,
        name: "Season 1",
        episodes: Array.from({ length: 10 }, (_, i) => ({
          id: 300 + i,
          number: i + 1,
          name: `Order ${i + 1}`,
          plot: "Another late-night regular walks in.",
          duration: 28,
        })),
      },
    ],
  },
  {
    id: 5,
    slug: "glass-continent",
    name: "Glass Continent",
    type: "tv",
    year: 2026,
    score: 9.0,
    genres: ["Documentary", "Nature"],
    seasonsCount: 1,
    plot: "A year on the ice, told through the animals that never leave it.",
    quality: "4K",
    runtime: 47,
    status: "Returning Series",
    cast: ["Narrated by Alan Vester"],
    seasons: [
      {
        number: 1,
        name: "Season 1",
        episodes: Array.from({ length: 5 }, (_, i) => ({
          id: 400 + i,
          number: i + 1,
          name: `Chapter ${i + 1}`,
          plot: "Life at the edge of the shelf.",
          duration: 47,
        })),
      },
    ],
  },
  {
    id: 6,
    slug: "paper-tigers",
    name: "Paper Tigers",
    type: "movie",
    year: 2025,
    score: 6.8,
    genres: ["Crime", "Comedy"],
    plot: "Three failed forgers attempt one honest job and fail at that too.",
    quality: "FHD",
    runtime: 96,
    status: "Released",
    cast: ["Ines Moreau", "Karl Berg"],
    seasons: [],
  },
  {
    id: 7,
    slug: "the-quiet-mile",
    name: "The Quiet Mile",
    type: "movie",
    year: 2024,
    score: 8.3,
    genres: ["Sport", "Drama"],
    plot: "A distance runner returns to the track that broke her.",
    quality: "4K",
    runtime: 113,
    status: "Released",
    cast: ["Amara Nkosi", "Peter Lund"],
    seasons: [],
  },
  {
    id: 8,
    slug: "northbound",
    name: "Northbound",
    type: "tv",
    year: 2025,
    score: 7.2,
    genres: ["Thriller", "Mystery"],
    seasonsCount: 1,
    plot: "A night train, nine passengers, and one of them never boarded.",
    quality: "FHD",
    runtime: 44,
    status: "Returning Series",
    cast: ["Lena Fischer", "Rafael Costa"],
    seasons: [
      {
        number: 1,
        name: "Season 1",
        episodes: Array.from({ length: 6 }, (_, i) => ({
          id: 500 + i,
          number: i + 1,
          name: `Stop ${i + 1}`,
          plot: "The train does not slow down.",
          duration: 44,
        })),
      },
    ],
  },
];

export const mockTitles: TitleDetail[] = base.map((t) => ({
  ...t,
  posterUrl: poster(t.slug),
  backdropUrl: backdrop(t.slug),
}));

export const toSummary = (t: TitleDetail): TitleSummary => ({
  id: t.id,
  slug: t.slug,
  name: t.name,
  type: t.type,
  year: t.year,
  score: t.score,
  posterUrl: t.posterUrl,
  backdropUrl: t.backdropUrl,
  genres: t.genres,
  seasonsCount: t.seasonsCount,
});

export const mockStats = (): LibraryStats => {
  const genres = new Map<string, number>();
  for (const t of mockTitles) for (const g of t.genres) genres.set(g, (genres.get(g) ?? 0) + 1);

  return {
    totalTitles: mockTitles.length,
    movies: mockTitles.filter((t) => t.type === "movie").length,
    series: mockTitles.filter((t) => t.type === "tv").length,
    averageScore:
      Math.round((mockTitles.reduce((a, t) => a + t.score, 0) / mockTitles.length) * 10) / 10,
    genreBreakdown: [...genres.entries()]
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count),
    weeklyViews: [
      { day: "Mon", views: 1240 },
      { day: "Tue", views: 1580 },
      { day: "Wed", views: 1410 },
      { day: "Thu", views: 1890 },
      { day: "Fri", views: 2470 },
      { day: "Sat", views: 3120 },
      { day: "Sun", views: 2860 },
    ],
  };
};
