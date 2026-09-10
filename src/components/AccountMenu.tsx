import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { BookMarked, ChevronDown, KeyRound, LogOut, Shield, Users } from "lucide-react";
import { useTranslation } from "@/lib/i18n-hook";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { logout } from "@/lib/auth.functions";
import { historyQuery, libraryQuery, viewerQuery } from "@/lib/auth/queries";
import type { Viewer } from "@/lib/auth/types";

export function AccountMenu({ viewer }: { viewer: Viewer }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [openChangePassword, setOpenChangePassword] = useState(false);
  const { t } = useTranslation();

  async function signOut() {
    await logout();
    queryClient.setQueryData(viewerQuery.queryKey, null);
    queryClient.removeQueries({ queryKey: libraryQuery.queryKey });
    queryClient.removeQueries({ queryKey: historyQuery.queryKey });
    await router.invalidate();
    void router.navigate({ to: "/login", replace: true });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full outline-none ring-primary focus-visible:ring-2">
          <Avatar className="size-8">
            <AvatarFallback
              style={{ backgroundColor: viewer.color }}
              className="text-xs font-semibold text-white"
            >
              {viewer.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <ChevronDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {t("account_myAccount")} {viewer.name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/library">
              <BookMarked className="size-4" />
              {t("nav_library")}
            </Link>
          </DropdownMenuItem>
          {viewer.role === "admin" ? (
            <DropdownMenuItem asChild>
              <Link to="/admin">
                <Shield className="size-4" />
                {t("admin_title")}
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setOpenChangePassword(true)}>
            <KeyRound className="size-4" />
            {t("account_changePassword")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void router.navigate({ to: "/login" })}>
            <Users className="size-4" />
            {t("account_switchProfile")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut className="size-4" />
            {t("auth_signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog
        open={openChangePassword}
        onOpenChange={setOpenChangePassword}
      />
    </>
  );
}