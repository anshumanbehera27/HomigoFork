/** Session flag so Property / Roommate pages can open Messages on the right thread. */
export const HOMIGO_OPEN_CHAT_KEY = "homigo_open_chat";

export type HomigoOpenChatIntent =
  | { v: 1; kind: "property"; propertyId: number }
  | { v: 1; kind: "user"; targetUserId: string | number };

export function queueOpenChatIntent(intent: HomigoOpenChatIntent) {
  sessionStorage.setItem(HOMIGO_OPEN_CHAT_KEY, JSON.stringify(intent));
}

export function consumeOpenChatIntent(): HomigoOpenChatIntent | null {
  const raw = sessionStorage.getItem(HOMIGO_OPEN_CHAT_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(HOMIGO_OPEN_CHAT_KEY);
  try {
    const parsed = JSON.parse(raw) as HomigoOpenChatIntent;
    if (parsed?.v !== 1 || (parsed.kind !== "property" && parsed.kind !== "user")) return null;
    return parsed;
  } catch {
    return null;
  }
}
