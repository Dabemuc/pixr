import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAuth } from "./_auth";

export const listByCanvas = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      const canvas = await ctx.db.get(canvasId);
      if (!canvas?.isPublic) return [];
    }
    return ctx.db
      .query("images")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .order("asc")
      .collect();
  },
});

export const add = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const existing = await ctx.db
      .query("images")
      .withIndex("by_canvas", (q) => q.eq("canvasId", args.canvasId))
      .collect();
    const maxZ = existing.reduce((m, img) => Math.max(m, img.zIndex), 0);

    return ctx.db.insert("images", {
      ...args,
      zIndex: maxZ + 1,
      updatedAt: Date.now(),
    });
  },
});

export const move = mutation({
  args: { id: v.id("images"), x: v.number(), y: v.number() },
  handler: async (ctx, { id, x, y }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, { x, y, updatedAt: Date.now() });
  },
});

export const resize = mutation({
  args: {
    id: v.id("images"),
    x: v.number(),
    y: v.number(),
    w: v.number(),
    h: v.number(),
  },
  handler: async (ctx, { id, x, y, w, h }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, { x, y, w, h, updatedAt: Date.now() });
  },
});

export const setDescription = mutation({
  args: { id: v.id("images"), description: v.string() },
  handler: async (ctx, { id, description }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, { description, updatedAt: Date.now() });
  },
});

export const setDescriptionAlign = mutation({
  args: { id: v.id("images"), align: v.union(v.literal("left"), v.literal("center")) },
  handler: async (ctx, { id, align }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, { descriptionAlign: align, updatedAt: Date.now() });
  },
});

export const reorder = mutation({
  args: { id: v.id("images"), zIndex: v.number() },
  handler: async (ctx, { id, zIndex }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, { zIndex, updatedAt: Date.now() });
  },
});

export const deleteImage = mutation({
  args: { id: v.id("images") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    const image = await ctx.db.get(id);
    if (!image) return;
    await ctx.db.delete(id);
    await ctx.scheduler.runAfter(0, internal.storage.deleteObjects, {
      keys: [image.storageKey],
    });
  },
});
