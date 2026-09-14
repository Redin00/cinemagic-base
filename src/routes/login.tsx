import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Lock } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getProfiles, login } from "@/lib/auth.functions";
import { historyQuery, libraryQuery, viewerQuery } from "@/lib/auth/queries";
import type { Profile } from "@/lib/auth/types";
import { useTranslation } from "@/lib/i18n-hook";

function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value[0] === "/" && value[1] !== "/" && value[1] !== "\\" ? value : undefined;
}

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in - StreamApp - Rdn" }] }),
  validateSearch: (search: Record<string, unknown>): { next?: string | undefined } => ({
    next: safeNext(search["next"]),
  }),
  component: LoginPage,
});

function minutesLeft(seconds: number) {
  return Math.max(1, Math.ceil(seconds / 60));
}

function LoginPage() {
  const { next } = Route.useSearch();
  const router = useRouter();
  const queryClient = useQueryClient();
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: () => getProfiles() });
  const { t } = useTranslation();

  const [selected, setSelected] = useState<Profile | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function choose(profile: Profile) {
    setSelected(profile);
    setPassword("");
    setError(null);
    setLocked(profile.locked ? t("auth_error") : null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy || locked) return;

    setBusy(true);
    setError(null);
    const result = await login({ data: { accountId: selected.id, password } });
    setBusy(false);

    if (!result.ok) {
      if (result.retryAfter !== undefined) {
        setLocked(`${t("auth_error")} — ${minutesLeft(result.retryAfter)} min.`);
        void profiles.refetch();
      } else {
        setError(
          result.attemptsLeft === undefined
            ? result.message
            : `${result.message} · ${result.attemptsLeft} left before this profile locks.`,
        );
      }
      return;
    }

    queryClient.setQueryData(viewerQuery.queryKey, result.viewer);
    queryClient.removeQueries({ queryKey: libraryQuery.queryKey });
    queryClient.removeQueries({ queryKey: historyQuery.queryKey });
    queryClient.removeQueries({ queryKey: ["profiles"] });
    router.history.push(next ?? "/");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-10 flex items-center gap-2">
        <span className="size-2.5 rounded-full bg-primary" />
        <span className="font-display text-xl font-semibold tracking-tight">StreamApp - Rdn</span>
      </div>

      {profiles.isPending ? (
        <p className="text-sm text-muted-foreground">{t("auth_loading")}</p>
      ) : profiles.data === null || profiles.data === undefined ? (
        <div className="max-w-sm text-center">
          <p className="text-sm text-muted-foreground">{t("misc_error")}</p>
          <Button variant="outline" className="mt-4" onClick={() => void profiles.refetch()}>
            {t("misc_retry")}
          </Button>
        </div>
      ) : selected ? (
        <div className="w-full max-w-sm">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {t("auth_backToProfiles")}
          </button>
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-11">
                {selected.profilePicture ? (
                  <img
                    src={selected.profilePicture}
                    alt={selected.name}
                    className="aspect-square h-full w-full rounded-lg object-cover"
                  />
                ) : (
                  <AvatarFallback
                    style={{ backgroundColor: selected.color }}
                    className="text-lg font-semibold text-white"
                  >
                    {selected.name.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                )}
              </Avatar>
              <div>
                <Label htmlFor="password" className="text-base text-foreground">
                  {selected.name}
                </Label>
                <p className="text-xs text-muted-foreground">{t("auth_password")}</p>
              </div>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              disabled={locked !== null}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth_password")}
            />
            {profiles.data.length === 1 && profiles.data[0]?.id === 1 && password.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Demo: use password "admin123" (service unreachable)
              </p>
            ) : null}
            {locked ? (
              <p className="flex items-start gap-1.5 text-sm text-destructive">
                <Lock className="mt-0.5 size-4 shrink-0" />
                {locked}
              </p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              type="submit"
              className="w-full"
              disabled={busy || locked !== null || password.length === 0}
            >
              {busy ? t("auth_signingIn") : t("auth_signIn")}
            </Button>
          </form>
        </div>
      ) : profiles.data.length === 0 ? (
        <p className="max-w-sm text-center text-sm text-muted-foreground">{t("misc_error")}</p>
      ) : (
        <div className="w-full max-w-lg text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t("auth_welcome")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth_inviteOnly")}</p>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {profiles.data.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => choose(profile)}
                className="group flex flex-col items-center gap-2 rounded-lg p-3 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="relative">
                  <Avatar className="size-16">
                    {profile.profilePicture ? (
                      <img
                        src={profile.profilePicture}
                        alt={profile.name}
                        className="aspect-square h-full w-full rounded-xl object-cover"
                      />
                    ) : (
                      <AvatarFallback
                        style={{ backgroundColor: profile.color }}
                        className="text-2xl font-semibold text-white"
                      >
                        {profile.name.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  {profile.locked ? (
                    <span className="absolute -right-1.5 -bottom-1.5 flex size-6 items-center justify-center rounded-full bg-background ring-1 ring-border">
                      <Lock className="size-3.5 text-muted-foreground" />
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate text-sm text-muted-foreground group-hover:text-foreground">
                  {profile.name}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            {t("auth_noAccount")}{" "}
            <a className="text-foreground underline underline-offset-4" href="/register">
              {t("auth_signUp")}
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
