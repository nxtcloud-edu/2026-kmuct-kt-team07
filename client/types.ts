import type { Category, Product, ProductGroup } from "../shared/domain";
import type { AnalysisResult } from "../src/analysis";
import type { PathsResult } from "../server/resolver";

export type RecordResult = {
  revision: number;
  id: string;
  createdAt: number;
  state: "queued" | "processing" | "ready";
  query: string;
  category: Category;
  group?: ProductGroup;
  selectedVariantId: string | null;
  analysis: AnalysisResult | null;
  answers: Record<string, string>;
  feedback: unknown[];
  candidates: Product[];
  photoHints?: {
    products: Product[];
    description: string;
    reasons: Record<string, string[]>;
    kinds: string[];
    best: string | null;
    /** What the photo looks like in searchable words, e.g. "LG 에어로타워". */
    guess: string;
  };
  paths: PathsResult;
};
export type PartCard = PathsResult["cards"][number];
export type Photo = {
  file: File;
  url: string;
  role: "full" | "part" | "label";
};
export type Recent = {
  id: string;
  createdAt: number;
  state: string;
  category: Category;
  label: string;
};
/** One decision per page. `part` is the purchase detail of a single part. */
export type Page =
  "home" | "photo" | "browse" | "confirm" | "parts" | "part" | "help";
