import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeProfilePicture } from "@/lib/auth.functions";
import { setAccountPicture } from "@/lib/auth.functions";
import { Avatar } from "@/components/ui/avatar";
import { Upload, Trash2 } from "lucide-react";
import type { AccountRow } from "@/lib/auth/types";
import { useTranslation } from "@/lib/i18n-hook";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface UploadProfilePictureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPicture?: string | undefined;
  /** Account when called from admin context; omit for own profile. */
  account?: AccountRow | null;
  /** Display name for the description — falls back to account.name. */
  name?: string;
  /** Called after a successful save or remove. */
  onSuccess?: () => void;
}

function readerResult(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Failed to read file"));
    r.readAsDataURL(file);
  });
}

/** Encode a File as a base64 data URL so it can cross the Seroval serialization boundary. */
async function encodeFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Failed to read file"));
    r.readAsDataURL(file);
  });
}

export function UploadProfilePictureDialog({
  open,
  onOpenChange,
  currentPicture,
  account,
  name,
  onSuccess,
}: UploadProfilePictureDialogProps) {
  const [url, setUrl] = useState(currentPicture ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const isAdmin = !!account;
  const accountId = account?.id;
  const displayName = account?.name ?? name ?? "you";

  const description = currentPicture
    ? t("uploadProfilePicture_description_existing", { name: displayName })
    : t("uploadProfilePicture_description", { name: displayName });

  function clearFile() {
    setFile(null);
    setFilePreview(null);
    setError(null);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setError(t("uploadProfilePicture_tooLarge"));
      setFile(null);
      return;
    }
    setFile(f);
    setError(null);
    try {
      const preview = await readerResult(f);
      setFilePreview(preview);
    } catch {
      setFilePreview(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (!file && !url) {
        // Remove current picture — use server function (serializable "").
        const result = isAdmin
          ? await setAccountPicture({ data: { accountId: accountId!, picture: "" } })
          : await changeProfilePicture({ data: { picture: "" } });
        setBusy(false);
        if (!result.ok) {
          setError(result.message);
          return;
        }
      } else if (file) {
        // Encode File as base64 so it can be passed through the server function.
        const encoded = await encodeFile(file);
        const result = isAdmin
          ? await setAccountPicture({ data: { accountId: accountId!, picture: encoded } })
          : await changeProfilePicture({ data: { picture: encoded } });
        setBusy(false);
        if (!result.ok) {
          setError(result.message);
          return;
        }
      } else {
        // URL-based picture — use server function.
        const result = isAdmin
          ? await setAccountPicture({ data: { accountId: accountId!, picture: url || undefined } })
          : await changeProfilePicture({ data: { picture: url || undefined } });
        setBusy(false);
        if (!result.ok) {
          setError(result.message);
          return;
        }
      }

      queryClient.invalidateQueries({ queryKey: isAdmin ? ["accounts"] : ["viewer"] });
      setFile(null);
      setFilePreview(null);
      setUrl("");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : t("misc_error"));
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    const result = isAdmin
      ? await setAccountPicture({ data: { accountId: accountId!, picture: "" } })
      : await changeProfilePicture({ data: { picture: "" } });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: isAdmin ? ["accounts"] : ["viewer"] });
    setUrl("");
    clearFile();
    onOpenChange(false);
    onSuccess?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("uploadProfilePicture_title")}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-url">{t("uploadProfilePicture_url")}</Label>
            <Input
              id="profile-url"
              type="url"
              placeholder="https://..."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-file">{t("uploadProfilePicture_uploadFile")}</Label>
            <Input
              id="profile-file"
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleFileChange}
              className="font-mono"
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} — {t("uploadProfilePicture_sizeLimit")}
              </p>
            )}
          </div>

          {filePreview && (
            <div>
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <div className="mt-1 relative aspect-square w-32 self-center rounded-full border border-border overflow-hidden">
                <img
                  src={filePreview}
                  alt="Selected file preview"
                  className="aspect-square h-full w-full object-cover"
                />
              </div>
            </div>
          )}

          {currentPicture && (
            <div className="flex items-center gap-2">
              <Avatar className="shrink-0">
                <img
                  src={currentPicture}
                  alt="Current profile picture"
                  className="aspect-square h-full w-full object-cover rounded-full"
                />
              </Avatar>
              <span className="text-sm text-muted-foreground">
                {t("uploadProfilePicture_current")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                disabled={busy}
                className="text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="size-3.5" />
                {t("uploadProfilePicture_remove")}
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setUrl("");
                clearFile();
                onOpenChange(false);
              }}
              disabled={busy}
            >
              {t("uploadProfilePicture_cancel")}
            </Button>
            <Button type="submit" disabled={busy} className="gap-1.5">
              <Upload className="size-3.5" />
              {t("uploadProfilePicture_save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
