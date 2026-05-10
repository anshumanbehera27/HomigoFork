import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { env } from "../config/env.js";
import { supabase } from "../config/supabase.js";

const numeric = (value: unknown) => /^\d+$/.test(String(value ?? ""));

async function userExists(userId: number) {
  const { data, error } = await supabase.from("users").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data?.user_id);
}

function roomForUser(userId: number) {
  return `user:${userId}`;
}

async function fetchTotalUnreadCount(userId: number): Promise<number> {
  const { data, error } = await supabase.rpc("get_unread_message_count", {
    requesting_user_id: userId,
  });
  if (error) return 0;
  return Number(data ?? 0);
}

export function attachSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
    },
  });

  io.on("connection", async (socket) => {
    const rawUserId =
      socket.handshake.auth?.user_id ??
      socket.handshake.auth?.userId ??
      socket.handshake.query?.user_id ??
      socket.handshake.query?.userId;

    if (!numeric(rawUserId)) {
      socket.emit("message_error", { code: "INVALID_USER_ID", message: "user_id is required" });
      socket.disconnect(true);
      return;
    }

    const userId = Number(rawUserId);
    try {
      if (!(await userExists(userId))) {
        socket.emit("message_error", { code: "USER_NOT_FOUND", message: "User not found" });
        socket.disconnect(true);
        return;
      }
    } catch {
      socket.emit("message_error", { code: "USER_LOOKUP_FAILED", message: "Unable to validate user" });
      socket.disconnect(true);
      return;
    }

    socket.join(roomForUser(userId));

    socket.on("send_message", async (payload) => {
      try {
        const conversationId = Number(payload?.conversation_id);
        const senderId = Number(payload?.sender_id);
        const receiverId = Number(payload?.receiver_id);
        const message = String(payload?.message ?? "").trim();

        if (!Number.isFinite(conversationId)) {
          socket.emit("message_error", { code: "INVALID_CONVERSATION_ID", message: "conversation_id is required" });
          return;
        }
        if (!Number.isFinite(senderId) || !Number.isFinite(receiverId)) {
          socket.emit("message_error", { code: "INVALID_PARTICIPANTS", message: "sender_id and receiver_id are required" });
          return;
        }
        if (!message) {
          socket.emit("message_error", { code: "EMPTY_MESSAGE", message: "message must be non-empty" });
          return;
        }
        if (senderId !== userId) {
          socket.emit("message_error", { code: "SENDER_MISMATCH", message: "sender_id must match the connected user_id" });
          return;
        }

        const { data: conversation, error: convErr } = await supabase
          .from("conversations")
          .select("*")
          .eq("conversation_id", conversationId)
          .maybeSingle();
        if (convErr) throw convErr;
        if (!conversation) {
          socket.emit("message_error", { code: "CONVERSATION_NOT_FOUND", message: "Conversation not found" });
          return;
        }

        const allowed =
          (conversation.user1_id === senderId && conversation.user2_id === receiverId) ||
          (conversation.user1_id === receiverId && conversation.user2_id === senderId);
        if (!allowed) {
          socket.emit("message_error", { code: "NOT_A_PARTICIPANT", message: "Sender/receiver are not participants of this conversation" });
          return;
        }

        const { data: saved, error: msgErr } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            sender_id: senderId,
            receiver_id: receiverId,
            content: message,
            message_type: "text",
            read: false,
          })
          .select("*")
          .single();
        if (msgErr || !saved) throw msgErr ?? new Error("MESSAGE_SAVE_FAILED");

        const upd = await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("conversation_id", conversationId);
        if (upd.error) throw upd.error;

        io.to(roomForUser(receiverId)).emit("receive_message", saved);
        io.to(roomForUser(senderId)).emit("receive_message", saved);

        // Push updated unread badge count to receiver
        try {
          const unreadCount = await fetchTotalUnreadCount(receiverId);
          io.to(roomForUser(receiverId)).emit("unread_count", { unread_count: unreadCount });
        } catch { /* non-fatal — badge refreshes on next poll */ }
      } catch (error: any) {
        socket.emit("message_error", { code: "SEND_FAILED", message: String(error?.message ?? error) });
      }
    });

    socket.on("mark_read", async (payload) => {
      const conversationId = Number(payload?.conversation_id);
      if (!Number.isFinite(conversationId)) return;

      await supabase
        .from("messages")
        .update({ read: true })
        .eq("conversation_id", conversationId)
        .eq("receiver_id", userId)
        .eq("read", false);

      try {
        const count = await fetchTotalUnreadCount(userId);
        socket.emit("unread_count", { unread_count: count });
      } catch { /* non-fatal */ }
    });

    socket.on("typing", (payload) => {
      const receiverId = Number(payload?.receiver_id);
      const conversationId = Number(payload?.conversation_id);
      if (!Number.isFinite(receiverId) || !Number.isFinite(conversationId)) return;
      io.to(roomForUser(receiverId)).emit("typing", { conversation_id: conversationId, sender_id: userId });
    });
  });

  return io;
}

