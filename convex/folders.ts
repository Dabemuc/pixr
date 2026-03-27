import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("folders")
      .withIndex("by_updated")
      .order("asc")
      .collect();
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    return ctx.db.insert("folders", { name, updatedAt: Date.now(), position: Date.now() });
  },
});

export const reorder = mutation({
  args: { id: v.id("folders"), position: v.number() },
  handler: async (ctx, { id, position }) => {
    await ctx.db.patch(id, { position, updatedAt: Date.now() });
  },
});

export const rename = mutation({
  args: { id: v.id("folders"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    await ctx.db.patch(id, { name, updatedAt: Date.now() });
  },
});

export const deleteFolder = mutation({
  args: { id: v.id("folders") },
  handler: async (ctx, { id }) => {
    // Un-folder all canvases inside before deleting
    const canvases = await ctx.db
      .query("canvases")
      .withIndex("by_folder", (q) => q.eq("folderId", id))
      .collect();

    await Promise.all(
      canvases.map((canvas) =>
        ctx.db.patch(canvas._id, { folderId: undefined })
      )
    );

    await ctx.db.delete(id);
  },
});
