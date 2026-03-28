import type { MutationCtx, QueryCtx } from "./_generated/server";

/** Throws if the caller is not authenticated. Returns the identity. */
export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity;
}
