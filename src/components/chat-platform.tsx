"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AtSign,
  Clock3,
  Copy,
  Flame,
  Hash,
  Image as ImageIcon,
  KeyRound,
  LogOut,
  MessageSquareMore,
  MoonStar,
  Paperclip,
  PenLine,
  Plus,
  Reply,
  Send,
  Server,
  Shield,
  ShieldPlus,
  Sparkles,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { buildDemoData } from "@/lib/demo";
import { hasSupabaseConfig } from "@/lib/env";
import {
  cn,
  formatDateTime,
  normalizeUsername,
  toSlug,
  usernameToEmail,
} from "@/lib/format";
import { parseSlashCommand } from "@/lib/command";
import { themeCatalog, themeKeys, normalizeThemeKey } from "@/lib/theme";
import type {
  AttachmentRecord,
  ChatMessage,
  ChannelRecord,
  CommandResult,
  DMThread,
  Profile,
  ServerMembership,
  ServerRecord,
  ServerRole,
  ThemeKey,
} from "@/lib/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type WorkspaceState = ReturnType<typeof buildDemoData> & {
  platformBans: string[];
  themeCooldownUntil: number;
  themeCooldownBy?: string | null;
};

const demoWorkspace = buildDemoData();
const permanentBanUntil = "9999-12-31T00:00:00.000Z";

function isPrimal(profile?: Profile | null) {
  return profile?.globalRole === "primal" || profile?.globalRole === "primal_lead";
}

function isLeadPrimal(profile?: Profile | null) {
  return profile?.globalRole === "primal_lead";
}

function createInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => chars[value % chars.length]).join("");
}

function createServerSeed(name: string, description: string, ownerId: string) {
  const id = `server-${toSlug(name)}-${createInviteCode().slice(0, 4).toLowerCase()}`;
  const channelId = `channel-${createInviteCode().slice(0, 6).toLowerCase()}`;
  const inviteCode = createInviteCode();

  return {
    server: {
      id,
      name,
      description,
      inviteCode,
      ownerId,
      theme: "night" as ThemeKey,
      createdAt: new Date().toISOString(),
      memberCount: 1,
      channelCount: 1,
    } satisfies ServerRecord,
    channel: {
      id: channelId,
      serverId: id,
      name: "lobby",
      slug: "lobby",
      description: "The first room in the server.",
      position: 0,
      createdAt: new Date().toISOString(),
    } satisfies ChannelRecord,
    membership: {
      serverId: id,
      userId: ownerId,
      role: "owner" as ServerRole,
      title: "founder",
      titleColor: "#8bdcff",
      createdAt: new Date().toISOString(),
    } satisfies ServerMembership,
  };
}

function timeLeftLabel(until: number) {
  const diff = Math.max(0, until - Date.now());
  if (diff <= 0) {
    return "ready";
  }
  if (diff < 1000) {
    return "1s";
  }
  return `${Math.ceil(diff / 1000)}s`;
}

function getMembership(
  memberships: ServerMembership[],
  serverId: string,
  userId: string,
) {
  return memberships.find(
    (membership) => membership.serverId === serverId && membership.userId === userId,
  );
}

function getProfileByRef(
  profiles: Profile[],
  reference: string,
): Profile | undefined {
  const normalized = normalizeUsername(reference).toLowerCase();
  return profiles.find(
    (profile) =>
      profile.id === reference ||
      profile.uid.toLowerCase() === reference.toLowerCase() ||
      profile.username.toLowerCase() === normalized ||
      profile.displayName.toLowerCase() === normalized,
  );
}

function durationToMs(input: string) {
  const match = input.trim().match(/^(\d+)\s*([smhd])$/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  const factor = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  }[unit as "s" | "m" | "h" | "d"];

  return value * factor;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function mentionParts(content: string, profiles: Profile[]) {
  const parts: React.ReactNode[] = [];
  const regex = /@([A-Za-z0-9_]+)/g;
  let lastIndex = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content))) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    const mention = match[1];
    const profile = profiles.find(
      (candidate) =>
        candidate.username.toLowerCase() === mention.toLowerCase() ||
        candidate.displayName.toLowerCase() === mention.toLowerCase(),
    );

    parts.push(
      <span
        key={`${mention}-${index}`}
        className="rounded-full border border-[color:var(--line)] bg-white/5 px-1.5 py-0.5 font-medium text-[color:var(--accent-3)]"
      >
        @{profile?.username ?? mention}
      </span>,
    );
    index += 1;
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts;
}

function titleChip(title?: string | null, color?: string | null) {
  if (!title) {
    return null;
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.24em]"
      style={{
        color: color ?? "var(--accent-2)",
        textShadow: `0 0 10px ${color ?? "rgba(255,255,255,0.4)"}`,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--line)",
      }}
    >
      {title}
    </span>
  );
}

function MessageMedia({ attachment }: { attachment?: AttachmentRecord | null }) {
  if (!attachment) {
    return null;
  }

  if (attachment.type === "video") {
    return (
      <video
        className="mt-3 w-full max-w-xl rounded-3xl border border-[color:var(--line)] bg-black/30"
        controls
        playsInline
        src={attachment.url}
      />
    );
  }

  return (
    <img
      className="mt-3 max-h-96 w-full max-w-xl rounded-3xl border border-[color:var(--line)] object-cover"
      src={attachment.url}
      alt={attachment.name}
    />
  );
}

