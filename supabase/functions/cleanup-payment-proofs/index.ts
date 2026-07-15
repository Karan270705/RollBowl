import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

serve(async (req: Request) => {
  // 1. Only allow POST requests for execution
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Validate cleanup secret authorization header
  const providedSecret = req.headers.get("x-cleanup-secret");
  const expectedSecret = Deno.env.get("CLEANUP_SECRET");

  if (!expectedSecret) {
    console.error("CLEANUP_SECRET environment variable is not configured.");
    return new Response(
      JSON.stringify({ error: "Internal server configuration error." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (providedSecret !== expectedSecret) {
    console.warn("Unauthorized cleanup trigger attempt blocked.");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Initialize Supabase client with administrative service role key
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing standard Supabase environment variables.");
    return new Response(
      JSON.stringify({ error: "Internal database configuration error." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  });

  try {
    // 4. Query eligible screenshot records from our secure database view
    // Bounded execution: max 50 rows per batch
    const { data: eligibleProofs, error: fetchError } = await supabase
      .from("eligible_payment_proofs_cleanup")
      .select("id, screenshot_path")
      .limit(50);

    if (fetchError) {
      console.error("Failed to query eligible proofs from view:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch cleanup list: " + fetchError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const scanned = eligibleProofs?.length || 0;
    if (scanned === 0) {
      return new Response(
        JSON.stringify({ scanned: 0, deleted: 0, failed: 0, skipped: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. Gather file paths to delete
    const paths = eligibleProofs.map((p) => p.screenshot_path);

    // 6. Delete the files from the 'payment-proofs' storage bucket
    const { data: deletedFiles, error: deleteError } = await supabase.storage
      .from("payment-proofs")
      .remove(paths);

    // Convert list of successfully deleted files to a Set for O(1) lookup
    // Deno client returns either string paths or objects with names/paths depending on SDK version
    const deletedPathsSet = new Set(
      deletedFiles?.map((f: any) => (typeof f === "string" ? f : f.name || f.path)) || []
    );

    let deletedCount = 0;
    let failedCount = 0;

    // 7. Update database status for each processed record in parallel
    const updatePromises = eligibleProofs.map(async (proof) => {
      const isDeleted = deletedPathsSet.has(proof.screenshot_path);

      if (isDeleted) {
        // Successful storage removal: nullify path and record deletion timestamp
        const { error: updateError } = await supabase
          .from("payment_proofs")
          .update({
            screenshot_deleted_at: new Date().toISOString(),
            screenshot_path: null,
            screenshot_delete_error: null,
            screenshot_delete_attempted_at: new Date().toISOString(),
          })
          .eq("id", proof.id);

        if (updateError) {
          console.error(`DB Update failed for successfully deleted storage file (ID: ${proof.id}):`, updateError);
          failedCount++;
        } else {
          deletedCount++;
        }
      } else {
        // Failed storage removal: record the failure reason and retain the path for future retries
        const errorMessage = deleteError
          ? deleteError.message
          : "Storage deletion failed (path was not returned in successfully deleted list)";
          
        const { error: updateError } = await supabase
          .from("payment_proofs")
          .update({
            screenshot_delete_error: errorMessage.substring(0, 200), // Bounded size
            screenshot_delete_attempted_at: new Date().toISOString(),
          })
          .eq("id", proof.id);

        if (updateError) {
          console.error(`DB Update failed for storage deletion error tracking (ID: ${proof.id}):`, updateError);
        }
        failedCount++;
      }
    });

    await Promise.all(updatePromises);

    // 8. Return metrics report (no sensitive metadata returned)
    return new Response(
      JSON.stringify({
        scanned,
        deleted: deletedCount,
        failed: failedCount,
        skipped: scanned - (deletedCount + failedCount),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Fatal error during cleanup process execution:", errorMsg);
    return new Response(
      JSON.stringify({ error: "Fatal execution error: " + errorMsg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
