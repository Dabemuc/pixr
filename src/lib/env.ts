function requireEnv(key: string): string {
  const val = import.meta.env[key] as string | undefined;
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

export const env = {
  convexUrl: requireEnv("VITE_CONVEX_URL"),
  appEnv: (import.meta.env.VITE_APP_ENV as string | undefined) ?? "local",
};
