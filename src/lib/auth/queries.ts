import { queryOptions } from "@tanstack/react-query";

import { getViewer } from "../auth.functions";
import { getHistory, getLibrary } from "../library.functions";

/**
 * `staleTime: Infinity` because the viewer only changes on sign-in and sign-out,
 * and both invalidate it explicitly. Without it every navigation would re-run
 * the route guard's round trip to the service.
 */
export const viewerQuery = queryOptions({
  queryKey: ["viewer"],
  queryFn: () => getViewer(),
  staleTime: Infinity,
});

export const libraryQuery = queryOptions({
  queryKey: ["library"],
  queryFn: () => getLibrary(),
});

export const historyQuery = queryOptions({
  queryKey: ["history"],
  queryFn: () => getHistory(),
});
