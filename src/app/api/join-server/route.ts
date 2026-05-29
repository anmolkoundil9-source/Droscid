import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminSupabaseClient();
    if (!admin) {
      return NextResponse.json({ ok: false, message: "Aether: the integrated database is not configured." }, { status: 503 });
    }

    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return NextResponse.json({ ok: false, message: "Aether: sign in first." }, { status: 401 });
    }

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ ok: false, message: "Aether: sign in first." }, { status: 401 });
    }

    const body = (await request.json()) as { inviteCode?: string };
    const inviteCode = body.inviteCode?.trim().toUpperCase() ?? "";
    if (!inviteCode) {
      return NextResponse.json({ ok: false, message: "Aether: provide an invite code." }, { status: 400 });
    }

    const { data: server, error: serverError } = await admin
      .from("servers")
      .select("*")
      .eq("invite_code", inviteCode)
      .maybeSingle();

    if (serverError || !server) {
      return NextResponse.json({ ok: false, message: "Aether: invite code not found." }, { status: 404 });
    }

    const { data: membership } = await admin
      .from("server_memberships")
      .select("*")
      .eq("server_id", server.id)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!membership) {
      await admin.from("server_memberships").insert({
        server_id: server.id,
        user_id: userData.user.id,
        role: "member",
      });
    }

    return NextResponse.json({
      ok: true,
      serverId: server.id,
      message: `Aether: you joined ${server.name}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown join error";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
