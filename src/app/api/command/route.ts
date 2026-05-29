import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { parseSlashCommand } from "@/lib/command";
import { normalizeThemeKey, themeCatalog } from "@/lib/theme";

const PERMANENT_BAN_UNTIL = "9999-12-31T00:00:00.000Z";

async function getActor(request: NextRequest) {
  const admin = createAdminSupabaseClient();
  if (!admin) {
    return null;
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return null;
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle();

  return { admin, user: data.user, profile };
}

async function insertSystemMessage(
  admin: ReturnType<typeof createAdminSupabaseClient>,
  payload: {
    serverId: string;
    channelId?: string;
    content: string;
  },
) {
  if (!admin || !payload.channelId) {
    return;
  }

  await admin.from("messages").insert({
    server_id: payload.serverId,
    channel_id: payload.channelId,
    author_id: null,
    author_name: "Aether",
    author_role: "system",
    author_title: "platform bot",
    content: payload.content,
    kind: "system",
    mentions: [],
    system_tag: "Aether",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      input?: string;
      serverId?: string;
      channelId?: string;
    };

    const input = body.input?.trim() ?? "";
    if (!input.startsWith("/")) {
      return NextResponse.json({ ok: false, message: "Aether: commands must start with /." }, { status: 400 });
    }

    const actor = await getActor(request);
    if (!actor || !actor.profile) {
      return NextResponse.json({ ok: false, message: "Aether: sign in first." }, { status: 401 });
    }

    const command = parseSlashCommand(input);
    if (!command) {
      return NextResponse.json({ ok: false, message: "Aether: I could not read that command." }, { status: 400 });
    }

    const profile = actor.profile;
    const isPrimal = profile.global_role === "primal" || profile.global_role === "primal_lead";
    const serverId = body.serverId;
    const channelId = body.channelId;

    const resolveTarget = async (reference: string) => {
      const { data } = await actor.admin.from("profiles").select("*");
      return (
        data?.find(
          (row) =>
            row.uid?.toLowerCase() === reference.toLowerCase() ||
            row.username?.toLowerCase() === reference.toLowerCase() ||
            row.display_name?.toLowerCase() === reference.toLowerCase(),
        ) ?? null
      );
    };

    const server = serverId
      ? await actor.admin.from("servers").select("*").eq("id", serverId).maybeSingle()
      : null;
    const serverRow = server?.data ?? null;

    if ((command.name !== "invite" && command.name !== "status") && !serverRow) {
      return NextResponse.json({ ok: false, message: "Aether: pick a server first." }, { status: 400 });
    }

    const membership =
      serverRow && !isPrimal
        ? await actor.admin
            .from("server_memberships")
            .select("*")
            .eq("server_id", serverRow.id)
            .eq("user_id", profile.id)
            .maybeSingle()
        : null;

    const actorRole = isPrimal
      ? profile.global_role
      : serverRow?.owner_id === profile.id
        ? "owner"
        : membership?.data?.role ?? "member";

    const canModerate = (targetRole: string | null) => {
      if (isPrimal) {
        return true;
      }
      if (actorRole === "owner") {
        return true;
      }
      if (actorRole !== "admin") {
        return false;
      }
      return targetRole === "member" || targetRole === null;
    };

    switch (command.name) {
      case "invite":
        if (!serverRow) {
          return NextResponse.json({ ok: false, message: "Aether: pick a server first." }, { status: 400 });
        }
        return NextResponse.json({
          ok: true,
          ephemeral: true,
          message: `Aether whisper: ${serverRow.name} invite code is ${serverRow.invite_code}.`,
        });
      case "status": {
        if (!serverRow) {
          return NextResponse.json({ ok: false, message: "Aether: pick a server first." }, { status: 400 });
        }

        const [memberCount, channelCount] = await Promise.all([
          actor.admin.from("server_memberships").select("server_id", { count: "exact", head: true }).eq("server_id", serverRow.id),
          actor.admin.from("channels").select("server_id", { count: "exact", head: true }).eq("server_id", serverRow.id),
        ]);

        const response = `Aether status: ${serverRow.name} was created ${new Date(serverRow.created_at).toLocaleString("en")}. ${memberCount.count ?? 0} members, ${channelCount.count ?? 0} channels, invite ${serverRow.invite_code}, theme ${serverRow.theme}.`;
        return NextResponse.json({ ok: true, ephemeral: true, message: response });
      }
      case "themesset": {
        if (!isPrimal) {
          return NextResponse.json({ ok: false, message: "Aether: only Primals can change the platform theme." }, { status: 403 });
        }

        const requested = normalizeThemeKey(command.args[0] ?? "");
        if (!themeCatalog[requested]) {
          return NextResponse.json({ ok: false, message: "Aether: pick night, cherry, halloween, or valentine." }, { status: 400 });
        }

        const { data: settings } = await actor.admin.from("platform_settings").select("*").eq("id", 1).maybeSingle();
        const lastChangedAt = settings?.last_changed_at ? new Date(settings.last_changed_at).getTime() : 0;
        const lastChangedBy = settings?.last_changed_by ?? null;
        const now = Date.now();
        if (lastChangedBy && lastChangedBy !== profile.id && now - lastChangedAt < 6_000) {
          return NextResponse.json({
            ok: false,
            message: `Aether: theme control is cooling down for ${Math.ceil((6_000 - (now - lastChangedAt)) / 1000)}s.`,
          }, { status: 429 });
        }

        await actor.admin.from("platform_settings").update({
          theme: requested,
          last_changed_at: new Date().toISOString(),
          last_changed_by: profile.id,
        }).eq("id", 1);

        await insertSystemMessage(actor.admin, {
          serverId: serverRow?.id ?? serverId ?? "",
          channelId,
          content: `Aether: the platform theme is now ${themeCatalog[requested].label}.`,
        });

        return NextResponse.json({ ok: true, message: `Aether: the platform theme is now ${themeCatalog[requested].label}.`, nextTheme: requested });
      }
      case "ban":
      case "kick":
      case "mute":
      case "unmute":
      case "unban":
      case "pban":
      case "punban":
      case "title":
      case "untitle": {
        const targetRef = command.args[0] ?? "";
        const target = await resolveTarget(targetRef);
        if (!target && command.name !== "pban" && command.name !== "punban") {
          return NextResponse.json({ ok: false, message: "Aether: I could not find that user." }, { status: 404 });
        }

        const targetRole = target
          ? target.global_role === "primal" || target.global_role === "primal_lead"
            ? target.global_role
            : await actor.admin
                .from("server_memberships")
                .select("role")
                .eq("server_id", serverRow.id)
                .eq("user_id", target.id)
                .maybeSingle()
                .then((res) => res.data?.role ?? null)
          : null;

        if (command.name === "pban" || command.name === "punban") {
          if (!isPrimal) {
            return NextResponse.json({ ok: false, message: "Aether: only Primals can use platform ban controls." }, { status: 403 });
          }
        } else if (!canModerate(targetRole)) {
          return NextResponse.json({ ok: false, message: "Aether: that user is protected by a higher role." }, { status: 403 });
        }

        if (command.name === "ban") {
          await actor.admin.from("server_memberships").update({
            banned_until: PERMANENT_BAN_UNTIL,
            muted_until: null,
          }).eq("server_id", serverRow.id).eq("user_id", target!.id);
          const message = `Aether: user "${target!.username}" ${target!.uid} has been banned from ${serverRow.name}.`;
          await insertSystemMessage(actor.admin, { serverId: serverRow.id, channelId, content: message });
          return NextResponse.json({ ok: true, message });
        }

        if (command.name === "kick") {
          await actor.admin.from("server_memberships").delete().eq("server_id", serverRow.id).eq("user_id", target!.id);
          const message = `Aether: user "${target!.username}" ${target!.uid} has been kicked from ${serverRow.name}.`;
          await insertSystemMessage(actor.admin, { serverId: serverRow.id, channelId, content: message });
          return NextResponse.json({ ok: true, message });
        }

        if (command.name === "mute") {
          const rawDuration = command.args[1] ?? "";
          const match = rawDuration.match(/^(\d+)\s*([smhd])$/i);
          if (!match) {
            return NextResponse.json({ ok: false, message: "Aether: mute time must look like 30s, 15m, 2h, or 1d." }, { status: 400 });
          }
          const value = Number(match[1]);
          const unit = match[2].toLowerCase();
          const millis = value * ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as "s" | "m" | "h" | "d"]);
          await actor.admin.from("server_memberships").update({
            muted_until: new Date(Date.now() + millis).toISOString(),
          }).eq("server_id", serverRow.id).eq("user_id", target!.id);
          const message = `Aether: user "${target!.username}" ${target!.uid} has been muted for ${rawDuration} in ${serverRow.name}.`;
          await insertSystemMessage(actor.admin, { serverId: serverRow.id, channelId, content: message });
          return NextResponse.json({ ok: true, message });
        }

        if (command.name === "unmute") {
          await actor.admin.from("server_memberships").update({
            muted_until: null,
          }).eq("server_id", serverRow.id).eq("user_id", target!.id);
          const message = `Aether: user "${target!.username}" ${target!.uid} has been unmuted in ${serverRow.name}.`;
          await insertSystemMessage(actor.admin, { serverId: serverRow.id, channelId, content: message });
          return NextResponse.json({ ok: true, message });
        }

        if (command.name === "unban") {
          await actor.admin.from("server_memberships").update({
            banned_until: null,
          }).eq("server_id", serverRow.id).eq("user_id", target!.id);
          const message = `Aether: user "${target!.username}" ${target!.uid} has been unbanned from ${serverRow.name}.`;
          await insertSystemMessage(actor.admin, { serverId: serverRow.id, channelId, content: message });
          return NextResponse.json({ ok: true, message });
        }

        if (command.name === "pban") {
          await actor.admin.from("platform_bans").upsert({
            user_id: target!.id,
            banned_by: profile.id,
            created_at: new Date().toISOString(),
          });
          const message = `Aether: user "${target!.username}" ${target!.uid} has been permanently banned from the platform.`;
          await insertSystemMessage(actor.admin, { serverId: serverRow.id, channelId, content: message });
          return NextResponse.json({ ok: true, message });
        }

        if (command.name === "punban") {
          await actor.admin.from("platform_bans").delete().eq("user_id", target!.id);
          const message = `Aether: user "${target!.username}" ${target!.uid} has been restored to the platform.`;
          await insertSystemMessage(actor.admin, { serverId: serverRow.id, channelId, content: message });
          return NextResponse.json({ ok: true, message });
        }

        if (command.name === "title" || command.name === "untitle") {
          const title = command.args.slice(1).join(" ").trim();
          if (command.name === "title" && !title) {
            return NextResponse.json({ ok: false, message: "Aether: provide a title after the user id." }, { status: 400 });
          }

          const canSetTitle =
            isPrimal ||
            actorRole === "owner" ||
            (actorRole === "admin" && target!.id === profile.id);
          if (!canSetTitle) {
            return NextResponse.json({ ok: false, message: "Aether: only owners can title other people." }, { status: 403 });
          }

          await actor.admin.from("server_memberships").update({
            title: command.name === "untitle" ? null : title,
            title_color: command.name === "untitle" ? null : "#ffd0df",
          }).eq("server_id", serverRow.id).eq("user_id", target!.id);

          const message =
            command.name === "title"
              ? `Aether: "${target!.username}" ${target!.uid} now carries the title "${title}".`
              : `Aether: "${target!.username}" ${target!.uid} has had their title removed.`;
          await insertSystemMessage(actor.admin, { serverId: serverRow.id, channelId, content: message });
          return NextResponse.json({ ok: true, message });
        }

        break;
      }
      default:
        return NextResponse.json({ ok: false, message: "Aether: I did not understand that command." }, { status: 400 });
    }

    return NextResponse.json({ ok: false, message: "Aether: nothing happened." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown command error";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
