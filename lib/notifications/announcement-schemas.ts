import { z } from "zod";
import { uuidSchema } from "../../contracts/schemas";

export const ANNOUNCEMENT_TITLE_MAX = 120;
export const ANNOUNCEMENT_BODY_MAX = 2000;
/** The in app notification carries a short excerpt. The full text is read on the announcement screen. */
export const ANNOUNCEMENT_EXCERPT_MAX = 280;

/**
 * Announcements are plain text shown to every member, so they are a phishing and spoofing target.
 * Rejects control characters (NUL included), C1 controls and bidirectional override characters that can make
 * text read differently from how it is stored. Line breaks and tabs are allowed in the body only.
 */
function hasForbiddenCharacters(value: string, allowLineBreaks: boolean): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const isWhitespaceControl = code === 9 || code === 10 || code === 13;
    if (code < 32 && !(allowLineBreaks && isWhitespaceControl)) {
      return true;
    }
    if (code === 127 || (code >= 0x80 && code <= 0x9f)) {
      return true;
    }
    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) {
      return true;
    }
  }
  return false;
}

export const createAnnouncementInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a title.")
    .max(ANNOUNCEMENT_TITLE_MAX, `Use at most ${ANNOUNCEMENT_TITLE_MAX} characters.`)
    .refine((value) => !hasForbiddenCharacters(value, false), "Use plain text on one line."),
  body: z
    .string()
    .trim()
    .min(1, "Enter the announcement text.")
    .max(ANNOUNCEMENT_BODY_MAX, `Use at most ${ANNOUNCEMENT_BODY_MAX} characters.`)
    .refine((value) => !hasForbiddenCharacters(value, true), "Use plain text without special control characters."),
});

export const publishAnnouncementInputSchema = z.object({
  announcementId: uuidSchema,
});

/**
 * Collapses whitespace and cuts on whole code points, so an emoji is never split in half.
 * The result is at most `max` characters including the ellipsis.
 */
export function buildExcerpt(body: string, max: number = ANNOUNCEMENT_EXCERPT_MAX): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const characters = Array.from(flat);
  if (characters.length <= max) {
    return flat;
  }
  return `${characters.slice(0, max - 1).join("").trimEnd()}…`;
}

/** Built on the server from the id. An admin can never choose where the notification points. */
export function announcementLink(announcementId: string): string {
  return `/app/announcements/${announcementId}`;
}
