import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
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
      .query("shapes")
      .withIndex("by_canvas", (q) => q.eq("canvasId", canvasId))
      .collect();
  },
});

export const add = mutation({
  args: {
    canvasId: v.id("canvases"),
    type: v.union(v.literal("text"), v.literal("arrow")),
    x: v.number(),
    y: v.number(),
    w: v.optional(v.number()),
    h: v.optional(v.number()),
    x2: v.optional(v.number()),
    y2: v.optional(v.number()),
    content: v.optional(v.string()),
    zIndex: v.number(),
    textAlign: v.optional(v.union(v.literal("left"), v.literal("center"), v.literal("right"))),
    isHeadline: v.optional(v.boolean()),
    showBorder: v.optional(v.boolean()),
    bgColor: v.optional(v.string()),
    textColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return ctx.db.insert("shapes", { ...args, updatedAt: Date.now() });
  },
});

export const move = mutation({
  args: { id: v.id("shapes"), x: v.number(), y: v.number() },
  handler: async (ctx, { id, x, y }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, { x, y, updatedAt: Date.now() });
  },
});

export const resize = mutation({
  args: {
    id: v.id("shapes"),
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

export const moveArrow = mutation({
  args: {
    id: v.id("shapes"),
    x: v.number(),
    y: v.number(),
    x2: v.number(),
    y2: v.number(),
  },
  handler: async (ctx, { id, x, y, x2, y2 }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, { x, y, x2, y2, updatedAt: Date.now() });
  },
});

export const setContent = mutation({
  args: { id: v.id("shapes"), content: v.string() },
  handler: async (ctx, { id, content }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, { content, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("shapes") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    await ctx.db.delete(id);
  },
});

export const setStyle = mutation({
  args: {
    id: v.id("shapes"),
    textAlign: v.union(v.literal("left"), v.literal("center"), v.literal("right")),
    isHeadline: v.boolean(),
    showBorder: v.boolean(),
    bgColor: v.string(),
    textColor: v.string(),
  },
  handler: async (ctx, { id, textAlign, isHeadline, showBorder, bgColor, textColor }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, { textAlign, isHeadline, showBorder, bgColor, textColor, updatedAt: Date.now() });
  },
});

export const reorder = mutation({
  args: { id: v.id("shapes"), zIndex: v.number() },
  handler: async (ctx, { id, zIndex }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, { zIndex, updatedAt: Date.now() });
  },
});
