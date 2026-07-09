/** Tipos mínimos para Edge Functions (Deno). El runtime real es Supabase/Deno. */
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
