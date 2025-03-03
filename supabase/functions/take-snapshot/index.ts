// @ts-ignore - Deno imports
import { serve } from 'https://deno.fresh.dev/std@v9.6.1/http/server.ts';
// @ts-ignore - Deno imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface Entry {
  gender: 'male' | 'female';
  type: 'entry' | 'exit';
}

interface Counts {
  male: number;
  female: number;
}

serve(async (_req: Request) => {
  try {
    // Initialize Supabase client
    // @ts-ignore - Deno namespace
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore - Deno namespace
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current counts from entries table
    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select('gender, type');

    if (entriesError) throw entriesError;

    // Calculate current counts
    const counts = (entries as Entry[]).reduce(
      (acc: Counts, entry: Entry) => {
        const change = entry.type === 'entry' ? 1 : -1;
        acc[entry.gender] += change;
        return acc;
      },
      { male: 0, female: 0 }
    );

    const total = counts.male + counts.female;

    // Insert snapshot
    const { error: insertError } = await supabase
      .from('occupancy_snapshots')
      .insert([
        {
          timestamp: new Date().toISOString(),
          male_count: counts.male,
          female_count: counts.female,
          total_count: total,
        },
      ]);

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ success: true, counts }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}); 