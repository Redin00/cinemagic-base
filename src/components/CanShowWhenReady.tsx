import { useEffect, useState } from "react";

import { useLocaleReady } from "@/lib/i18n-provider";

/**
 * Renders `children` only after the i18n locale has been initialized from
 * localStorage (client-side). On the server, or before init completes, renders
 * nothing — this avoids running browser-only hooks (navigator.userAgent,
 * getComputedStyle) during SSR or in the brief window before localStorage is
 * read.
 */
export function CanShowWhenReady({ children }: { children: React.ReactNode }) {
  const ready = useLocaleReady();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !ready) return null;
  return <>{children}</>;
}
