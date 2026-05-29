import type { ChatMessage, Profile } from "@/lib/types";
import { normalizeUsername, toSlug } from "@/lib/format";

export type ParsedCommand =
  | {
      name:
        | "ban"
        | "unban"
        | "mute"
        | "unmute"
        | "kick"
        | "invite"
        | "status"
        | "themesset"
        | "pban"
        | "punban"
        | "title"
        | "untitle";
      args: string[];
    }
  | { name: "unknown"; args: string[] };

export function parseSlashCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const [command, ...args] = trimmed.slice(1).split(/\s+/);
  const normalized = toSlug(command);

  switch (normalized) {
    case "ban":
    case "unban":
    case "mute":
    case "unmute":
    case "kick":
    case "invite":
    case "status":
    case "themesset":
    case "pban":
    case "punban":
    case "title":
    case "untitle":
      return { name: normalized, args };
    default:
      return { name: "unknown", args };
  }
}

export function extractMentions(content: string) {
  return Array.from(content.matchAll(/@([A-Za-z0-9_]+)/g)).map((match) =>
    normalizeUsername(match[1]),
  );
}

export function decorateReplyPreview(message?: ChatMessage | null) {
  if (!message) {
    return null;
  }

  return `${message.authorName}: ${message.content.slice(0, 72)}`;
}

export function targetUserLabel(target: Profile) {
  return `${target.username} · ${target.uid}`;
}
