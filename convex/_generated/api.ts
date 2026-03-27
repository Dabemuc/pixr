/**
 * Stub — replaced by `npx convex dev`.
 * Uses anyApi so it works at runtime before the real generated file exists.
 */
import { anyApi } from "convex/server";
import type { FunctionReference } from "convex/server";
import type { Id } from "./dataModel";

type CanvasDoc = {
  _id: Id<"canvases">;
  _creationTime: number;
  name: string;
  description?: string;
  updatedAt: number;
};

type ImageDoc = {
  _id: Id<"images">;
  _creationTime: number;
  canvasId: Id<"canvases">;
  storageKey: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  updatedAt: number;
};

type API = {
  canvases: {
    list: FunctionReference<"query", "public", Record<string, never>, CanvasDoc[]>;
    get: FunctionReference<"query", "public", { id: Id<"canvases"> }, CanvasDoc | null>;
    create: FunctionReference<"mutation", "public", { name: string; description?: string }, Id<"canvases">>;
    rename: FunctionReference<"mutation", "public", { id: Id<"canvases">; name: string }, void>;
    deleteCanvas: FunctionReference<"mutation", "public", { id: Id<"canvases"> }, void>;
  };
  images: {
    listByCanvas: FunctionReference<"query", "public", { canvasId: Id<"canvases"> }, ImageDoc[]>;
    add: FunctionReference<
      "mutation",
      "public",
      {
        canvasId: Id<"canvases">;
        storageKey: string;
        filename: string;
        mimeType: string;
        width: number;
        height: number;
        x: number;
        y: number;
        w: number;
        h: number;
      },
      Id<"images">
    >;
    move: FunctionReference<"mutation", "public", { id: Id<"images">; x: number; y: number }, void>;
    resize: FunctionReference<"mutation", "public", { id: Id<"images">; x: number; y: number; w: number; h: number }, void>;
    reorder: FunctionReference<"mutation", "public", { id: Id<"images">; zIndex: number }, void>;
    deleteImage: FunctionReference<"mutation", "public", { id: Id<"images"> }, void>;
  };
};

type InternalAPI = {
  storage: {
    deleteObjects: FunctionReference<"action", "internal", { keys: string[] }, void>;
  };
};

// Runtime values — replaced by real generated values from `npx convex dev`
export const api = anyApi as unknown as API;
export const internal = anyApi as unknown as InternalAPI;
