import { Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";

type DbCtx = Pick<QueryCtx, "db" | "auth"> | Pick<MutationCtx, "db" | "auth">;

interface ResolvedUser {
  _id: Id<"users">;
  email: string;
  name: string;
  timezone?: string;
  userId: Id<"users">;
}

export async function resolveUser(ctx: DbCtx, _token?: string): Promise<ResolvedUser> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const tokenIdentifier = identity.tokenIdentifier;
  const user = await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();

  if (!user) {
    throw new Error("User profile not initialized");
  }

  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    userId: user._id,
  };
}
