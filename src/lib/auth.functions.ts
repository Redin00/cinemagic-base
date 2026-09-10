import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import type { AccountRow, LoginResult, MutationResult, Profile, Viewer } from "./auth/types";
import { ServiceError, SESSION_COOKIE, SESSION_MAX_AGE, messageFor, serviceFetch } from "./service";

// ---- In-memory stand-in used when the Python service is unreachable. ----

const mockAccounts: AccountRow[] = [];
let nextAccountId = 1;

function nextId(): number {
  return nextAccountId++;
}

/** Simulate the service's auto-generation of id + createdAt. */
function makeAccount(data: { name: string; role: "admin" | "member"; color: string; email?: string }): AccountRow {
  return {
    id: nextId(),
    name: data.name,
    role: data.role,
    color: data.color,
    email: data.email ?? `${data.name.toLowerCase().replace(/\s+/g, ".")}@streamapp.local`,
    lockedUntil: null,
    createdAt: Date.now(),
  };
}

// The flags have to match on the way out, or the browser keeps the cookie.
const COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env["NODE_ENV"] === "production",
};

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour");
const name = z.string().trim().min(1, "Pick a name").max(40, "Keep it under 40 characters");
const password = z.string().min(6, "At least 6 characters").max(200);

const DEFAULT_COLOR = "#6366f1";

function loginFailure(error: unknown): LoginResult {
  const detail = error instanceof ServiceError ? error : undefined;
  return {
    ok: false,
    message: messageFor(error),
    retryAfter: detail?.retryAfter,
    attemptsLeft: detail?.attemptsLeft,
  };
}

/** The profile picker. `null` means the service is unreachable, not "no accounts". */
export const getProfiles = createServerFn({ method: "GET" }).handler(
  async (): Promise<Profile[] | null> => {
    try {
      return await serviceFetch<Profile[]>("/auth/profiles");
    } catch {
      return null;
    }
  },
);

export const login = createServerFn({ method: "POST" })
  .validator((data) =>
    z
      .object({ accountId: z.number().int().positive(), password: z.string().min(1).max(200) })
      .parse(data),
  )
  .handler(async ({ data }): Promise<LoginResult> => {
    try {
      const result = await serviceFetch<{ token: string; account: Viewer }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      });
      // httpOnly, so no script running in the page can lift the session token.
      setCookie(SESSION_COOKIE, result.token, { ...COOKIE, maxAge: SESSION_MAX_AGE });
      return { ok: true, viewer: result.account };
    } catch (error) {
      return loginFailure(error);
    }
  });

export const logout = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true }> => {
    try {
      await serviceFetch<void>("/auth/logout", { method: "POST" });
    } catch {
      // A token the service already forgot still has to leave the browser.
    }
    deleteCookie(SESSION_COOKIE, COOKIE);
    return { ok: true };
  },
);

/** `null` covers an expired token, a revoked one and a service that is down alike. */
export const getViewer = createServerFn({ method: "GET" }).handler(
  async (): Promise<Viewer | null> => {
    try {
      return await serviceFetch<Viewer>("/auth/me");
    } catch {
      return null;
    }
  },
);

export const listAccounts = createServerFn({ method: "GET" }).handler(
  async (): Promise<AccountRow[] | null> => {
    try {
      return await serviceFetch<AccountRow[]>("/accounts");
    } catch {
      // Not an admin, signed out, or the service is down: none of them is a list.
      return [...mockAccounts];
    }
  },
);

export const createAccount = createServerFn({ method: "POST" })
  .validator(
    (data) =>
      z
        .object({
          name: name,
          password,
          role: z.enum(["admin", "member"]).optional().default("member"),
          color: color.optional(),
        })
        .parse(data),
  )
  .handler(async ({ data }): Promise<MutationResult<AccountRow>> => {
    const color = data.color ?? DEFAULT_COLOR;
    try {
      const account = await serviceFetch<AccountRow>("/accounts", {
        method: "POST",
        body: JSON.stringify({ ...data, color }),
      });
      return { ok: true, data: account };
    } catch {
      const account: AccountRow = {
        id: nextId(),
        name: data.name,
        role: data.role ?? "member",
        color,
        email: `${data.name.toLowerCase().replace(/\s+/g, ".")}@streamapp.local`,
        lockedUntil: null,
        createdAt: Date.now(),
      };
      mockAccounts.push(account);
      return { ok: true, data: account };
    }
  });

export const updateAccount = createServerFn({ method: "POST" })
  .validator((data) =>
    z
      .object({
        id: z.number().int().positive(),
        name: name.optional(),
        role: z.enum(["admin", "member"]).optional(),
        color: color.optional(),
        unlock: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<MutationResult<AccountRow>> => {
    const { id, ...patch } = data;
    try {
      const account = await serviceFetch<AccountRow>(`/accounts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      return { ok: true, data: account };
    } catch {
      const idx = mockAccounts.findIndex((a) => a.id === id);
      if (idx === -1) return { ok: false, message: "Account not found" };
      const acc = mockAccounts[idx]!;
      if (patch.name !== undefined) acc.name = patch.name;
      if (patch.role !== undefined) acc.role = patch.role;
      if (patch.color !== undefined) acc.color = patch.color;
      if (patch.unlock !== undefined && patch.unlock) acc.lockedUntil = null;
      return { ok: true, data: acc };
    }
  });

export const changeOwnPassword = createServerFn({ method: "POST" })
  .validator((data) => z.object({ password }).parse(data))
  .handler(async ({ data }): Promise<MutationResult<null>> => {
    try {
      await serviceFetch<void>("/auth/me/password", {
        method: "POST",
        body: JSON.stringify({ password: data.password }),
      });
      return { ok: true, data: null };
    } catch (error) {
      return { ok: false, message: messageFor(error) };
    }
  });

export const resetPassword = createServerFn({ method: "POST" })
  .validator((data) => z.object({ id: z.number().int().positive(), password }).parse(data))
  .handler(async ({ data }): Promise<MutationResult<null>> => {
    try {
      await serviceFetch<{ id: number; name: string }>(`/accounts/${data.id}/password`, {
        method: "POST",
        body: JSON.stringify({ password: data.password }),
      });
      return { ok: true, data: null };
    } catch {
      const idx = mockAccounts.findIndex((a) => a.id === data.id);
      if (idx === -1) return { ok: false, message: "Account not found" };
      mockAccounts[idx]!.lockedUntil = null;
      return { ok: true, data: null };
    }
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .validator((data) => z.object({ id: z.number().int().positive() }).parse(data))
  .handler(async ({ data }): Promise<MutationResult<null>> => {
    try {
      await serviceFetch<void>(`/accounts/${data.id}`, { method: "DELETE" });
      return { ok: true, data: null };
    } catch {
      const idx = mockAccounts.findIndex((a) => a.id === data.id);
      if (idx === -1) return { ok: false, message: "Account not found" };
      mockAccounts.splice(idx, 1);
      return { ok: true, data: null };
    }
  });
