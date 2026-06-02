export type ThemeKey = "night" | "cherry" | "halloween" | "valentine";

export type GlobalRole = "member" | "primal" | "primal_lead";
export type ServerRole = "member" | "admin" | "owner";
export type MessageKind = "text" | "system" | "image" | "video" | "gif";
export type SpaceKind = "server" | "dm";

export type Profile = {
  id: string;
  uid: string;
  username: string;
  displayName: string;
  globalRole: GlobalRole;
  title?: string | null;
  titleColor?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
};

export type ServerRecord = {
  id: string;
  name: string;
  description: string;
  inviteCode: string;
  ownerId: string;
  imageUrl?: string | null;
  theme: ThemeKey;
  createdAt: string;
  memberCount: number;
  channelCount: number;
};

export type ServerMembership = {
  serverId: string;
  userId: string;
  role: ServerRole;
  title?: string | null;
  titleColor?: string | null;
  mutedUntil?: string | null;
  bannedUntil?: string | null;
  createdAt: string;
};

export type ChannelRecord = {
  id: string;
  serverId: string;
  name: string;
  slug: string;
  description: string;
  position: number;
  createdAt: string;
};

export type AttachmentRecord = {
  url: string;
  name: string;
  type: "image" | "video" | "gif" | "file";
  mimeType: string;
};

export type ChatMessage = {
  id: string;
  serverId?: string;
  channelId?: string;
  threadId?: string;
  authorId: string;
  authorName: string;
  authorTitle?: string | null;
  authorRole: GlobalRole | ServerRole | "system";
  content: string;
  kind: MessageKind;
  createdAt: string;
  replyToId?: string | null;
  attachment?: AttachmentRecord | null;
  mentions?: string[];
  systemTag?: string;
};

export type DMThread = {
  id: string;
  memberIds: [string, string];
  name: string;
  createdAt: string;
  lastMessageAt: string;
};

export type PlatformSettings = {
  theme: ThemeKey;
  lastChangedAt?: string | null;
  lastChangedBy?: string | null;
};

export type CommandResult = {
  ok: boolean;
  ephemeral?: boolean;
  message: string;
  nextTheme?: ThemeKey;
  refresh?: boolean;
};

export type SpaceRef = {
  kind: SpaceKind;
  id: string;
};
