import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  canvases: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_updated", ["updatedAt"]),

  images: defineTable({
    canvasId: v.id("canvases"),
    storageKey: v.string(),
    filename: v.string(),
    mimeType: v.string(),
    width: v.number(),
    height: v.number(),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
    zIndex: v.number(),
    updatedAt: v.number(),
  }).index("by_canvas", ["canvasId"]),
});
