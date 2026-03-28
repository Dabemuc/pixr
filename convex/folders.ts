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

    // Recursively delete a folder and all its contents
    async function deleteFolderRecursive(folderId: typeof id) {
      // Delete all canvases directly inside
      const canvases = await ctx.db
        .query("canvases")
        .withIndex("by_folder", (q) => q.eq("folderId", folderId))
        .collect();
      await Promise.all(canvases.map((canvas) => ctx.db.delete(canvas._id)));

      // Recurse into nested folders, then delete them
      const nestedFolders = await ctx.db
        .query("folders")
        .withIndex("by_parent", (q) => q.eq("parentFolderId", folderId))
        .collect();
      await Promise.all(nestedFolders.map((folder) => deleteFolderRecursive(folder._id)));

      await ctx.db.delete(folderId);
    }

    await deleteFolderRecursive(id);
  },
});
