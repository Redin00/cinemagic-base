import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";

import { useTranslation } from "@/lib/i18n-hook";

import { AccountMenu } from "@/components/AccountMenu";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { viewerQuery } from "@/lib/auth/queries";
import type { Viewer } from "@/lib/auth/types";

export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ context }) => {
    const viewer = await context.queryClient.ensureQueryData(viewerQuery).catch(() => null);
    if (!viewer) {
      throw redirect({ to: "/login", replace: true });
    }
    return { viewer };
  },
  component: AuthLayout,
});

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/browse", label: "Browse" },
  { to: "/search", label: "Search" },
  { to: "/library", label: "Library" },
] as const;

function AuthLayout() {
  const { viewer } = Route.useRouteContext();
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-4 md:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="size-2.5 rounded-full bg-primary" />
            <span className="font-display text-lg font-semibold tracking-tight">
              StreamApp - Rdn
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageSwitcher />
            <AccountMenu viewer={viewer} />
          </div>
        </div>
        <nav className="flex shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap px-4 scrollbar-none md:overflow-visible md:whitespace-normal md:px-8">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="flex shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:whitespace-normal"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {item.label}
            </Link>
          ))}
          {viewer.role === "admin" ? (
            <Link
              to="/admin"
              className="flex shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground md:whitespace-normal"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              Admin
            </Link>
          ) : null}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-8 md:py-12">
        <Outlet />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-6 text-xs text-muted-foreground md:px-8">
          {t("footer_caption")}
        </div>
      </footer>
    </div>
  );
}
