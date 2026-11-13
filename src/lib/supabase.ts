import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Both values are public by design: the publishable key only grants what
 * row-level security allows a signed-in user to do. They can be overridden
 * with VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.
 */
const URL = import.meta.env.VITE_SUPABASE_URL ?? "https://rolvlgtxjrcsczinhgbf.supabase.co";
const KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_S_5S0pgWOiK-FXffZismrw_6MG6E3Ma";

export const supabase = createClient<Database>(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
