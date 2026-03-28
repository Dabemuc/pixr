import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  folders: defineTable({
    name: v.string(),
    updatedAt: v.number(),
    position: v.optional(v.number()),
    parentFolderId: v.optional(v.id("folders")),
  })
    .index("by_updated", ["updatedAt"])
    .index("by_parent", ["parentFolderId"]),

  canvases: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
    updatedAt: v.number(),
    position: v.optional(v.number()),
    isPublic: v.optional(v.boolean()),
  })
    .index("by_updated", ["updatedAt"])
    .index("by_folder", ["folderId"]),

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
    description: v.optional(v.string()),
    descriptionAlign: v.optional(v.union(v.literal("left"), v.literal("center"))),
    updatedAt: v.number(),
  }).index("by_canvas", ["canvasId"]),

  shapes: defineTable({
    canvasId: v.id("canvases"),
    type: v.union(v.literal("text"), v.literal("arrow")),
    x: v.number(),
    y: v.number(),
    // text box dimensions
    w: v.optional(v.number()),
    h: v.optional(v.number()),
    // arrow endpoint
    x2: v.optional(v.number()),
    y2: v.optional(v.number()),
    content: v.optional(v.string()),
    zIndex: v.number(),
    updatedAt: v.number(),
    // text box style
    textAlign: v.optional(v.union(v.literal("left"), v.literal("center"), v.literal("right"))),
    isHeadline: v.optional(v.boolean()),
    showBorder: v.optional(v.boolean()),
    bgColor: v.optional(v.string()),
    textColor: v.optional(v.string()),
  }).index("by_canvas", ["canvasId"]),
});
