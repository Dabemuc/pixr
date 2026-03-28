export default {
  providers: [
    {
      // Set CLERK_JWT_ISSUER_DOMAIN in Convex dashboard env vars.
      // Find it in Clerk dashboard → JWT Templates → Convex → Issuer field.
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};
