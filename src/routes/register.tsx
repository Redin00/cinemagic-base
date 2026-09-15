import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAccount } from "@/lib/auth.functions";
import { useTranslation } from "@/lib/i18n-hook";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Create account - StreamApp - Rdn" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    setBusy(true);
    setError(null);
    try {
      const result = await registerAccount({ data: { name, password } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["profiles"] });
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
      router.history.push("/login");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("misc_error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-10 flex items-center gap-2">
        <span className="size-2.5 rounded-full bg-primary" />
        <span className="font-display text-xl font-semibold tracking-tight">StreamApp - Rdn</span>
      </div>
      <div className="w-full max-w-sm">
        <button
          type="button"
          onClick={() => router.history.push("/login")}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("auth_backToProfiles")}
        </button>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t("auth_signUp")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("auth_inviteOnly")}</p>
        <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("auth_name")}</Label>
            <Input id="name" name="name" autoComplete="name" required maxLength={40} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth_password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              maxLength={200}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? t("auth_creatingAccount") : t("auth_signUp")}
          </Button>
        </form>
      </div>
    </div>
  );
}
