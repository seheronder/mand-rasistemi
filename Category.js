import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tvvnnsjaqomevvocmjbr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DhBTY4H0lw9TfqNgI6-7pg_rPISTA0u";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);