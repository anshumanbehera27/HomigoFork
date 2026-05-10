import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { io, type Socket } from "socket.io-client";
import MaterialIcon from "../components/ui/MaterialIcon";
import ProfileGate from "../components/ui/ProfileGate";
import { useHomigoAuth } from "../components/auth/AuthContext";
import { api } from "../lib/api";
import { consumeOpenChatIntent } from "../lib/chatIntent";
import type { BackendMessage, ConversationRecord, EnrichedConversation, RoommateProfile } from "../lib/types";

function normalizeEnrichedList(rows: EnrichedConversation[]): EnrichedConversation[] {
  return rows.map((c) => ({
    ...c,
    unread_count: Number(c.unread_count ?? 0),
  }));
}

function isLikelySelf(profile: RoommateProfile, myUserId: string | number): boolean {
  const mine = String(myUserId);
  if (profile.id === mine) return true;
  const pid = Number(profile.id);
  const mid = Number(myUserId);
  if (Number.isFinite(pid) && Number.isFinite(mid) && pid === mid) return true;
  return false;
}

function enrichedFromNewConversation(
  conv: ConversationRecord,
  peer: RoommateProfile,
  myNumericId: number,
): EnrichedConversation {
  const otherId = conv.user1_id === myNumericId ? conv.user2_id : conv.user1_id;
  return {
    conversation_id: conv.conversation_id,
    created_at: conv.created_at ?? new Date().toISOString(),
    updated_at: conv.updated_at ?? new Date().toISOString(),
    property_id: conv.property_id ?? null,
    other_user_id: otherId,
    other_user_name: peer.name,
    other_user_photo: peer.avatar || null,
    other_user_role: "seeker",
    last_message_id: null,
    last_message_content: null,
    last_message_sender_id: null,
    last_message_at: null,
    unread_count: 0,
  };
}

const SOCKET_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api").replace(/\/api\/?$/, "");

