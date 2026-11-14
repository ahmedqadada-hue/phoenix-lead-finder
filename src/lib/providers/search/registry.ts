import { osm } from "./osm";
import { brave, serper, tavily, youcom } from "./web";
import type { SearchProvider } from "./types";

export const SEARCH_PROVIDERS: SearchProvider[] = [osm, tavily, brave, serper, youcom];

export function getSearchProvider(id: string): SearchProvider | null {
  return SEARCH_PROVIDERS.find((p) => p.id === id) ?? null;
}