function Avatar({ name, role, avatarUrl }: { name: string; role: string; avatarUrl?: string | null }) {
  const tone =
    role === "system"
      ? "from-zinc-500 to-zinc-700"
      : role === "primal_lead"
        ? "from-pink-400 to-fuchsia-500"
        : role === "primal"
          ? "from-indigo-400 to-cyan-400"
          : "from-emerald-400 to-sky-500";

  if (avatarUrl) {
    return (
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/10 shadow-lg",
          "bg-black/20",
        )}
      >
        <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
      </div>
    );
  }

  if (role === "system") {
    return (
      <div className="flex h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black shadow-lg">
        <img src="/aether-bot.svg" alt="Aether bot" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-sm font-semibold text-white shadow-lg",
        `bg-gradient-to-br ${tone}`,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel rounded-[28px] p-4", className)}>
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-[color:var(--muted)]">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}

export function ChatPlatform() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => ({
    ...buildDemoData(),
    platformBans: [],
    themeCooldownUntil: 0,
    themeCooldownBy: null,
  }));
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [authBusy, startAuthTransition] = useTransition();
  const [signupAvatarUrl, setSignupAvatarUrl] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<"loading" | "ready" | "demo">(
    hasSupabaseConfig() ? "loading" : "demo",
  );
  const [sessionUserId, setSessionUserId] = useState<string | null>(
    hasSupabaseConfig() ? null : demoWorkspace.currentUser.id,
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [selectedDmId, setSelectedDmId] = useState<string>("");
  const [composer, setComposer] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<AttachmentRecord | null>(
    null,
  );
  const [createServerName, setCreateServerName] = useState("");
  const [createServerDescription, setCreateServerDescription] = useState("");
  const [joinInvite, setJoinInvite] = useState("");
  const [moderationTarget, setModerationTarget] = useState("");
  const [moderationTitle, setModerationTitle] = useState("");
  const [promotionTarget, setPromotionTarget] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDescription, setNewChannelDescription] = useState("");
  const [profileAvatarBusy, setProfileAvatarBusy] = useState(false);
  const [inviteToast, setInviteToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const currentProfile = useMemo(() => {
    if (!sessionUserId) {
      return null;
    }
    return workspace.profiles.find((profile) => profile.id === sessionUserId) ?? null;
  }, [sessionUserId, workspace.profiles]);

  const currentServer = useMemo(
    () =>
      workspace.servers.find((server) => server.id === selectedServerId) ??
      workspace.servers[0] ??
      null,
    [selectedServerId, workspace.servers],
  );

  const currentDm = useMemo(
    () => workspace.dms.find((dm) => dm.id === selectedDmId) ?? workspace.dms[0] ?? null,
    [selectedDmId, workspace.dms],
  );

  const currentMembership = useMemo(
    () =>
      currentProfile && currentServer
        ? getMembership(workspace.memberships, currentServer.id, currentProfile.id) ?? null
        : null,
    [currentProfile, currentServer, workspace.memberships],
  );

  const globalIsPrimal = isPrimal(currentProfile);
  const canUsePrimalPanel = isLeadPrimal(currentProfile);
  const canUseModeratorPanel =
    globalIsPrimal || currentMembership?.role === "owner" || currentMembership?.role === "admin";

  const accessibleServers = useMemo(() => {
    if (!currentProfile) {
      return [];
    }

    if (globalIsPrimal) {
      return [...workspace.servers].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    const joined = new Set(
      workspace.memberships
        .filter((membership) => membership.userId === currentProfile.id)
        .map((membership) => membership.serverId),
    );

    return workspace.servers.filter((server) => joined.has(server.id));
  }, [currentProfile, globalIsPrimal, workspace.memberships, workspace.servers]);

  const activeChannels = useMemo(
    () =>
      workspace.channels
        .filter((channel) => channel.serverId === currentServer?.id)
        .sort((a, b) => a.position - b.position),
    [currentServer?.id, workspace.channels],
  );

  const activeChannel = useMemo(
    () =>
      activeChannels.find((channel) => channel.id === selectedChannelId) ??
      activeChannels[0] ??
      null,
    [activeChannels, selectedChannelId],
  );

  const recentMessages = useMemo(() => {
    const cutoff = now - 10 * 24 * 60 * 60 * 1000;
    const list =
      selectedDmId && currentDm
        ? workspace.messages.filter(
            (message) =>
              message.threadId === currentDm.id &&
              new Date(message.createdAt).getTime() >= cutoff,
          )
        : workspace.messages.filter(
            (message) =>
              message.serverId === currentServer?.id &&
              message.channelId === activeChannel?.id &&
              new Date(message.createdAt).getTime() >= cutoff,
          );

    return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [activeChannel?.id, currentDm, currentServer?.id, now, selectedDmId, workspace.messages]);

  const messageLookup = useMemo(() => {
    return new Map(workspace.messages.map((message) => [message.id, message]));
  }, [workspace.messages]);

  const visibleMembers = useMemo(() => {
    if (!currentServer) {
      return [];
    }

    const ids = new Set(
      workspace.memberships
        .filter((membership) => membership.serverId === currentServer.id)
        .map((membership) => membership.userId),
    );

    return workspace.profiles.filter((profile) => ids.has(profile.id));
  }, [currentServer, workspace.memberships, workspace.profiles]);

  const currentServerStatus = useMemo(() => {
    if (!currentServer) {
      return null;
    }

    return {
      createdAt: formatDateTime(currentServer.createdAt),
      inviteCode: currentServer.inviteCode,
      members: workspace.memberships.filter(
        (membership) => membership.serverId === currentServer.id,
      ).length,
      channels: activeChannels.length,
    };
  }, [activeChannels.length, currentServer, workspace.memberships]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (pendingPreview?.url.startsWith("blob:")) {
        URL.revokeObjectURL(pendingPreview.url);
      }
    };
  }, [pendingPreview?.url]);

  async function syncWorkspaceFromSupabase(userId: string) {
    if (!supabase) {
      return;
    }

    try {
      const [
        profilesResult,
        serversResult,
        channelsResult,
        membershipsResult,
        messagesResult,
        dmsResult,
        settingsResult,
      ] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: true }),
        supabase.from("servers").select("*").order("created_at", { ascending: true }),
        supabase.from("channels").select("*").order("position", { ascending: true }),
        supabase.from("server_memberships").select("*").order("created_at", { ascending: true }),
        supabase
          .from("messages")
          .select("*")
          .gte("created_at", new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString())
          .order("created_at", { ascending: true }),
        supabase.from("dm_threads").select("*").order("last_message_at", { ascending: false }),
        supabase.from("platform_settings").select("*").limit(1).single(),
      ]);

      if (profilesResult.error || serversResult.error || channelsResult.error || membershipsResult.error || messagesResult.error || dmsResult.error) {
        throw profilesResult.error ?? serversResult.error ?? channelsResult.error ?? membershipsResult.error ?? messagesResult.error ?? dmsResult.error;
      }

      const profiles = (profilesResult.data ?? []).map((row) => ({
        id: row.id,
        uid: row.uid ?? `AETHER-${row.id.slice(0, 6).toUpperCase()}`,
        username: row.username,
        displayName: row.display_name ?? row.username,
        globalRole:
          row.global_role === "primal" || row.global_role === "primal_lead"
            ? row.global_role
            : "member",
        title: row.title,
        titleColor: row.title_color,
        avatarUrl: row.avatar_url,
        createdAt: row.created_at,
      })) satisfies Profile[];

      const servers = (serversResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        inviteCode: row.invite_code,
        ownerId: row.owner_id,
        theme: normalizeThemeKey(row.theme),
        createdAt: row.created_at,
        memberCount: 0,
        channelCount: 0,
      })) satisfies ServerRecord[];

      const channels = (channelsResult.data ?? []).map((row) => ({
        id: row.id,
        serverId: row.server_id,
        name: row.name,
        slug: row.slug,
        description: row.description ?? "",
        position: row.position ?? 0,
        createdAt: row.created_at,
      })) satisfies ChannelRecord[];

      const memberships = (membershipsResult.data ?? []).map((row) => ({
        serverId: row.server_id,
        userId: row.user_id,
        role: row.role,
        title: row.title,
        titleColor: row.title_color,
        mutedUntil: row.muted_until,
        bannedUntil: row.banned_until,
        createdAt: row.created_at,
      })) satisfies ServerMembership[];

      const messages = (messagesResult.data ?? []).map((row) => {
        const author = profiles.find((profile) => profile.id === row.author_id);
        return {
          id: row.id,
          serverId: row.server_id,
          channelId: row.channel_id,
          threadId: row.thread_id,
          authorId: row.author_id ?? "aether-system",
          authorName: author?.displayName ?? author?.username ?? "Unknown",
          authorTitle: row.author_title ?? author?.title ?? null,
          authorRole: row.author_role ?? (author?.globalRole ?? "member"),
          content: row.content ?? "",
          kind: row.kind ?? "text",
          createdAt: row.created_at,
          replyToId: row.reply_to_id,
          attachment: row.attachment ?? null,
          mentions: row.mentions ?? [],
          systemTag: row.system_tag ?? null,
        } satisfies ChatMessage;
      });

      const dmThreads = (dmsResult.data ?? []).map((row) => ({
        id: row.id,
        memberIds: [row.member_a_id, row.member_b_id],
        name: row.name ?? "Personal Messages",
        createdAt: row.created_at,
        lastMessageAt: row.last_message_at,
      })) satisfies DMThread[];

      const settingsRow = settingsResult.data ?? {
        theme: "night",
      };

      const sessionProfile = profiles.find((profile) => profile.id === userId);

      setWorkspace({
        currentUser: sessionProfile ?? workspace.currentUser,
        profiles,
        servers: servers.map((server) => ({
          ...server,
          memberCount: memberships.filter((membership) => membership.serverId === server.id).length,
          channelCount: channels.filter((channel) => channel.serverId === server.id).length,
        })),
        channels,
        memberships,
        messages,
        dms: dmThreads,
        platformSettings: {
          theme: normalizeThemeKey(settingsRow.theme),
          lastChangedAt: settingsRow.last_changed_at ?? null,
          lastChangedBy: settingsRow.last_changed_by ?? null,
        },
        platformBans: workspace.platformBans,
        themeCooldownUntil: workspace.themeCooldownUntil,
        themeCooldownBy: workspace.themeCooldownBy,
      });

      if (sessionProfile) {
        setSessionUserId(sessionProfile.id);
      }

      setLoadingState("ready");
    } catch {
      setLoadingState("demo");
      setNotice("Integrated database sync is not ready yet, so the app is using the built-in demo workspace.");
    }
  }

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let cancelled = false;

    const boot = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) {
        return;
      }

      const session = data.session;
      if (!session?.user) {
        setLoadingState("ready");
        return;
      }

      await syncWorkspaceFromSupabase(session.user.id);
    };

    boot().catch(() => {
      if (!cancelled) {
        setLoadingState("demo");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  function addWorkspaceMessage(message: ChatMessage) {
    setWorkspace((current) => ({
      ...current,
      messages: [...current.messages, message],
    }));
  }

  function patchWorkspace(updater: (current: WorkspaceState) => WorkspaceState) {
    setWorkspace((current) => updater(current));
  }

  function resolveTarget(reference: string) {
    return getProfileByRef(workspace.profiles, reference);
  }

  function ensureModerator() {
    if (!currentProfile) {
      throw new Error("You need to sign in first.");
    }

    if (!currentServer) {
      throw new Error("Pick a server first.");
    }

    const membership = getMembership(workspace.memberships, currentServer.id, currentProfile.id);
    const allowed =
      globalIsPrimal ||
      membership?.role === "owner" ||
      membership?.role === "admin";

    if (!allowed) {
      throw new Error("Only owners, admins, or Primals can do that here.");
    }
  }

  function queueNotice(message: string) {
    setInviteToast(message);
    window.setTimeout(() => setInviteToast(null), 4200);
  }

  async function executeCommand(input: string): Promise<CommandResult | null> {
    const command = parseSlashCommand(input);
    if (!command || !currentProfile || !currentServer) {
      return null;
    }

    if (supabase && hasSupabaseConfig()) {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session.session?.access_token;
      if (accessToken) {
        const response = await fetch("/api/command", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            input,
            serverId: currentServer.id,
            channelId: activeChannel?.id,
          }),
        });

        const payload = (await response.json()) as CommandResult;
        if (payload.message) {
          setNotice(payload.message);
        }
        if (payload.ok) {
          await syncWorkspaceFromSupabase(currentProfile.id);
        }
        return payload;
      }
    }

    const targetIdentifier = command.args[0] ?? "";
    const targetProfile = targetIdentifier ? resolveTarget(targetIdentifier) : undefined;
    const membership = getMembership(workspace.memberships, currentServer.id, currentProfile.id);

    const canModerate = (target?: Profile) => {
      if (!target) {
        return false;
      }
      if (globalIsPrimal) {
        return true;
      }
      if (membership?.role === "owner") {
        return true;
      }
      if (membership?.role !== "admin") {
        return false;
      }
      const targetMembership = getMembership(workspace.memberships, currentServer.id, target.id);
      return targetMembership?.role === "member" || !targetMembership;
    };

    switch (command.name) {
      case "invite":
        queueNotice(`Aether whisper: ${currentServer.name} invite code is ${currentServer.inviteCode}.`);
        return {
          ok: true,
          ephemeral: true,
          message: `Aether whisper: ${currentServer.name} invite code is ${currentServer.inviteCode}.`,
        };
      case "status": {
        const memberCount = workspace.memberships.filter(
          (row) => row.serverId === currentServer.id,
        ).length;
        const channelCount = workspace.channels.filter(
          (row) => row.serverId === currentServer.id,
        ).length;
        const response = `Aether status: ${currentServer.name} was created ${formatDateTime(currentServer.createdAt)}. ${memberCount} members, ${channelCount} channels, invite ${currentServer.inviteCode}, theme ${currentServer.theme}.`;
        queueNotice(response);
        return { ok: true, ephemeral: true, message: response };
      }
      case "themesset": {
        if (!globalIsPrimal) {
          return {
            ok: false,
            message: "Aether: only Primals can change the platform theme.",
          };
        }

        if (workspace.themeCooldownUntil > now && workspace.themeCooldownBy !== currentProfile.id) {
          return {
            ok: false,
            message: `Aether: theme control is cooling down for ${timeLeftLabel(workspace.themeCooldownUntil)}.`,
          };
        }

        const requested = normalizeThemeKey(command.args[0] ?? "");
        const nextTheme = themeKeys.includes(requested) ? requested : workspace.platformSettings.theme;
        patchWorkspace((current) => ({
          ...current,
          platformSettings: {
            theme: nextTheme,
            lastChangedAt: new Date().toISOString(),
            lastChangedBy: currentProfile.id,
          },
          themeCooldownUntil: now + 6_000,
          themeCooldownBy: currentProfile.id,
        }));
        const themeLabel = themeCatalog[nextTheme].label;
        const message = `Aether: the platform theme is now ${themeLabel}.`;
        addWorkspaceMessage({
          id: `sys-${createInviteCode()}`,
          serverId: currentServer.id,
          channelId: activeChannel?.id,
          authorId: "aether-system",
          authorName: "Aether",
          authorRole: "system",
          authorTitle: "platform bot",
          content: message,
          kind: "system",
          createdAt: new Date().toISOString(),
          systemTag: "Aether",
        });
        return { ok: true, message, nextTheme };
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
        if (!targetProfile && command.name !== "pban" && command.name !== "punban") {
          return {
            ok: false,
            message: "Aether: I could not find that user.",
          };
        }

        if (command.name === "pban" || command.name === "punban") {
          if (!globalIsPrimal) {
            return { ok: false, message: "Aether: only Primals can use platform ban controls." };
          }
        } else if (!canModerate(targetProfile)) {
          return {
            ok: false,
            message: "Aether: that user is protected by a higher role.",
          };
        }

        if (command.name === "ban") {
          patchWorkspace((current) => ({
            ...current,
            memberships: current.memberships.map((row) =>
                  row.serverId === currentServer.id && row.userId === targetProfile!.id
                ? {
                    ...row,
                    bannedUntil: permanentBanUntil,
                    mutedUntil: null,
                  }
                : row,
            ),
          }));
          const message = `Aether: user "${targetProfile!.username}" ${targetProfile!.uid} has been banned from ${currentServer.name}.`;
          addWorkspaceMessage({
            id: `sys-${createInviteCode()}`,
            serverId: currentServer.id,
            channelId: activeChannel?.id,
            authorId: "aether-system",
            authorName: "Aether",
            authorRole: "system",
            authorTitle: "platform bot",
            content: message,
            kind: "system",
            createdAt: new Date().toISOString(),
            systemTag: "Aether",
          });
          return { ok: true, message };
        }

        if (command.name === "kick") {
          patchWorkspace((current) => ({
            ...current,
            memberships: current.memberships.filter(
              (row) => !(row.serverId === currentServer.id && row.userId === targetProfile!.id),
            ),
          }));
          const message = `Aether: user "${targetProfile!.username}" ${targetProfile!.uid} has been kicked from ${currentServer.name}.`;
          addWorkspaceMessage({
            id: `sys-${createInviteCode()}`,
            serverId: currentServer.id,
            channelId: activeChannel?.id,
            authorId: "aether-system",
            authorName: "Aether",
            authorRole: "system",
            authorTitle: "platform bot",
            content: message,
            kind: "system",
            createdAt: new Date().toISOString(),
            systemTag: "Aether",
          });
          return { ok: true, message };
        }

        if (command.name === "mute") {
          const span = durationToMs(command.args[1] ?? "");
          if (!span) {
            return { ok: false, message: "Aether: mute time must look like 30s, 15m, 2h, or 1d." };
          }

          patchWorkspace((current) => ({
            ...current,
            memberships: current.memberships.map((row) =>
              row.serverId === currentServer.id && row.userId === targetProfile!.id
                ? {
                    ...row,
                    mutedUntil: new Date(now + span).toISOString(),
                  }
                : row,
            ),
          }));
          const message = `Aether: user "${targetProfile!.username}" ${targetProfile!.uid} has been muted for ${command.args[1]} in ${currentServer.name}.`;
          addWorkspaceMessage({
            id: `sys-${createInviteCode()}`,
            serverId: currentServer.id,
            channelId: activeChannel?.id,
            authorId: "aether-system",
            authorName: "Aether",
            authorRole: "system",
            authorTitle: "platform bot",
            content: message,
            kind: "system",
            createdAt: new Date().toISOString(),
            systemTag: "Aether",
          });
          return { ok: true, message };
        }

        if (command.name === "unmute") {
          patchWorkspace((current) => ({
            ...current,
            memberships: current.memberships.map((row) =>
              row.serverId === currentServer.id && row.userId === targetProfile!.id
                ? {
                    ...row,
                    mutedUntil: null,
                  }
                : row,
            ),
          }));
          const message = `Aether: user "${targetProfile!.username}" ${targetProfile!.uid} has been unmuted in ${currentServer.name}.`;
          addWorkspaceMessage({
            id: `sys-${createInviteCode()}`,
            serverId: currentServer.id,
            channelId: activeChannel?.id,
            authorId: "aether-system",
            authorName: "Aether",
            authorRole: "system",
            authorTitle: "platform bot",
            content: message,
            kind: "system",
            createdAt: new Date().toISOString(),
            systemTag: "Aether",
          });
          return { ok: true, message };
        }

        if (command.name === "unban") {
          patchWorkspace((current) => ({
            ...current,
            memberships: current.memberships.map((row) =>
              row.serverId === currentServer.id && row.userId === targetProfile!.id
                ? {
                    ...row,
                    bannedUntil: null,
                  }
                : row,
            ),
          }));
          const message = `Aether: user "${targetProfile!.username}" ${targetProfile!.uid} has been unbanned from ${currentServer.name}.`;
          addWorkspaceMessage({
            id: `sys-${createInviteCode()}`,
            serverId: currentServer.id,
            channelId: activeChannel?.id,
            authorId: "aether-system",
            authorName: "Aether",
            authorRole: "system",
            authorTitle: "platform bot",
            content: message,
            kind: "system",
            createdAt: new Date().toISOString(),
            systemTag: "Aether",
          });
          return { ok: true, message };
        }

        if (command.name === "pban") {
          patchWorkspace((current) => ({
            ...current,
            platformBans: [...new Set([...current.platformBans, targetProfile!.id])],
          }));
          const message = `Aether: user "${targetProfile!.username}" ${targetProfile!.uid} has been permanently banned from the platform.`;
          addWorkspaceMessage({
            id: `sys-${createInviteCode()}`,
            serverId: currentServer.id,
            channelId: activeChannel?.id,
            authorId: "aether-system",
            authorName: "Aether",
            authorRole: "system",
            authorTitle: "platform bot",
            content: message,
            kind: "system",
            createdAt: new Date().toISOString(),
            systemTag: "Aether",
          });
          return { ok: true, message };
        }

        if (command.name === "punban") {
          patchWorkspace((current) => ({
            ...current,
            platformBans: current.platformBans.filter((userId) => userId !== targetProfile!.id),
          }));
          const message = `Aether: user "${targetProfile!.username}" ${targetProfile!.uid} has been restored to the platform.`;
          addWorkspaceMessage({
            id: `sys-${createInviteCode()}`,
            serverId: currentServer.id,
            channelId: activeChannel?.id,
            authorId: "aether-system",
            authorName: "Aether",
            authorRole: "system",
            authorTitle: "platform bot",
            content: message,
            kind: "system",
            createdAt: new Date().toISOString(),
            systemTag: "Aether",
          });
          return { ok: true, message };
        }

        if (command.name === "title" || command.name === "untitle") {
          const titleValue = command.args.slice(1).join(" ").trim();
          if (!titleValue && command.name === "title") {
            return { ok: false, message: "Aether: provide a title after the user id." };
          }

          const canTitleAny =
            globalIsPrimal ||
            currentMembership?.role === "owner" ||
            (currentMembership?.role === "admin" && targetProfile!.id === currentProfile.id);

          if (!canTitleAny) {
            return { ok: false, message: "Aether: only owners can title other people." };
          }

          patchWorkspace((current) => ({
            ...current,
            memberships: current.memberships.map((row) =>
              row.serverId === currentServer.id && row.userId === targetProfile!.id
                ? {
                    ...row,
                    title: command.name === "untitle" ? null : titleValue,
                    titleColor:
                      command.name === "untitle"
                        ? null
                        : row.titleColor ??
                          (workspace.platformSettings.theme === "valentine"
                            ? "#ffd6e9"
                            : "#b48cff"),
                  }
                : row,
            ),
          }));

          const message =
            command.name === "title"
              ? `Aether: "${targetProfile!.username}" ${targetProfile!.uid} now carries the title "${titleValue}".`
              : `Aether: "${targetProfile!.username}" ${targetProfile!.uid} has had their title removed.`;

          addWorkspaceMessage({
            id: `sys-${createInviteCode()}`,
            serverId: currentServer.id,
            channelId: activeChannel?.id,
            authorId: "aether-system",
            authorName: "Aether",
            authorRole: "system",
            authorTitle: "platform bot",
            content: message,
            kind: "system",
            createdAt: new Date().toISOString(),
            systemTag: "Aether",
          });
          return { ok: true, message };
        }
      }
      default:
        return { ok: false, message: "Aether: I did not understand that command." };
    }
  }

  async function sendMessage() {
    if (!currentProfile) {
      queueNotice("Sign in first so Aether knows who you are.");
      return;
    }

    if (platformBanned()) {
      queueNotice("This profile is currently platform-banned.");
      return;
    }

    if (serverBanned) {
      queueNotice("You are banned from this server.");
      return;
    }

    const content = composer.trim();
    if (!content && !pendingFile && !pendingPreview) {
      return;
    }

    if (content.startsWith("/")) {
      const command = await executeCommand(content);
      if (command?.ephemeral) {
        setComposer("");
      }
      if (command && !command.ok) {
        queueNotice(command.message);
      }
      setComposer("");
      return;
    }

    if (!currentServer && !currentDm) {
      queueNotice("Pick a server or Personal Messages thread first.");
      return;
    }

    let attachment: AttachmentRecord | null = pendingPreview;
    if (pendingFile && supabase && hasSupabaseConfig()) {
      const bucket = supabase.storage.from("chat-media");
      const filePath = `${currentProfile.id}/${now}-${pendingFile.name}`;
      const { error: uploadError } = await bucket.upload(filePath, pendingFile, {
        upsert: true,
      });

      if (!uploadError) {
        const { data } = bucket.getPublicUrl(filePath);
        const type = pendingFile.type.startsWith("video/")
          ? "video"
          : pendingFile.type === "image/gif"
            ? "gif"
            : "image";
        attachment = {
          url: data.publicUrl,
          name: pendingFile.name,
          type,
          mimeType: pendingFile.type,
        };
      }
    }

    const timestamp = new Date(now).toISOString();
    const nextMessage: ChatMessage = {
      id: `msg-${createInviteCode()}`,
      serverId: currentServer?.id,
      channelId: currentServer ? activeChannel?.id : undefined,
      threadId: currentDm?.id,
      authorId: currentProfile.id,
      authorName: currentProfile.displayName,
      authorTitle:
        currentMembership?.title ?? currentProfile.title ?? (globalIsPrimal ? "Team Primals" : null),
      authorRole: globalIsPrimal
        ? currentProfile.globalRole
        : (currentMembership?.role ?? currentProfile.globalRole),
      content,
      kind: attachment?.type === "video" ? "video" : attachment?.type === "gif" ? "gif" : attachment?.type === "image" ? "image" : "text",
      createdAt: timestamp,
      replyToId,
      attachment,
      mentions: Array.from(content.matchAll(/@([A-Za-z0-9_]+)/g)).map((match) => match[1]),
    };

    if (supabase && hasSupabaseConfig()) {
      const { data: session } = await supabase.auth.getSession();
      if (session.session?.access_token) {
        await supabase.from("messages").insert({
          server_id: nextMessage.serverId ?? null,
          channel_id: nextMessage.channelId ?? null,
          thread_id: nextMessage.threadId ?? null,
          author_id: nextMessage.authorId,
          author_name: nextMessage.authorName,
          author_title: nextMessage.authorTitle,
          author_role: nextMessage.authorRole,
          content: nextMessage.content,
          kind: nextMessage.kind,
          reply_to_id: nextMessage.replyToId,
          attachment: nextMessage.attachment,
          mentions: nextMessage.mentions,
          system_tag: nextMessage.systemTag,
          created_at: nextMessage.createdAt,
        });
        await syncWorkspaceFromSupabase(currentProfile.id);
        setComposer("");
        setReplyToId(null);
        setPendingFile(null);
        setPendingPreview(null);
        return;
      }
    }

    addWorkspaceMessage(nextMessage);
    setComposer("");
    setReplyToId(null);
    setPendingFile(null);
    setPendingPreview(null);
  }

  function platformBanned() {
    return Boolean(currentProfile && workspace.platformBans.includes(currentProfile.id));
  }

  function handleFile(file: File | null) {
    setPendingFile(file);
    if (!file) {
      setPendingPreview(null);
      return;
    }

    const type = file.type.startsWith("video/")
      ? "video"
      : file.type === "image/gif"
        ? "gif"
        : "image";
    const url = URL.createObjectURL(file);
    setPendingPreview({
      url,
      name: file.name,
      type,
      mimeType: file.type,
    });
  }

  async function handleProfileAvatarUpload(file: File | null) {
    if (!currentProfile) {
      return;
    }

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      queueNotice("Pick an image file for your profile picture.");
      return;
    }

    setProfileAvatarBusy(true);
    try {
      const avatarUrl = await fileToDataUrl(file);

      if (supabase && hasSupabaseConfig()) {
        const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", currentProfile.id);
        if (error) {
          queueNotice(error.message);
          return;
        }

        const { error: authError } = await supabase.auth.updateUser({
          data: {
            avatar_url: avatarUrl,
          },
        });
        if (authError) {
          queueNotice(authError.message);
          return;
        }

        await syncWorkspaceFromSupabase(currentProfile.id);
        queueNotice("Profile picture updated.");
        return;
      }

      patchWorkspace((current) => ({
        ...current,
        currentUser:
          current.currentUser.id === currentProfile.id
            ? { ...current.currentUser, avatarUrl }
            : current.currentUser,
        profiles: current.profiles.map((profile) =>
          profile.id === currentProfile.id ? { ...profile, avatarUrl } : profile,
        ),
      }));
      queueNotice("Profile picture updated.");
    } catch {
      queueNotice("Aether could not read that profile picture.");
    } finally {
      setProfileAvatarBusy(false);
    }
  }

  async function authenticate() {
    if (!supabase || !hasSupabaseConfig()) {
      queueNotice("The integrated database is not configured yet, so continue with demo mode.");
      return;
    }

    const email = usernameToEmail(username);
    startAuthTransition(async () => {
      const response =
        authMode === "signup"
          ? await supabase.auth.signUp({
              email,
              password,
              options: {
                data: {
                  username: normalizeUsername(username),
                  avatar_url: signupAvatarUrl,
                },
              },
            })
          : await supabase.auth.signInWithPassword({
              email,
              password,
            });

      if (response.error) {
        queueNotice(response.error.message);
        return;
      }

      const user = response.data.user;
      if (!user) {
        queueNotice("Aether could not establish a session.");
        return;
      }

      setSessionUserId(user.id);
      setSignupAvatarUrl(null);
      await syncWorkspaceFromSupabase(user.id);
    });
  }

  function enterDemoMode() {
    setSessionUserId(demoWorkspace.currentUser.id);
    setWorkspace((current) => ({
      ...current,
      currentUser: demoWorkspace.currentUser,
      profiles: demoWorkspace.profiles,
      servers: demoWorkspace.servers,
      channels: demoWorkspace.channels,
      memberships: demoWorkspace.memberships,
      messages: demoWorkspace.messages,
      dms: demoWorkspace.dms,
      platformSettings: demoWorkspace.platformSettings,
      platformBans: [],
      themeCooldownUntil: 0,
      themeCooldownBy: null,
    }));
    setLoadingState("demo");
    setNotice("Demo mode is active. Connect the integrated database to persist every action.");
  }

  async function createServer() {
    if (!currentProfile) {
      return;
    }

    if (!createServerName.trim()) {
      queueNotice("Give the new server a name first.");
      return;
    }

    if (supabase && hasSupabaseConfig()) {
      const serverTheme = workspace.platformSettings.theme;
      const { data: serverData, error: serverError } = await supabase
        .from("servers")
        .insert({
          name: createServerName.trim(),
          description: createServerDescription.trim() || "A private room for your friends.",
          owner_id: currentProfile.id,
          theme: serverTheme,
        })
        .select("*")
        .single();

      if (!serverError && serverData) {
        const { data: channelData } = await supabase
          .from("channels")
          .insert({
            server_id: serverData.id,
            name: "lobby",
            slug: "lobby",
            description: "The first room in the server.",
            position: 0,
          })
          .select("*")
          .single();

        await supabase.from("server_memberships").insert({
          server_id: serverData.id,
          user_id: currentProfile.id,
          role: "owner",
          title: "founder",
          title_color: "#8bdcff",
        });

        await syncWorkspaceFromSupabase(currentProfile.id);
        setSelectedServerId(serverData.id);
        setSelectedChannelId(channelData?.id ?? "");
        setSelectedDmId("");
        setCreateServerName("");
        setCreateServerDescription("");
        queueNotice(`Aether: ${serverData.name} is live with invite code ${serverData.invite_code}.`);
        return;
      }
    }

    const seed = createServerSeed(
      createServerName.trim(),
      createServerDescription.trim() || "A private room for your friends.",
      currentProfile.id,
    );

    patchWorkspace((current) => ({
      ...current,
      servers: [...current.servers, { ...seed.server }],
      channels: [...current.channels, seed.channel],
      memberships: [...current.memberships, seed.membership],
    }));

    setSelectedServerId(seed.server.id);
    setSelectedChannelId(seed.channel.id);
    setSelectedDmId("");
    setCreateServerName("");
    setCreateServerDescription("");
    queueNotice(`Aether: ${seed.server.name} is live with invite code ${seed.server.inviteCode}.`);
  }

  async function joinServer() {
    if (!currentProfile) {
      return;
    }

    if (!joinInvite.trim()) {
      queueNotice("Paste a 10-character invite code first.");
      return;
    }

    if (supabase && hasSupabaseConfig()) {
      const { data: session } = await supabase.auth.getSession();
      const accessToken = session.session?.access_token;
      if (accessToken) {
        const response = await fetch("/api/join-server", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ inviteCode: joinInvite.trim().toUpperCase() }),
        });

        const payload = await response.json();
        if (payload.ok) {
          await syncWorkspaceFromSupabase(currentProfile.id);
          setSelectedServerId(payload.serverId ?? selectedServerId);
          setSelectedDmId("");
          setJoinInvite("");
          queueNotice(payload.message);
          return;
        }
        queueNotice(payload.message ?? "Aether could not join that server.");
        return;
      }
    }

    const invite = joinInvite.trim().toUpperCase();
    const server = workspace.servers.find((row) => row.inviteCode === invite);
    if (!server) {
      queueNotice("Aether could not find a server for that invite code.");
      return;
    }

    if (platformBanned()) {
      queueNotice("This profile is platform-banned.");
      return;
    }

    const hasMembership = getMembership(workspace.memberships, server.id, currentProfile.id);
    if (!hasMembership) {
      patchWorkspace((current) => ({
        ...current,
        memberships: [
          ...current.memberships,
          {
            serverId: server.id,
            userId: currentProfile.id,
            role: "member",
            title: null,
            titleColor: null,
            createdAt: new Date().toISOString(),
          },
        ],
        servers: current.servers.map((row) =>
          row.id === server.id ? { ...row, memberCount: row.memberCount + 1 } : row,
        ),
      }));
    }

    setSelectedServerId(server.id);
    setSelectedChannelId(workspace.channels.find((row) => row.serverId === server.id)?.id ?? "");
    setSelectedDmId("");
    setJoinInvite("");
    queueNotice(`Aether: you joined ${server.name}.`);
  }

  function addChannel() {
    if (!currentProfile || !currentServer) {
      return;
    }

    ensureModerator();

    if (!newChannelName.trim()) {
      queueNotice("Give the channel a name first.");
      return;
    }

    const canManage = globalIsPrimal || currentMembership?.role === "owner" || currentMembership?.role === "admin";
    if (!canManage) {
      queueNotice("Only owners, admins, or Primals can manage channels.");
      return;
    }

    const channel: ChannelRecord = {
      id: `channel-${createInviteCode().toLowerCase()}`,
      serverId: currentServer.id,
      name: normalizeUsername(newChannelName).toLowerCase().replace(/\s+/g, "-"),
      slug: toSlug(newChannelName),
      description: newChannelDescription.trim() || "A new room in the server.",
      position: workspace.channels.filter((row) => row.serverId === currentServer.id).length,
      createdAt: new Date().toISOString(),
    };

    patchWorkspace((current) => ({
      ...current,
      channels: [...current.channels, channel],
      servers: current.servers.map((row) =>
        row.id === currentServer.id
          ? { ...row, channelCount: row.channelCount + 1 }
          : row,
      ),
    }));

    setSelectedChannelId(channel.id);
    setNewChannelName("");
    setNewChannelDescription("");
    queueNotice(`Aether: ${channel.name} is now open.`);
  }

  function applyModerationAction(action: "ban" | "kick" | "mute" | "unmute" | "unban" | "title" | "untitle") {
    if (!moderationTarget.trim()) {
      queueNotice("Choose a target user id or username first.");
      return;
    }

    const target = resolveTarget(moderationTarget);
    if (!target) {
      queueNotice("Aether could not resolve that user.");
      return;
    }

    const payload =
      action === "mute"
        ? `/mute ${target.uid} 10m`
        : action === "title"
          ? `/title ${target.uid} ${moderationTitle.trim()}`
          : action === "untitle"
            ? `/untitle ${target.uid}`
            : `/${action} ${target.uid}`;

    void executeCommand(payload);
  }

  function promoteTargetToPrimal() {
    if (!isLeadPrimal(currentProfile)) {
      queueNotice("Only Raga can promote another user to Primal.");
      return;
    }

    const target = resolveTarget(promotionTarget);
    if (!target) {
      queueNotice("Pick a valid user first.");
      return;
    }

    patchWorkspace((current) => ({
      ...current,
      profiles: current.profiles.map((profile) =>
        profile.id === target.id
          ? {
              ...profile,
              globalRole: "primal",
              title: "Team Primals",
              titleColor: "#ffd6e9",
            }
          : profile,
      ),
    }));

    queueNotice(`Aether: ${target.username} is now a Primal.`);
  }

  function copyInviteCode() {
    if (!currentServer) {
      return;
    }

    void navigator.clipboard.writeText(currentServer.inviteCode);
    queueNotice(`Aether: invite code copied for ${currentServer.name}.`);
  }

  const authScreen = (
    <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-stretch gap-6 p-4 md:p-6">
      <div className="panel relative hidden flex-1 overflow-hidden rounded-[36px] p-8 lg:block">
        <div className="absolute inset-0 soft-grid opacity-25" />
        <div className="absolute left-6 top-6 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(255,120,185,0.35),transparent_70%)] blur-2xl" />
        <div className="absolute right-8 top-12 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(105,208,255,0.22),transparent_68%)] blur-3xl" />
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-white/70">
                Droscid
              </p>
              <p className="text-sm text-white/50">
                Private friend chat with servers, Personal Messages, and primals.
              </p>
            </div>
          </div>
          <div className="max-w-xl space-y-6">
            <h1 className="max-w-lg text-5xl font-semibold leading-none tracking-[-0.05em] text-white md:text-7xl">
              Droscid
            </h1>
            <p className="max-w-lg text-lg leading-8 text-white/75">
              A clean Platform with all the data security you guys need.
            </p>
          </div>
        </div>
      </div>

      <div className="panel relative flex w-full max-w-xl flex-col overflow-hidden rounded-[36px] p-6 md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(180,140,255,0.24),transparent_42%)]" />
        <div className="relative z-10 space-y-8">
          <div>
            <p className="text-xs uppercase tracking-[0.38em] text-white/45">
              secure login
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">
              Enter Droscid
            </h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-white/65">
              Use your username and password to sign in. The integrated database
              keeps the front door simple.
            </p>
            <div className="mt-4 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.26em] text-white/55">
              {loadingState === "loading"
                ? "Checking integrated database session"
                : loadingState === "demo"
                  ? "Demo workspace ready"
                  : "Connected to integrated database"}
            </div>
          </div>

          <div className="grid gap-4 rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="flex gap-2 rounded-full border border-white/10 bg-black/20 p-1 text-sm">
              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className={cn(
                  "flex-1 rounded-full px-4 py-2 transition",
                  authMode === "signup" ? "bg-white text-black" : "text-white/70",
                )}
              >
                Sign up
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className={cn(
                  "flex-1 rounded-full px-4 py-2 transition",
                  authMode === "login" ? "bg-white text-black" : "text-white/70",
                )}
              >
                Login
              </button>
            </div>

            <label className="space-y-2 text-sm text-white/70">
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Raga, kaysss, Nova..."
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-[color:var(--accent)]"
              />
            </label>

            <label className="space-y-2 text-sm text-white/70">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Set a password"
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-[color:var(--accent)]"
              />
            </label>

            {authMode === "signup" ? (
              <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={username || "?"} role="member" avatarUrl={signupAvatarUrl} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white">Profile picture</div>
                    <div className="text-xs leading-6 text-white/50">
                      Optional. It shows next to your name across Droscid.
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10">
                    <ImageIcon className="h-4 w-4" />
                    Upload picture
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (!file) {
                          setSignupAvatarUrl(null);
                          return;
                        }
                        if (!file.type.startsWith("image/")) {
                          queueNotice("Pick an image file for your profile picture.");
                          return;
                        }
                        try {
                          const avatarUrl = await fileToDataUrl(file);
                          setSignupAvatarUrl(avatarUrl);
                        } catch {
                          queueNotice("Aether could not read that profile picture.");
                        }
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  {signupAvatarUrl ? (
                    <button
                      type="button"
                      onClick={() => setSignupAvatarUrl(null)}
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 transition hover:bg-white/10"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={authenticate}
              disabled={authBusy}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-semibold text-black transition hover:scale-[1.01] disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" />
              {authMode === "signup" ? "Create account" : "Login"}
            </button>

            {!hasSupabaseConfig() ? (
              <button
                type="button"
                onClick={enterDemoMode}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 font-semibold text-white transition hover:bg-white/10"
              >
                Continue in demo mode
              </button>
            ) : null}
          </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 text-sm text-white/65">
              <div className="mb-3 flex items-center gap-2 text-white">
                <Shield className="h-4 w-4" />
                Protected access
              </div>
              <p className="leading-7">
                Owners and admins keep server controls tidy while private roles stay
                hidden from the public front door.
              </p>
            </div>
        </div>
      </div>
    </div>
  );

  if (!sessionUserId || !currentProfile) {
    return (
      <div className={cn("theme-night min-h-screen", `theme-${workspace.platformSettings.theme}`)}>
        {notice ? (
          <div className="fixed right-4 top-4 z-50 rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-sm text-white shadow-2xl">
            {notice}
          </div>
        ) : null}
        {authScreen}
      </div>
    );
  }

  const platformMuted = platformBanned();
  const serverBanned =
    currentMembership?.bannedUntil !== null &&
    currentMembership?.bannedUntil !== undefined &&
    new Date(currentMembership.bannedUntil).getTime() > now;
  const mutedUntil = currentMembership?.mutedUntil ? new Date(currentMembership.mutedUntil).getTime() : 0;
  const isMuted = mutedUntil > now;
  const serverCreatedAt = currentServerStatus?.createdAt ?? "";
  const renderName = currentProfile.displayName;

  return (
    <div
      className={cn(
        "theme-night min-h-screen overflow-hidden",
        `theme-${workspace.platformSettings.theme}`,
      )}
    >
      <div className="pointer-events-none absolute inset-0 soft-grid opacity-15" />
      <div className="pointer-events-none absolute left-0 top-0 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.12),transparent_70%)] blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-16 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(180,140,255,0.18),transparent_70%)] blur-3xl" />

      {notice ? (
        <div className="fixed right-4 top-4 z-50 max-w-sm rounded-2xl border border-white/10 bg-black/85 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur">
          {notice}
        </div>
      ) : null}

      {inviteToast ? (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-black/80 px-4 py-2 text-sm text-white shadow-2xl">
          {inviteToast}
        </div>
      ) : null}

      <div className="relative mx-auto grid min-h-screen max-w-[1600px] gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)_360px] lg:p-5">
        <aside className="panel relative flex min-h-[calc(100vh-2rem)] flex-col rounded-[32px] p-4 lg:p-5">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] text-black shadow-lg">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Droscid</div>
                <div className="text-xs uppercase tracking-[0.24em] text-white/45">
                  friends only
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setSessionUserId(null);
                setNotice("You have been signed out.");
              }}
              className="rounded-2xl border border-white/10 bg-white/5 p-2 text-white/75 transition hover:bg-white/10"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-5 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <Avatar name={renderName} role={currentProfile.globalRole} avatarUrl={currentProfile.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">
                  {currentProfile.displayName}
                </div>
                <div className="truncate text-xs text-white/45">
                  {currentProfile.username} · {currentProfile.uid}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {titleChip(
                currentMembership?.title ?? currentProfile.title,
                currentMembership?.titleColor ?? currentProfile.titleColor,
              )}
              {globalIsPrimal ? titleChip("Team Primals", "#ffd0df") : null}
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.24em] text-white/50">
                {currentProfile.globalRole}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white transition hover:bg-white/10">
                <ImageIcon className="h-4 w-4" />
                {profileAvatarBusy ? "Updating..." : "Upload picture"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0] ?? null;
                    await handleProfileAvatarUpload(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <div className="text-xs text-white/45">
                Shown beside your name across Droscid.
              </div>
            </div>
          </div>

          <div className="mb-4 grid gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedDmId("");
                setSelectedServerId("");
                if (accessibleServers[0]) {
                  setSelectedServerId(accessibleServers[0].id);
                  const firstChannel = workspace.channels.find(
                    (channel) => channel.serverId === accessibleServers[0].id,
                  );
                  setSelectedChannelId(firstChannel?.id ?? "");
                }
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white transition hover:bg-white/10"
            >
              <Server className="h-4 w-4" />
              Servers
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedServerId("");
                setSelectedChannelId("");
                setSelectedDmId(workspace.dms[0]?.id ?? "");
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white transition hover:bg-white/10"
            >
              <MessageSquareMore className="h-4 w-4" />
              Personal Messages
            </button>
          </div>

          <div className="mb-5 flex-1 overflow-auto scrollbar-thin">
            <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.28em] text-white/45">
              <span>Servers</span>
              <span>{accessibleServers.length}</span>
            </div>
            <div className="space-y-2">
              {accessibleServers.map((server) => {
                const selected = server.id === selectedServerId && !selectedDmId;
                const activeTheme = themeCatalog[server.theme];
                return (
                  <button
                    key={server.id}
                    type="button"
                    onClick={() => {
                      setSelectedServerId(server.id);
                      setSelectedDmId("");
                      const firstChannel = workspace.channels.find(
                        (channel) => channel.serverId === server.id,
                      );
                      setSelectedChannelId(firstChannel?.id ?? "");
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-3xl border px-3 py-3 text-left transition",
                      selected
                        ? "border-white/20 bg-white/10"
                        : "border-white/8 bg-white/5 hover:bg-white/10",
                    )}
                  >
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-semibold text-white"
                      style={{
                        background: `linear-gradient(135deg, ${activeTheme.accent}, ${activeTheme.glow})`,
                      }}
                    >
                      {server.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">
                        {server.name}
                      </div>
                      <div className="truncate text-xs text-white/45">
                        {server.memberCount} members · {server.channelCount} channels
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.24em] text-white/45">
                <span>Join by invite</span>
                <KeyRound className="h-3.5 w-3.5" />
              </div>
              <input
                value={joinInvite}
                onChange={(event) => setJoinInvite(event.target.value.toUpperCase())}
                placeholder="10-character code"
                className="mb-2 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
              />
              <button
                type="button"
                onClick={joinServer}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-black transition hover:scale-[1.01]"
              >
                <Plus className="h-4 w-4" />
                Join server
              </button>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.24em] text-white/45">
                <span>Create server</span>
                <Plus className="h-3.5 w-3.5" />
              </div>
              <input
                value={createServerName}
                onChange={(event) => setCreateServerName(event.target.value)}
                placeholder="Server name"
                className="mb-2 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
              />
              <textarea
                value={createServerDescription}
                onChange={(event) => setCreateServerDescription(event.target.value)}
                placeholder="Short description"
                rows={3}
                className="mb-2 w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
              />
              <button
                type="button"
                onClick={createServer}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] px-3 py-2 text-sm font-semibold text-black transition hover:scale-[1.01]"
              >
                <Sparkles className="h-4 w-4" />
                Create server
              </button>
            </div>
          </div>
        </aside>

        <main className="panel relative flex min-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-[32px]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 lg:px-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-white/45">
                {selectedDmId ? <MessageSquareMore className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
                <span>
                  {selectedDmId ? "Personal Messages" : currentServer?.name ?? "No server selected"}
                </span>
              </div>
              <div className="mt-1 truncate text-lg font-semibold text-white">
                {selectedDmId
                  ? currentDm?.name ?? "Personal Messages"
                  : activeChannel
                    ? `#${activeChannel.name}`
                    : "Pick a channel"}
              </div>
              <div className="truncate text-sm text-white/50">
                {selectedDmId
                  ? "Private thread with a friend."
                  : currentServer?.description ?? "Choose a server to continue."}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyInviteCode}
                className="hidden rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10 md:inline-flex"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy invite
              </button>
              <button
                type="button"
                onClick={() => setNotice(`Aether status: ${currentServer?.name ?? "No server"} opened ${currentServerStatus?.createdAt ?? "recently"}.`)}
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
              >
                Status
              </button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-5">
            <section className="panel-strong flex min-h-0 flex-col rounded-[28px]">
              <div className="flex-1 overflow-auto px-5 py-5 scrollbar-thin lg:px-6">
                {recentMessages.length ? (
                  <div className="space-y-5">
                    {recentMessages.map((message) => {
                      const author = workspace.profiles.find((row) => row.id === message.authorId);
                      const replyTarget = message.replyToId
                        ? messageLookup.get(message.replyToId)
                        : null;
                      const serverMembership =
                        currentServer && author
                          ? getMembership(workspace.memberships, currentServer.id, author.id)
                          : null;
                      const isSystem = message.kind === "system" || message.authorRole === "system";
                      return (
                        <article
                          key={message.id}
                          className={cn(
                            "flex gap-4 rounded-[28px] border border-white/8 bg-white/4 p-4",
                            isSystem && "bg-white/6",
                          )}
                        >
                          <Avatar
                            name={message.authorName}
                            role={message.authorRole}
                            avatarUrl={author?.avatarUrl}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-white">
                                {message.authorName}
                              </div>
                              {titleChip(
                                message.authorTitle ?? serverMembership?.title,
                                serverMembership?.titleColor ?? author?.titleColor,
                              )}
                              {author?.globalRole === "primal" || author?.globalRole === "primal_lead" ? (
                                titleChip("Team Primals", "#ffd0df")
                              ) : null}
                              <span className="text-xs text-white/40">
                                {formatDateTime(message.createdAt)}
                              </span>
                            </div>

                            {replyTarget ? (
                              <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
                                <span className="font-semibold text-white/80">
                                  Replying to {replyTarget.authorName}:
                                </span>{" "}
                                {replyTarget.content.slice(0, 80)}
                              </div>
                            ) : null}

                            <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-white/82">
                              {mentionParts(message.content, workspace.profiles)}
                            </p>

                            <MessageMedia attachment={message.attachment} />

                            <div className="mt-4 flex flex-wrap gap-2">
                              {!isSystem ? (
                                <button
                                  type="button"
                                  onClick={() => setReplyToId(message.id)}
                                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10"
                                >
                                  <Reply className="mr-1 h-3 w-3 inline" />
                                  Reply
                                </button>
                              ) : null}
                              {currentServer && author && author.id !== currentProfile.id ? (
                                <button
                                  type="button"
                                  onClick={() => setComposer((value) => `${value}${value ? " " : ""}@${author.username} `)}
                                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10"
                                >
                                  <AtSign className="mr-1 h-3 w-3 inline" />
                                  Ping
                                </button>
                              ) : null}
                              {currentProfile && globalIsPrimal ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModerationTarget(author?.uid ?? author?.username ?? "");
                                    setNotice(`Target set to ${author?.username ?? "unknown"} for moderation.`);
                                  }}
                                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/10"
                                >
                                  <Shield className="mr-1 h-3 w-3 inline" />
                                  Target
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/12 bg-white/4 p-8 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[28px] bg-white/8 text-white/60">
                      <Hash className="h-7 w-7" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-white">
                      This room is quiet.
                    </h3>
                    <p className="mt-2 max-w-md text-sm leading-7 text-white/55">
                      Say hello, drop a GIF, reply to a message, or use a slash
                      command and let Aether answer for the room.
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 p-4 lg:p-5">
                {replyToId ? (
                  <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                    <div className="min-w-0">
                      <span className="font-semibold text-white">Replying to</span>{" "}
                      {messageLookup.get(replyToId)?.authorName ?? "message"}
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyToId(null)}
                      className="rounded-full p-1 text-white/45 transition hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}

                {pendingPreview ? (
                  <div className="mb-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
                    {pendingPreview.type === "video" ? (
                      <Video className="h-4 w-4" />
                    ) : pendingPreview.type === "gif" ? (
                      <Flame className="h-4 w-4" />
                    ) : (
                      <ImageIcon className="h-4 w-4" />
                    )}
                    <span className="truncate">{pendingPreview.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingFile(null);
                        setPendingPreview(null);
                      }}
                      className="ml-auto rounded-full p-1 text-white/45 transition hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}

                <div className="flex gap-3">
                  <label className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10">
                    <Paperclip className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/*,video/*,.gif"
                      className="hidden"
                      onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  <div className="flex-1 rounded-[28px] border border-white/10 bg-black/20 p-3">
                    <textarea
                      value={composer}
                      onChange={(event) => setComposer(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder={
                        isMuted
                          ? "You are muted for a while."
                          : platformMuted
                            ? "This profile is platform-banned."
                            : selectedDmId
                              ? "Send a Personal Message..."
                              : `Message #${activeChannel?.name ?? "channel"}`
                      }
                      disabled={isMuted || platformMuted}
                      className="min-h-20 w-full resize-none bg-transparent text-[15px] leading-7 text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed"
                    />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-white/45">
                        <Clock3 className="h-3.5 w-3.5" />
                        Messages older than 10 days are removed from view.
                      </div>
                      <button
                        type="button"
                        onClick={() => void sendMessage()}
                        disabled={isMuted || platformMuted}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] px-4 py-2 text-sm font-semibold text-black transition hover:scale-[1.01] disabled:opacity-60"
                      >
                        <Send className="h-4 w-4" />
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <aside className="flex min-h-0 flex-col gap-4 overflow-hidden">
              <SectionCard title="Server status" icon={<Shield className="h-3.5 w-3.5" />}>
                {currentServer ? (
                  <div className="space-y-3 text-sm text-white/70">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-white">{currentServer.name}</div>
                      <div className="mt-1 text-xs leading-6 text-white/50">
                        {currentServer.description}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[11px] uppercase tracking-[0.26em] text-white/45">
                          Created
                        </div>
                        <div className="mt-1 text-white">{serverCreatedAt}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[11px] uppercase tracking-[0.26em] text-white/45">
                          Invite
                        </div>
                        <div className="mt-1 font-mono text-white">{currentServer.inviteCode}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[11px] uppercase tracking-[0.26em] text-white/45">
                          Members
                        </div>
                        <div className="mt-1 text-white">{currentServerStatus?.members ?? 0}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[11px] uppercase tracking-[0.26em] text-white/45">
                          Theme
                        </div>
                        <div className="mt-1 text-white">{themeCatalog[workspace.platformSettings.theme].label}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={copyInviteCode}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
                    >
                      <Copy className="h-4 w-4" />
                      Copy invite code
                    </button>
                    <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
                      <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-white/45">
                        <span>Add channel</span>
                        <Hash className="h-3.5 w-3.5" />
                      </div>
                      <input
                        value={newChannelName}
                        onChange={(event) => setNewChannelName(event.target.value)}
                        placeholder="channel name"
                        className="mb-2 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                      />
                      <input
                        value={newChannelDescription}
                        onChange={(event) => setNewChannelDescription(event.target.value)}
                        placeholder="channel description"
                        className="mb-2 w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                      />
                      <button
                        type="button"
                        onClick={addChannel}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-black transition hover:scale-[1.01]"
                      >
                        <Plus className="h-4 w-4" />
                        Add channel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-white/60">Select a server to see details.</div>
                )}
              </SectionCard>

              <SectionCard title="Members" icon={<Users className="h-3.5 w-3.5" />}>
                <div className="max-h-72 space-y-2 overflow-auto scrollbar-thin pr-1">
                  {visibleMembers.map((profile) => {
                    const membership = getMembership(workspace.memberships, currentServer?.id ?? "", profile.id);
                    const banned = membership?.bannedUntil
                      ? new Date(membership.bannedUntil).getTime() > now
                      : false;
                    const muted = membership?.mutedUntil
                      ? new Date(membership.mutedUntil).getTime() > now
                      : false;
                    return (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => {
                          setModerationTarget(profile.uid);
                          setComposer((value) => `${value}${value ? " " : ""}@${profile.username} `);
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left transition hover:bg-white/10"
                      >
                        <Avatar
                          name={profile.displayName}
                          role={profile.globalRole}
                          avatarUrl={profile.avatarUrl}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-white">
                            {profile.displayName}
                          </div>
                          <div className="truncate text-xs text-white/45">
                            {profile.username} · {profile.uid}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {titleChip(membership?.title ?? profile.title, membership?.titleColor ?? profile.titleColor)}
                            {profile.globalRole === "primal" || profile.globalRole === "primal_lead"
                              ? titleChip("Team Primals", "#ffd0df")
                              : null}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-[0.22em] text-white/45">
                          {profile.id === currentServer?.ownerId ? <span>Owner</span> : null}
                          {membership?.role === "admin" ? <span>Admin</span> : null}
                          {banned ? <span className="text-[color:var(--danger)]">Banned</span> : null}
                          {muted ? <span className="text-[color:var(--accent-3)]">Muted</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard title="Commands" icon={<PenLine className="h-3.5 w-3.5" />}>
                <div className="space-y-2 text-sm text-white/70">
                  {[
                    "/ban <userid>",
                    "/unban <userid>",
                    "/mute <userid> <1s|1m|1h|1d>",
                    "/unmute <userid>",
                    "/kick <userid>",
                    "/invite",
                    "/status",
                    "/themesset <theme>",
                    "/pban <userid>",
                    "/punban <userid>",
                  ].map((command) => (
                    <div
                      key={command}
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white/70"
                    >
                      {command}
                    </div>
                  ))}
                </div>
              </SectionCard>

              {canUseModeratorPanel ? (
                <SectionCard title="Moderation console" icon={<ShieldPlus className="h-3.5 w-3.5" />}>
                  <div className="space-y-3 text-sm text-white/70">
                    <input
                      value={moderationTarget}
                      onChange={(event) => setModerationTarget(event.target.value)}
                      placeholder="username or UID"
                      className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                    />
                    <input
                      value={moderationTitle}
                      onChange={(event) => setModerationTitle(event.target.value)}
                      placeholder="title text"
                      className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["ban", "Ban"],
                        ["kick", "Kick"],
                        ["mute", "Mute"],
                        ["unmute", "Unmute"],
                        ["unban", "Unban"],
                        ["title", "Title"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            applyModerationAction(value as "ban" | "kick" | "mute" | "unmute" | "unban" | "title")
                          }
                          className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => applyModerationAction("untitle")}
                        className="col-span-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
                      >
                        Clear title
                      </button>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-6 text-white/55">
                      Select a member and use these buttons to apply the server
                      actions. Owners and admins can target members below them in
                      the hierarchy, while primals can override everything.
                    </div>
                  </div>
                </SectionCard>
              ) : null}

              {canUsePrimalPanel ? (
                <SectionCard title="Primal panel" icon={<MoonStar className="h-3.5 w-3.5" />}>
                  <div className="space-y-3 text-sm text-white/70">
                    <div className="grid grid-cols-2 gap-2">
                      {themeKeys.map((theme) => (
                        <button
                          key={theme}
                          type="button"
                          onClick={() => {
                            if (workspace.themeCooldownUntil > now && workspace.themeCooldownBy !== currentProfile.id) {
                              queueNotice(`Aether: theme control is cooling down for ${timeLeftLabel(workspace.themeCooldownUntil)}.`);
                              return;
                            }

                            patchWorkspace((current) => ({
                              ...current,
                              platformSettings: {
                                theme,
                                lastChangedAt: new Date().toISOString(),
                                lastChangedBy: currentProfile.id,
                              },
                              themeCooldownUntil: now + 6_000,
                              themeCooldownBy: currentProfile.id,
                            }));
                            queueNotice(`Aether: theme changed to ${themeCatalog[theme].label}.`);
                          }}
                          className={cn(
                            "rounded-2xl border px-3 py-2 text-sm transition",
                            workspace.platformSettings.theme === theme
                              ? "border-white/20 bg-white text-black"
                              : "border-white/10 bg-white/5 text-white hover:bg-white/10",
                          )}
                        >
                          {themeCatalog[theme].label}
                        </button>
                      ))}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-6 text-white/55">
                      {workspace.themeCooldownUntil > now
                        ? `Theme cooldown: ${timeLeftLabel(workspace.themeCooldownUntil)} left.`
                        : "Theme switching is ready now."}
                    </div>
                    {isLeadPrimal(currentProfile) ? (
                      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                        <input
                          value={promotionTarget}
                          onChange={(event) => setPromotionTarget(event.target.value)}
                          placeholder="Promote by username or UID"
                          className="w-full rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                        />
                        <button
                          type="button"
                          onClick={promoteTargetToPrimal}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,var(--accent),var(--accent-2))] px-3 py-2 text-sm font-semibold text-black transition hover:scale-[1.01]"
                        >
                          <ShieldPlus className="h-4 w-4" />
                          Promote to Primal
                        </button>
                      </div>
                    ) : null}
                  </div>
                </SectionCard>
              ) : null}

              <SectionCard title="Retention" icon={<Trash2 className="h-3.5 w-3.5" />}>
                <div className="text-sm leading-7 text-white/60">
                  Messages older than 10 days are hidden and should be purged by
                  the cleanup job to save storage.
                </div>
              </SectionCard>

              <SectionCard title="Credits" icon={<Sparkles className="h-3.5 w-3.5" />}>
                <div className="text-sm leading-7 text-white/70">
                  Message from the Dev - LONG LIVE S..... WE ALL LOVE YOU
                </div>
              </SectionCard>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