type PageProps = { onNavigate: (page: string) => void };

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function Avatar({ photo, name, size = "10" }: { photo?: string | null; name?: string | null; size?: string }) {
  const cls = `h-${size} w-${size} rounded-full object-cover shrink-0`;
  if (photo) return <img src={photo} alt={name ?? ""} className={cls} />;
  return (
    <div className={`${cls} flex items-center justify-center bg-primary/20 font-bold text-primary text-sm`}>
      {getInitials(name)}
    </div>
  );
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  if (diff < 172_800_000) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatMsgTime(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Messages({ onNavigate }: PageProps) {
  const { userId } = useHomigoAuth();
  const numericUserId = Number(userId);

  const [conversations, setConversations] = useState<EnrichedConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<BackendMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [typingFrom, setTypingFrom] = useState<number | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const [convListFilter, setConvListFilter] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatCandidates, setNewChatCandidates] = useState<RoommateProfile[]>([]);
  const [newChatLoading, setNewChatLoading] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState("");
  const [startingChatWithId, setStartingChatWithId] = useState<string | null>(null);
  const [newChatError, setNewChatError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const activeConvIdRef = useRef<number | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeConv = conversations.find((c) => c.conversation_id === activeConvId);

  const filteredConversations = useMemo(() => {
    const q = convListFilter.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        (c.other_user_name ?? "").toLowerCase().includes(q) ||
        (c.last_message_content ?? "").toLowerCase().includes(q) ||
        String(c.other_user_id).includes(q),
    );
  }, [conversations, convListFilter]);

  useEffect(() => {
    activeConvIdRef.current = activeConvId;
  }, [activeConvId]);

  // ── Socket.IO ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!numericUserId || isNaN(numericUserId)) return;

    const socket = io(SOCKET_URL, {
      auth: { user_id: numericUserId },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setSocketConnected(true));
    socket.on("disconnect", () => setSocketConnected(false));

    socket.on("receive_message", (msg: BackendMessage) => {
      // Add to active conversation view (dedup by message_id)
      if (msg.conversation_id === activeConvIdRef.current) {
        setMessages((prev) =>
          prev.some((m) => m.message_id === msg.message_id) ? prev : [...prev, msg],
        );
        // If we're the receiver and the chat is open, mark as read
        if (msg.receiver_id === numericUserId) {
          socket.emit("mark_read", { conversation_id: msg.conversation_id });
        }
      }

      // Update conversation preview row
      setConversations((prev) =>
        prev.map((c) => {
          if (c.conversation_id !== msg.conversation_id) return c;
          const isUnread =
            msg.receiver_id === numericUserId &&
            msg.conversation_id !== activeConvIdRef.current;
          return {
            ...c,
            last_message_content: msg.content,
            last_message_at: msg.timestamp,
            last_message_sender_id: msg.sender_id,
            unread_count: isUnread ? c.unread_count + 1 : c.unread_count,
            updated_at: msg.timestamp,
          };
        }),
      );
    });

    socket.on("typing", ({ conversation_id, sender_id }: { conversation_id: number; sender_id: number }) => {
      if (conversation_id !== activeConvIdRef.current) return;
      setTypingFrom(sender_id);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => setTypingFrom(null), 2500);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [numericUserId]);

  // ── New chat: load seeker profiles when modal opens ─────────────────────────
  useEffect(() => {
    if (!newChatOpen || !userId) return;
    let cancelled = false;
    setNewChatLoading(true);
    setNewChatError(null);
    api
      .searchUsers({ filters: {}, pagination: { page: 1, limit: 60 }, sort: { by: "compatibility", order: "desc" } })
      .then((res) => {
        if (cancelled) return;
        const rows = (res.data ?? []).filter((p) => !isLikelySelf(p, userId));
        setNewChatCandidates(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setNewChatCandidates([]);
          setNewChatError("Could not load people. Try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setNewChatLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [newChatOpen, userId]);

  useEffect(() => {
    if (!newChatOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNewChatOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newChatOpen]);

  const filteredNewChatCandidates = useMemo(() => {
    const q = newChatQuery.trim().toLowerCase();
    if (!q) return newChatCandidates;
    return newChatCandidates.filter((p) => {
      const blob = [p.name, p.city, p.occupation, ...p.lookingIn].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [newChatCandidates, newChatQuery]);

  const startChatWithProfile = async (profile: RoommateProfile) => {
    if (!userId || startingChatWithId) return;
    setStartingChatWithId(profile.id);
    setNewChatError(null);
    try {
      const { data: conv } = await api.createConversationForUser(profile.id, userId);
      const convId = conv.conversation_id;
      const r = await api.listConversations(userId);
      let convs = normalizeEnrichedList(r.data ?? []);
      if (!convs.some((c) => c.conversation_id === convId) && Number.isFinite(numericUserId) && !isNaN(numericUserId)) {
        convs = [enrichedFromNewConversation(conv, profile, numericUserId), ...convs];
      }
      setConversations(convs);
      setActiveConvId(convId);
      setMobileChatOpen(true);
      setNewChatOpen(false);
      setNewChatQuery("");
    } catch {
      setNewChatError("Could not start this chat. Try again.");
    } finally {
      setStartingChatWithId(null);
    }
  };

  // ── Load conversation list (+ optional intent from property / roommate pages) ─
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoadingConvs(true);

    (async () => {
      let convIdToOpen: number | null = null;
      const intent = consumeOpenChatIntent();
      try {
        if (intent?.kind === "property") {
          const res = await api.createConversationForProperty(intent.propertyId, userId);
          convIdToOpen = res.data.conversation.conversation_id;
        } else if (intent?.kind === "user") {
          const res = await api.createConversationForUser(intent.targetUserId, userId);
          convIdToOpen = res.data.conversation_id;
        }
      } catch {
        /* intent failed — still show inbox */
      }

      try {
        const r = await api.listConversations(userId);
        const convs = normalizeEnrichedList(r.data ?? []);
        if (cancelled) return;
        setConversations(convs);
        if (convIdToOpen != null && convs.some((c) => c.conversation_id === convIdToOpen)) {
          setActiveConvId(convIdToOpen);
          setMobileChatOpen(true);
        } else if (convIdToOpen != null) {
          setActiveConvId(convIdToOpen);
          setMobileChatOpen(true);
        } else if (convs.length) {
          setActiveConvId(convs[0].conversation_id);
        }
      } catch {
        if (!cancelled) setConversations([]);
      } finally {
        if (!cancelled) setLoadingConvs(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // ── Load messages for active conversation ───────────────────────────────────
  const loadMessages = useCallback(async (convId: number) => {
    setLoadingMsgs(true);
    try {
      const r = await api.getMessages(convId);
      setMessages(r.data ?? []);
      setNextCursor(r.pagination?.next_cursor ?? null);
    } catch {
      /* silent */
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    if (!activeConvId || !numericUserId || isNaN(numericUserId)) return;
    loadMessages(activeConvId);
    socketRef.current?.emit("mark_read", { conversation_id: activeConvId });
    void api.markConversationRead(activeConvId, numericUserId).catch(() => {});
    setConversations((prev) =>
      prev.map((c) => (c.conversation_id === activeConvId ? { ...c, unread_count: 0 } : c)),
    );
  }, [activeConvId, loadMessages, numericUserId]);

  // ── Auto-scroll to latest message ───────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ── Load older messages (scroll up) ────────────────────────────────────────
  const loadMore = async () => {
    if (!activeConvId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.getMessages(activeConvId, nextCursor);
      setMessages((prev) => [...(r.data ?? []), ...prev]);
      setNextCursor(r.pagination?.next_cursor ?? null);
    } catch {
      /* silent */
    } finally {
      setLoadingMore(false);
    }
  };

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = newMessage.trim();
    if (!text || !activeConv) return;
    setNewMessage("");
    try {
      const r = await api.sendMessage(activeConv.conversation_id, {
        sender_id: numericUserId,
        receiver_id: activeConv.other_user_id,
        message: text,
      });
      const saved = r.data;
      if (saved) {
        setMessages((prev) =>
          prev.some((m) => m.message_id === saved.message_id) ? prev : [...prev, saved],
        );
        // Update conversation preview for the sender
        setConversations((prev) =>
          prev.map((c) =>
            c.conversation_id === activeConv.conversation_id
              ? { ...c, last_message_content: text, last_message_at: saved.timestamp, last_message_sender_id: numericUserId }
              : c,
          ),
        );
      }
    } catch {
      /* silent */
    }
  }, [newMessage, activeConv, numericUserId]);

  // ── Typing indicator ────────────────────────────────────────────────────────
  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (activeConv && socketRef.current?.connected) {
      socketRef.current.emit("typing", {
        receiver_id: activeConv.other_user_id,
        conversation_id: activeConv.conversation_id,
      });
    }
  };

  const openChat = (convId: number) => {
    setActiveConvId(convId);
    setMobileChatOpen(true);
  };

  const closeMobileChat = () => setMobileChatOpen(false);

  // ── Contact list panel ──────────────────────────────────────────────────────
  const ContactList = (
    <aside className="flex h-full flex-col bg-surface-container-low">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-container px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate("dashboard")}
            className="flex items-center gap-1 text-sm font-semibold text-on-surface-variant hover:text-primary"
            aria-label="Back to dashboard"
          >
            <MaterialIcon name="arrow_back" className="text-base" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          <h2 className="font-headline text-xl font-bold text-on-surface">Messages</h2>
        </div>
        <div className="flex items-center gap-2">
          <ProfileGate action="start a new chat" onNavigate={onNavigate}>
            <button
              type="button"
              onClick={() => {
                setNewChatOpen(true);
                setNewChatError(null);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-sm transition hover:bg-primary/90"
              aria-label="New message"
              title="New message"
            >
              <MaterialIcon name="add_comment" className="text-lg" />
            </button>
          </ProfileGate>
          {socketConnected && (
            <span className="h-2 w-2 rounded-full bg-green-500" title="Connected" />
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="relative">
          <MaterialIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-sm" />
          <input
            placeholder="Search conversations"
            className="pl-9 text-sm"
            value={convListFilter}
            onChange={(e) => setConvListFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {loadingConvs ? (
          <div className="space-y-1 p-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl px-3 py-3">
                <div className="h-12 w-12 rounded-full bg-surface-container" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded bg-surface-container" />
                  <div className="h-2 w-36 rounded bg-surface-container" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-on-surface-variant">
            <MaterialIcon name="chat_bubble_outline" className="text-4xl text-outline" />
            <p className="text-sm font-medium">No conversations yet</p>
            <p className="text-xs text-outline">Use New message to find someone, or open a chat from a listing</p>
            <ProfileGate action="start a new chat" onNavigate={onNavigate}>
              <button
                type="button"
                onClick={() => setNewChatOpen(true)}
                className="mt-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-white"
              >
                New message
              </button>
            </ProfileGate>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 px-4 text-center text-on-surface-variant">
            <MaterialIcon name="search_off" className="text-4xl text-outline" />
            <p className="text-sm font-medium">No matches</p>
            <p className="text-xs text-outline">Try a different search term</p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = conv.conversation_id === activeConvId;
            const isMe = conv.last_message_sender_id === numericUserId;
            return (
              <button
                key={conv.conversation_id}
                onClick={() => openChat(conv.conversation_id)}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-container active:bg-surface-container ${isActive ? "border-l-4 border-primary bg-primary/5" : ""}`}
              >
                {/* Avatar */}
                <Avatar photo={conv.other_user_photo} name={conv.other_user_name} size="12" />

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className={`truncate text-sm font-bold ${isActive ? "text-primary" : "text-on-surface"}`}>
                      {conv.other_user_name ?? "Unknown User"}
                    </p>
                    <span className="ml-2 shrink-0 text-[10px] text-outline">{formatTime(conv.last_message_at ?? conv.updated_at)}</span>
                  </div>
                  <p className="truncate text-xs text-on-surface-variant">
                    {conv.last_message_content
                      ? `${isMe ? "You: " : ""}${conv.last_message_content}`
                      : "No messages yet"}
                  </p>
                  {conv.other_user_role && (
                    <p className="mt-0.5 truncate text-[10px] font-semibold text-primary capitalize">
                      {conv.other_user_role}{conv.property_id ? " · Property Chat" : ""}
                    </p>
                  )}
                </div>

                {/* Unread badge */}
                {conv.unread_count > 0 && (
                  <span className="ml-1 flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black text-white">
                    {conv.unread_count > 99 ? "99+" : conv.unread_count}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );

  // ── Chat panel ──────────────────────────────────────────────────────────────
  const ChatPanel = activeConv ? (
    <section className="flex min-h-0 flex-1 flex-col">
      {/* Chat header */}
      <header className="flex shrink-0 items-center justify-between border-b border-surface-container bg-white/90 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={closeMobileChat}
            className="mr-1 flex items-center justify-center rounded-full p-2 hover:bg-surface-container lg:hidden"
            aria-label="Back to conversations"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <Avatar photo={activeConv.other_user_photo} name={activeConv.other_user_name} size="10" />
          <div>
            <h2 className="font-headline text-sm font-bold leading-tight">
              {activeConv.other_user_name ?? "Unknown User"}
            </h2>
            <p className="text-xs font-medium capitalize text-outline">
              {activeConv.other_user_role ?? "User"}
              {activeConv.property_id ? " · Property Chat" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-full p-2 hover:bg-surface-container" aria-label="More options">
            <MaterialIcon name="more_vert" className="text-on-surface-variant" />
          </button>
        </div>
      </header>

      {/* Messages scroll area */}
      <div className="flex-1 overflow-y-auto space-y-4 p-5">
        {/* Load more */}
        {nextCursor && (
          <div className="flex justify-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-full bg-surface-container px-4 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}

        {loadingMsgs ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`flex animate-pulse ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                <div className={`h-10 w-48 rounded-2xl bg-surface-container ${i % 2 === 0 ? "rounded-br-sm" : "rounded-bl-sm"}`} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-on-surface-variant">
            <MaterialIcon name="waving_hand" className="text-3xl text-outline" />
            <p className="text-sm">No messages yet — say hello!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === numericUserId;
            return (
              <div key={msg.message_id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                {!isMe && (
                  <div className="mr-2 self-end">
                    <Avatar photo={activeConv.other_user_photo} name={activeConv.other_user_name} size="7" />
                  </div>
                )}
                <div className={`max-w-[72%] flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                  <p
                    className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      isMe
                        ? "rounded-br-sm bg-primary text-white"
                        : "rounded-bl-sm bg-white text-on-surface shadow-sm"
                    }`}
                  >
                    {msg.content}
                  </p>
                  <div className="flex items-center gap-1 px-1">
                    <span className="text-[10px] text-outline">{formatMsgTime(msg.timestamp)}</span>
                    {isMe && (
                      <MaterialIcon
                        name={msg.read ? "done_all" : "done"}
                        className={`text-[10px] ${msg.read ? "text-primary" : "text-outline"}`}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {typingFrom && typingFrom !== numericUserId && (
          <div className="flex justify-start">
            <div className="mr-2 self-end">
              <Avatar photo={activeConv.other_user_photo} name={activeConv.other_user_name} size="7" />
            </div>
            <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-outline [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-outline [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-outline [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-surface-container bg-white px-4 py-3">
        <ProfileGate action="send a message" onNavigate={onNavigate}>
          <div className="flex items-center gap-2">
            <input
              value={newMessage}
              onChange={handleTyping}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Type your message…"
              className="flex-1 rounded-full bg-surface-container-highest px-4 py-2.5 text-sm"
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary/90 disabled:opacity-40"
              aria-label="Send"
            >
              <MaterialIcon name="send" className="text-sm" />
            </button>
          </div>
        </ProfileGate>
      </div>
    </section>
  ) : (
    <section className="hidden flex-1 items-center justify-center lg:flex">
      <div className="text-center text-on-surface-variant">
        <MaterialIcon name="chat_bubble_outline" className="text-5xl text-outline" />
        <p className="mt-4 font-headline font-bold">Select a conversation</p>
        <p className="mt-1 text-sm">Choose from the list to start chatting.</p>
      </div>
    </section>
  );

  // ── Right details panel ─────────────────────────────────────────────────────
  const DetailsPanel = activeConv && (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-surface-container bg-surface-container-low p-5 xl:block">
      <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-outline">Contact Info</h3>
      <div className="card mb-4 text-center">
        <div className="flex justify-center">
          <Avatar photo={activeConv.other_user_photo} name={activeConv.other_user_name} size="16" />
        </div>
        <p className="mt-3 font-headline font-bold text-on-surface">
          {activeConv.other_user_name ?? "Unknown User"}
        </p>
        <p className="text-xs capitalize text-primary">{activeConv.other_user_role ?? "User"}</p>
      </div>
      <div className="card">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-outline">Conversation</p>
        <p className="text-sm text-on-surface-variant">
          {activeConv.property_id
            ? "This chat was started from a property listing."
            : "Direct message conversation."}
        </p>
        {activeConv.property_id && (
          <button
            onClick={() => onNavigate("accommodation")}
            className="mt-4 flex w-full items-center justify-between rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/20"
          >
            View listing <MaterialIcon name="arrow_forward" className="text-sm" />
          </button>
        )}
      </div>
    </aside>
  );

  // ── Layout ──────────────────────────────────────────────────────────────────
  const NewChatModal = newChatOpen && (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-chat-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setNewChatOpen(false);
      }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-container px-4 py-3">
          <h2 id="new-chat-title" className="font-headline text-lg font-bold text-on-surface">
            New message
          </h2>
          <button
            type="button"
            onClick={() => setNewChatOpen(false)}
            className="rounded-full p-2 hover:bg-surface-container"
            aria-label="Close"
          >
            <MaterialIcon name="close" className="text-on-surface-variant" />
          </button>
        </div>
        <p className="px-4 pt-3 text-xs text-on-surface-variant">
          Choose someone on Homigo to open a direct chat. You can search by name, city, or role.
        </p>
        <div className="relative px-4 pb-2 pt-3">
          <MaterialIcon name="search" className="absolute left-7 top-1/2 -translate-y-1/2 text-outline text-sm" />
          <input
            className="w-full rounded-xl border border-surface-container bg-surface-container-lowest py-2.5 pl-9 pr-3 text-sm"
            placeholder="Search people…"
            value={newChatQuery}
            onChange={(e) => setNewChatQuery(e.target.value)}
          />
        </div>
        {newChatError && (
          <p className="mx-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{newChatError}</p>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {newChatLoading ? (
            <div className="space-y-2 p-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex animate-pulse gap-3 rounded-xl px-2 py-3">
                  <div className="h-11 w-11 rounded-full bg-surface-container" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 w-28 rounded bg-surface-container" />
                    <div className="h-2 w-40 rounded bg-surface-container" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredNewChatCandidates.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-on-surface-variant">
              <MaterialIcon name="person_search" className="text-4xl text-outline" />
              <p className="text-sm font-medium">No one matches your search</p>
              <p className="text-xs text-outline">Try another name or clear the filter</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {filteredNewChatCandidates.map((profile) => (
                <li key={profile.id}>
                  <button
                    type="button"
                    disabled={Boolean(startingChatWithId)}
                    onClick={() => void startChatWithProfile(profile)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-surface-container disabled:opacity-50"
                  >
                    <Avatar photo={profile.avatar || null} name={profile.name} size="11" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-on-surface">{profile.name}</p>
                      <p className="truncate text-xs text-on-surface-variant">
                        {[profile.occupation, profile.city].filter(Boolean).join(" · ") || "Seeker"}
                      </p>
                    </div>
                    {startingChatWithId === profile.id ? (
                      <MaterialIcon name="sync" className="animate-spin text-primary text-sm" />
                    ) : (
                      <span className="shrink-0 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold text-primary">
                        Chat
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-surface pt-16">
      {/* Mobile: toggle between list and chat */}
      <div className={`w-full shrink-0 flex-col lg:w-80 lg:flex ${mobileChatOpen ? "hidden lg:flex" : "flex"}`}>
        {ContactList}
      </div>

      <div className={`min-w-0 flex-1 flex-col lg:flex ${mobileChatOpen ? "flex" : "hidden lg:flex"}`}>
        {ChatPanel}
      </div>

      {DetailsPanel}

      {NewChatModal}
    </div>
  );
}
