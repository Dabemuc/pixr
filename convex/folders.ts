import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./_auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
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
    await requireAuth(ctx);
    return ctx.db.insert("folders", { name, updatedAt: Date.now(), position: Date.now() });
  },
});

export const reorder = mutation({
  args: {
    id: v.id("folders"),
    position: v.number(),
    parentFolderId: v.optional(v.id("folders")),
  },
  handler: async (ctx, { id, position, parentFolderId }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, { position, parentFolderId, updatedAt: Date.now() });
  },
});

export const rename = mutation({
  args: { id: v.id("folders"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, { name, updatedAt: Date.now() });
  },
});

export const deleteFolder = mutation({
  args: { id: v.id("folders") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    // Un-folder all canvases directly inside
    const canvases = await ctx.db
      .query("canvases")
      .withIndex("by_folder", (q) => q.eq("folderId", id))
      .collect();
    await Promise.all(
      canvases.map((canvas) => ctx.db.patch(canvas._id, { folderId: undefined }))
    );

    // Un-parent all nested folders
    const nestedFolders = await ctx.db
      .query("folders")
      .withIndex("by_parent", (q) => q.eq("parentFolderId", id))
      .collect();
    await Promise.all(
      nestedFolders.map((folder) => ctx.db.patch(folder._id, { parentFolderId: undefined }))
    );

    await ctx.db.delete(id);
  },
});
