import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeOwnPassword } from "@/lib/auth.functions";
import { viewerQuery } from "@/lib/auth/queries";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n-hook";

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const queryClient = useQueryClient();
  const { t } = useTranslation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError(t("reset_passwordsDontMatch"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await changeOwnPassword({ data: { password } });
    setBusy(false);
    if (!result.ok) {
      setError(t("changePassword_error"));
      return;
    }
    queryClient.invalidateQueries({ queryKey: viewerQuery.queryKey });
    onOpenChange(false);
    setPassword("");
    setConfirm("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("changePassword_title")}</DialogTitle>
          <DialogDescription>{t("changePassword_success")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("changePassword_newPassword")}</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              autoComplete="new-password"
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t("changePassword_confirmPassword")}</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setError(null);
                onOpenChange(false);
              }}
            >
              {t("changePassword_cancel")}
            </Button>
            <Button type="submit" disabled={busy || password.length < 6 || password !== confirm}>
              {busy ? t("auth_loading") : t("changePassword_save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
