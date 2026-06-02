import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { cleanupSecret, cronSecret } from "@/lib/env";

function isAuthorized(request: NextRequest) {
  const expectedSecret = cronSecret || cleanupSecret;
  if (!expectedSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  const legacySecret = request.headers.get("x-aether-cleanup-secret");
  return authHeader === `Bearer ${expectedSecret}` || legacySecret === expectedSecret;
}

async function handleCleanup(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
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

export async function GET(request: NextRequest) {
  return handleCleanup(request);
}

export async function POST(request: NextRequest) {
  return handleCleanup(request);
}
