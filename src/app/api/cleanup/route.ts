import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { cleanupSecret } from "@/lib/env";

export async function POST(request: NextRequest) {
  try {
    if (cleanupSecret) {
      const headerSecret = request.headers.get("x-aether-cleanup-secret");
      if (headerSecret !== cleanupSecret) {
        return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
      }
    }

    const admin = createAdminSupabaseClient();
    if (!admin) {
      return NextResponse.json({ ok: false, message: "Aether: the integrated database is not configured." }, { status: 503 });
    }

    const cutoff = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await admin
      .from("messages")
      .delete({ count: "exact" })
      .lt("created_at", cutoff);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      deleted: count ?? 0,
      message: `Aether: removed ${count ?? 0} expired messages.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cleanup error";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
