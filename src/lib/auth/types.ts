import type { TitleSummary } from "../streaming/types";

export type Role = "admin" | "member";

/** One tile on the profile picker. Public by design — that is the login screen. */
export interface Profile {
  id: number;
  name: string;
  color: string;
  locked: boolean;
}

/** The signed-in account. */
export interface Viewer {
  id: number;
  name: string;
  role: Role;
  color: string;
  /** Set by the dev auth bypass so AccountMenu and other consumers don't null-assert. */
  email?: string;
}

/** An account as the Admin page sees it. */
export interface AccountRow extends Viewer {
  /** Unix milliseconds, or null when the account is not locked out. */
  lockedUntil: number | null;
  createdAt: number;
  /** May be undefined when the backend has not been updated to return it. */
  email?: string;
}

/** A saved title, stored with the summary its card renders. */
export interface LibraryItem {
  slug: string;
  title: TitleSummary;
  addedAt: number;
}

/** A played title. Season and episode are 0 for films. */
export interface WatchEntry {
  slug: string;
  season: number;
  episode: number;
  title: TitleSummary;
  watchedAt: number;
}

export type LoginResult =
  | { ok: true; viewer: Viewer }
  | {
      ok: false;
      message: string;
      /** Seconds of lockout left, when the account ran out of attempts. */
      retryAfter: number | undefined;
      /** Attempts left before the lockout, when the password was simply wrong. */
      attemptsLeft: number | undefined;
    };

/** Shared shape for every write: the admin account routes and the library ones. */
export type MutationResult<T> = { ok: true; data: T } | { ok: false; message: string };
