import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByCanvas = query({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
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
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("shapes", { ...args, updatedAt: Date.now() });
  },
});

export const move = mutation({
  args: { id: v.id("shapes"), x: v.number(), y: v.number() },
  handler: async (ctx, { id, x, y }) => {
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
    await ctx.db.patch(id, { x, y, x2, y2, updatedAt: Date.now() });
  },
});

export const setContent = mutation({
  args: { id: v.id("shapes"), content: v.string() },
  handler: async (ctx, { id, content }) => {
    await ctx.db.patch(id, { content, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("shapes") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const reorder = mutation({
  args: { id: v.id("shapes"), zIndex: v.number() },
  handler: async (ctx, { id, zIndex }) => {
    await ctx.db.patch(id, { zIndex, updatedAt: Date.now() });
  },
});
