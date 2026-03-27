import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Provide build-time fallbacks so @supabase/ssr doesn't throw when env vars
  // are not yet configured in the Vercel project settings.
  // These placeholders are ONLY used if the real env vars are absent at build time.
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder_anon_key_for_build',
  },
};

export default nextConfig;
