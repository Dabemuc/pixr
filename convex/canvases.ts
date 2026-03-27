import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("canvases")
      .withIndex("by_updated")
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("canvases") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

export const create = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, { name, description }) => {
    return ctx.db.insert("canvases", {
      name,
      description,
      updatedAt: Date.now(),
      position: Date.now(),
    });
  },
});

export const reorder = mutation({
  args: {
    id: v.id("canvases"),
    position: v.number(),
    folderId: v.optional(v.id("folders")),
  },
  handler: async (ctx, { id, position, folderId }) => {
    await ctx.db.patch(id, { position, folderId, updatedAt: Date.now() });
  },
});

export const rename = mutation({
  args: { id: v.id("canvases"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    await ctx.db.patch(id, { name, updatedAt: Date.now() });
  },
});

export const moveToFolder = mutation({
  args: {
    id: v.id("canvases"),
    folderId: v.optional(v.id("folders")),
  },
  handler: async (ctx, { id, folderId }) => {
    await ctx.db.patch(id, { folderId, updatedAt: Date.now() });
  },
});

export const deleteCanvas = mutation({
  args: { id: v.id("canvases") },
  handler: async (ctx, { id }) => {
    const images = await ctx.db
      .query("images")
      .withIndex("by_canvas", (q) => q.eq("canvasId", id))
      .collect();

    const storageKeys = images.map((img) => img.storageKey);

    for (const image of images) {
      await ctx.db.delete(image._id);
    }
    await ctx.db.delete(id);

    if (storageKeys.length > 0) {
      await ctx.scheduler.runAfter(0, internal.storage.deleteObjects, {
        keys: storageKeys,
      });
    }
  },
});
