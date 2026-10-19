import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { createHandler } from './handler.mjs';

Deno.serve(createHandler({
  createClient,
  env: (name: string) => Deno.env.get(name),
}));
