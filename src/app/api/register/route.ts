import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { normalizeUsername, usernameToEmail } from "@/lib/format";

function makeUid() {
  return `AETHER-${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminSupabaseClient();
    if (!admin) {
      return NextResponse.json({ ok: false, message: "Aether: the integrated database is not configured." }, { status: 503 });
    }

    const body = (await request.json()) as {
      username?: string;
      password?: string;
      avatarUrl?: string | null;
    };

    const username = normalizeUsername(body.username ?? "");
    const password = body.password ?? "";
    const avatarUrl = body.avatarUrl ?? null;

    if (!username) {
      return NextResponse.json({ ok: false, message: "Aether: pick a username first." }, { status: 400 });
    }

    if (!password || password.length < 6) {
      return NextResponse.json({ ok: false, message: "Aether: password must be at least 6 characters." }, { status: 400 });
    }

    const email = usernameToEmail(username);
    const globalRole = username.toLowerCase() === "raga"
      ? "primal_lead"
      : username.toLowerCase() === "kaysss"
        ? "primal"
        : "member";

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
        avatar_url: avatarUrl,
      },
    });

    if (createError || !created.user) {
      return NextResponse.json({ ok: false, message: createError?.message ?? "Aether could not create that account." }, { status: 400 });
    }

    const profile = {
      id: created.user.id,
      uid: makeUid(),
      username,
      display_name: username,
      global_role: globalRole,
      title: globalRole === "member" ? null : "Team Primals",
      title_color: globalRole === "member" ? null : "#ffd0df",
      avatar_url: avatarUrl,
    };

    const { error: profileError } = await admin.from("profiles").upsert(profile);
    if (profileError) {
      return NextResponse.json({ ok: false, message: profileError.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: `Aether: account created for ${username}.`,
      email,
      userId: created.user.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown register error";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
