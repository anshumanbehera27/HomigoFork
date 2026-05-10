import type { Request, Response } from "express";
import { supabase } from "../config/supabase.js";
import { HttpError, sendError } from "../utils/http.js";

const numeric = (value: unknown) => /^\d+$/.test(String(value ?? ""));

async function resolveUserId(identifier: unknown): Promise<number> {
  if (numeric(identifier)) {
    const userId = Number(identifier);
    const { data, error } = await supabase.from("users").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data?.user_id) throw new HttpError(404, `User ${userId} not found`);
    return userId;
  }
  const str = String(identifier ?? "");
  if (!str) throw new HttpError(400, "Invalid user identifier");

  const byEmail = await supabase.from("users").select("user_id").eq("email", str).maybeSingle();
  if (byEmail.error) throw byEmail.error;
  if (byEmail.data?.user_id) return byEmail.data.user_id;

  const byClerk = await supabase.from("users").select("user_id").eq("clerk_id", str).maybeSingle();
  if (byClerk.error) throw byClerk.error;
  if (byClerk.data?.user_id) return byClerk.data.user_id;

  throw new HttpError(404, `User ${str} not found`);
}

async function findConversationBetween(userA: number, userB: number) {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .or(`and(user1_id.eq.${userA},user2_id.eq.${userB}),and(user1_id.eq.${userB},user2_id.eq.${userA})`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ensureConversationBetween(user1Id: number, user2Id: number, propertyId?: number) {
  const existing = await findConversationBetween(user1Id, user2Id);
  if (existing) return { conversation: existing, existing: true as const };

  const insertAttempt = await supabase
    .from("conversations")
    .insert({
      user1_id: user1Id,
      user2_id: user2Id,
      property_id: propertyId ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (!insertAttempt.error && insertAttempt.data) {
    return { conversation: insertAttempt.data, existing: false as const };
  }

  if (insertAttempt.error && (insertAttempt.error.code === "23505" || String(insertAttempt.error.message).toLowerCase().includes("duplicate"))) {
    const concurrent = await findConversationBetween(user1Id, user2Id);
    if (concurrent) return { conversation: concurrent, existing: true as const };
  }

  throw insertAttempt.error ?? new Error("Unable to create conversation");
}

export async function createOrGetConversation(req: Request, res: Response) {
  try {
    const user1Id = await resolveUserId(req.body?.user1_id ?? req.body?.sender_id);
    const user2Id = await resolveUserId(req.body?.user2_id ?? req.body?.receiver_id);
    if (user1Id === user2Id) throw new HttpError(400, "Conversation users must be different");

    const { conversation, existing } = await ensureConversationBetween(user1Id, user2Id);
    return res.status(existing ? 200 : 201).json({ success: true, data: conversation, existing });
  } catch (error) {
    sendError(res, error);
  }
}

async function resolveOwnerUserIdByPropertyId(propertyId: number): Promise<number> {
  const { data, error } = await supabase
    .from("properties")
    .select("property_id, owner_profiles ( user_id )")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Property not found");
  const ownerUserId = (data as any).owner_profiles?.user_id as number | undefined;
  if (!ownerUserId) throw new HttpError(400, "Property owner not linked to a user");
  return ownerUserId;
}

/**
 * Start chat from Property Details page.
 * POST /api/properties/:propertyId/conversations
 * Body: { user_id } (viewer / current user)
 */
export async function createOrGetConversationForProperty(req: Request, res: Response) {
  try {
    const propertyId = Number(req.params.propertyId);
    if (!Number.isFinite(propertyId)) throw new HttpError(400, "Invalid property_id");

    const viewerUserId = await resolveUserId(req.body?.user_id ?? req.body?.viewer_id ?? req.body?.sender_id);
    const ownerUserId = await resolveOwnerUserIdByPropertyId(propertyId);
    if (viewerUserId === ownerUserId) throw new HttpError(400, "You cannot chat with yourself");

    const { conversation, existing } = await ensureConversationBetween(viewerUserId, ownerUserId, propertyId);
    res.status(existing ? 200 : 201).json({
      success: true,
      data: {
        conversation,
        property_id: propertyId,
        user_id: viewerUserId,
        owner_user_id: ownerUserId,
      },
      existing,
    });
  } catch (error) {
    sendError(res, error);
  }
}

/**
 * Start chat from User Details page.
 * POST /api/users/:userId/conversations
 * Body: { user_id } (viewer / current user)
 */
export async function createOrGetConversationForUser(req: Request, res: Response) {
  try {
    const targetUserId = await resolveUserId(req.params.userId);
    const viewerUserId = await resolveUserId(req.body?.user_id ?? req.body?.viewer_id);
    if (viewerUserId === targetUserId) throw new HttpError(400, "You cannot chat with yourself");

    const { conversation, existing } = await ensureConversationBetween(viewerUserId, targetUserId);
    res.status(existing ? 200 : 201).json({ success: true, data: conversation, existing });
  } catch (error) {
    sendError(res, error);
  }
}

/** GET /conversations?user_id= — enriched list via Supabase RPC */
export async function listConversations(req: Request, res: Response) {
  try {
    const requestedUserId = req.query.user_id ?? req.query.sender_id;
    if (!requestedUserId) return res.json({ success: true, data: [] });
    const userId = await resolveUserId(requestedUserId);

    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: data ?? [] });
  } catch (error) {
    sendError(res, error);
  }
}

/** GET /conversations?user_id= — enriched list with participant info, last message, unread count */
export async function listConversationsEnriched(req: Request, res: Response) {
  try {
    const requestedUserId = req.query.user_id ?? req.query.sender_id;
    if (!requestedUserId) return res.json({ success: true, data: [] });
    const userId = await resolveUserId(requestedUserId);

    const { data, error } = await supabase.rpc("get_conversations_for_user", {
      requesting_user_id: userId,
    });
    if (error) throw error;
    res.json({ success: true, data: data ?? [] });
  } catch (error) {
    sendError(res, error);
  }
}

/** GET /conversations/:conversationId?user_id= — single conversation, participant-gated */
export async function getConversation(req: Request, res: Response) {
  try {
    const conversationId = Number(req.params.conversationId);
    if (!Number.isFinite(conversationId)) throw new HttpError(400, "Invalid conversation_id");

    const requestingUserId = await resolveUserId(req.query.user_id ?? req.query.sender_id);

    const { data: conversation, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!conversation) throw new HttpError(404, "Conversation not found");

    const isParticipant = conversation.user1_id === requestingUserId || conversation.user2_id === requestingUserId;
    if (!isParticipant) throw new HttpError(403, "Not a participant of this conversation");

    res.json({ success: true, data: conversation });
  } catch (error) {
    sendError(res, error);
  }
}

/** GET /conversations/:conversationId/messages?limit=50&before_id= — cursor-based pagination */
export async function getMessagesPaginated(req: Request, res: Response) {
  try {
    const conversationId = Number(req.params.conversationId ?? req.params.conversation_id);
    if (!Number.isFinite(conversationId)) throw new HttpError(400, "Invalid conversation_id");

    const { data: conversation, error: convErr } = await supabase
      .from("conversations")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (convErr) throw convErr;
    if (!conversation) throw new HttpError(404, "Conversation not found");

    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const beforeId = req.query.before_id ? Number(req.query.before_id) : null;

    let query = supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("message_id", { ascending: false })
      .limit(limit);

    if (beforeId !== null && Number.isFinite(beforeId)) {
      query = query.lt("message_id", beforeId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const messages = (data ?? []).reverse();
    const nextCursor = messages.length === limit ? messages[0].message_id : null;

    res.json({
      success: true,
      data: messages,
      pagination: { limit, next_cursor: nextCursor, has_more: nextCursor !== null },
    });
  } catch (error) {
    sendError(res, error);
  }
}

/** GET /messages/:conversationId — kept for back-compat, full history no pagination */
export async function getMessagesByConversation(req: Request, res: Response) {
  try {
    const conversationId = Number(req.params.conversationId ?? req.params.conversation_id);
    if (!Number.isFinite(conversationId)) throw new HttpError(400, "Invalid conversation_id");

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("timestamp", { ascending: true });
    if (error) throw error;
    res.json({ success: true, data: data ?? [] });
  } catch (error) {
    sendError(res, error);
  }
}

/** POST /conversations/:conversationId/messages — send a message */
export async function postMessageToConversation(req: Request, res: Response) {
  try {
    const conversationId = Number(req.params.conversationId ?? req.params.conversation_id ?? req.body?.conversation_id);
    if (!Number.isFinite(conversationId)) throw new HttpError(400, "Invalid conversation_id");

    const senderId = await resolveUserId(req.body?.sender_id);
    const receiverId = await resolveUserId(req.body?.receiver_id);
    const message = String(req.body?.message ?? req.body?.body ?? "").trim();
    if (!message) throw new HttpError(400, "message is required");

    const { data: conversation, error: convErr } = await supabase.from("conversations").select("*").eq("conversation_id", conversationId).maybeSingle();
    if (convErr) throw convErr;
    if (!conversation) throw new HttpError(404, "Conversation not found");

    const allowed =
      (conversation.user1_id === senderId && conversation.user2_id === receiverId) ||
      (conversation.user1_id === receiverId && conversation.user2_id === senderId);
    if (!allowed) throw new HttpError(403, "Sender/receiver are not participants of this conversation");

    const insert = await supabase
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
    if (insert.error || !insert.data) throw insert.error ?? new Error("Unable to save message");

    const updated = await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("conversation_id", conversationId);
    if (updated.error) throw updated.error;

    res.status(201).json({ success: true, data: insert.data });
  } catch (error) {
    sendError(res, error);
  }
}

/** POST /conversations/:conversationId/read — mark all messages as read for a user */
export async function markMessagesRead(req: Request, res: Response) {
  try {
    const conversationId = Number(req.params.conversationId);
    if (!Number.isFinite(conversationId)) throw new HttpError(400, "Invalid conversation_id");

    const receiverId = await resolveUserId(req.body?.user_id ?? req.body?.reader_id);

    const { data: conversation, error: convErr } = await supabase
      .from("conversations")
      .select("user1_id, user2_id")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (convErr) throw convErr;
    if (!conversation) throw new HttpError(404, "Conversation not found");

    const isParticipant = conversation.user1_id === receiverId || conversation.user2_id === receiverId;
    if (!isParticipant) throw new HttpError(403, "Not a participant of this conversation");

    const { error, count } = await supabase
      .from("messages")
      .update({ read: true }, { count: "exact" })
      .eq("conversation_id", conversationId)
      .eq("receiver_id", receiverId)
      .eq("read", false);
    if (error) throw error;

    res.json({ success: true, updated_count: count ?? 0 });
  } catch (error) {
    sendError(res, error);
  }
}

/** GET /users/:userId/unread-count — total unread messages for notification badge */
export async function getUnreadCount(req: Request, res: Response) {
  try {
    const userId = await resolveUserId(req.params.userId);
    const { data, error } = await supabase.rpc("get_unread_message_count", {
      requesting_user_id: userId,
    });
    if (error) throw error;
    res.json({ success: true, unread_count: Number(data ?? 0) });
  } catch (error) {
    sendError(res, error);
  }
}
