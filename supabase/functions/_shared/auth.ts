import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.ts';

export interface AuthedUser {
  id: string;
  /** Client acting as the user (row-level security applies). */
  client: SupabaseClient;
}

const env = (k: string) => Deno.env.get(k) ?? '';

/** Verify the caller's Supabase session from the Authorization header. */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new HttpError('Please sign in.', 401);
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(authorization.slice('Bearer '.length));
  if (error || !data.user) throw new HttpError('Please sign in.', 401);
  return { id: data.user.id, client };
}

export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
