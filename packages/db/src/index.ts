// Pass explicit configuration; this package does not read ambient environment
// variables or initialize a privileged client on import.
export { createClient } from "@supabase/supabase-js";
export { createBrowserClient, createServerClient } from "@supabase/ssr";
