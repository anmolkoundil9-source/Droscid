export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const commandSecret = process.env.COMMAND_ROUTE_SECRET ?? "";
export const cleanupSecret = process.env.CLEANUP_ROUTE_SECRET ?? "";

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function hasAdminConfig() {
  return Boolean(supabaseUrl && supabaseServiceKey);
}
