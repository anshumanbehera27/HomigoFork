import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { createOrUpdateUserProfile, createUser } from "../controllers/OnbordingController.js";
import {
  getPropertyDetail,
  searchPropertiesPost,
  submitOwnerProfile,
  upsertPropertyListing,
} from "../controllers/ownerPropertyController.js";
import {
  createOrGetConversation,
  createOrGetConversationForProperty,
  createOrGetConversationForUser,
  getConversation,
  getMessagesByConversation,
  getMessagesPaginated,
  getUnreadCount,
  listConversationsEnriched,
  markMessagesRead,
  postMessageToConversation,
} from "../controllers/chatController.js";
import { uploadImage } from "../controllers/uploadController.js";
import { uploadMiddleware } from "../middleware/upload.js";
import { HttpError, sendError } from "../utils/http.js";

type UserRow = {
  user_id: number;
  clerk_id?: string | null;
  full_name: string | null;
  email: string;
  phone?: string | null;
  role: string;
  profile_photo_id?: number | null;
  profile_photo?: string | null;
  is_verified?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const numeric = (value: unknown) => /^\d+$/.test(String(value ?? ""));

async function resolveUser(identifier: string | number): Promise<UserRow> {
  if (numeric(identifier)) {
    const { data, error } = await supabase.from("users").select("*").eq("user_id", Number(identifier)).single();
    if (error || !data) throw new HttpError(404, `User ${identifier} not found`);
    return data as UserRow;
  }
  const str = String(identifier);
  const byEmail = await supabase.from("users").select("*").eq("email", str).maybeSingle();
  if (!byEmail.error && byEmail.data) return byEmail.data as UserRow;
  const byClerk = await supabase.from("users").select("*").eq("clerk_id", str).maybeSingle();
  if (!byClerk.error && byClerk.data) return byClerk.data as UserRow;
  throw new HttpError(404, `User ${identifier} not found`);
}

async function resolveProfilePhotoUrl(user: UserRow): Promise<string | null> {
  if (user.profile_photo) return user.profile_photo;
  if (!user.profile_photo_id) return null;
  const { data, error } = await supabase.from("media").select("url").eq("media_id", user.profile_photo_id).maybeSingle();
  if (error) throw error;
  return data?.url ?? null;
}

/** Latest listing per user (properties → owner_profiles), same model as onboarding. */
async function fetchLatestPropertyForUser(userId: number) {
  const owner = await supabase.from("owner_profiles").select("owner_id").eq("user_id", userId).maybeSingle();
  if (owner.error) throw owner.error;
  if (!owner.data) return null;

  const { data: prop, error } = await supabase
    .from("properties")
    .select("property_id, title, description, city, rent, property_type, available_for, is_available")
    .eq("owner_id", owner.data.owner_id)
    .order("property_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!prop) return null;

  const { data: photoRows, error: photoErr } = await supabase
    .from("property_photos")
    .select("media_id, sort_order")
    .eq("property_id", prop.property_id)
    .order("sort_order", { ascending: true });
  if (photoErr) throw photoErr;

  const mediaIds = [...new Set((photoRows ?? []).map((r: { media_id: number | null }) => r.media_id).filter((id): id is number => id != null))];
  let room_images: string[] = [];
  if (mediaIds.length) {
    const { data: mediaRows, error: mediaErr } = await supabase.from("media").select("media_id, url").in("media_id", mediaIds);
    if (mediaErr) throw mediaErr;
    const urlById = new Map((mediaRows ?? []).map((m: { media_id: number; url: string | null }) => [m.media_id, m.url]));
    room_images = (photoRows ?? []).map((r: { media_id: number | null }) => (r.media_id != null ? urlById.get(r.media_id) : null)).filter((u): u is string => Boolean(u));
  }

  const { data: amenityLinks, error: amErr } = await supabase.from("property_amenities").select("amenity_id").eq("property_id", prop.property_id);
  if (amErr) throw amErr;
  const amenityIds = [...new Set((amenityLinks ?? []).map((r: { amenity_id: number }) => r.amenity_id))];
  let amenities: string[] = [];
  if (amenityIds.length) {
    const { data: cats, error: catErr } = await supabase.from("amenity_catalog").select("amenity_id, key").in("amenity_id", amenityIds);
    if (catErr) throw catErr;
    amenities = (cats ?? []).map((c: { key: string | null }) => c.key).filter((k): k is string => Boolean(k));
  }

  return { ...prop, _room_images: room_images, _amenities: amenities };
}

function mapPropertyToCurrentRoomDetails(prop: any) {
  if (!prop) return null;
  const room_images = prop._room_images ?? [];
  const amenities = prop._amenities ?? [];
  const type = String(prop.property_type ?? "").toLowerCase();
  const room_type = type.includes("shared") ? "shared" : type.includes("pg") ? "pg" : type || null;

  return {
    has_room: true,
    room_id: `room_${prop.property_id}`,
    room_type,
    location: prop.city ?? null,
    rent: prop.rent != null ? Number(prop.rent) : null,
    vacancy: prop.is_available ? 1 : 0,
    description: prop.description ?? null,
    room_images,
    amenities,
    available_from: null as string | null,
    room_preferences: {
      preferred_gender: prop.available_for ?? null,
      pet_friendly: null as boolean | null,
      smoking_allowed: null as boolean | null,
    },
  };
}

async function loadLifestyleMap(seekerId: number): Promise<Record<string, string | number>> {
  const { data, error } = await supabase.from("lifestyles").select("lifestyle_key, details").eq("seeker_id", seekerId);
  if (error) throw error;
  const map: Record<string, string | number> = {};
  for (const row of data ?? []) {
    const key = row.lifestyle_key as string;
    const raw = row.details as string;
    const asNum = Number(raw);
    map[key] = Number.isFinite(asNum) && raw.trim() !== "" && !Number.isNaN(asNum) && String(asNum) === raw.trim() ? asNum : raw;
  }
  return map;
}

async function loadRoommatePreferencesRow(seekerId: number) {
  const { data, error } = await supabase.from("roommate_preferences").select("*").eq("seeker_id", seekerId).maybeSingle();
  if (error) throw error;
  return data;
}

async function latestPropertySnapshotByUserIds(userIds: number[]): Promise<Map<number, { has_room: boolean; rent: number | null; location: string | null }>> {
  const map = new Map<number, { has_room: boolean; rent: number | null; location: string | null }>();
  if (!userIds.length) return map;

  const { data: owners, error } = await supabase.from("owner_profiles").select("user_id, owner_id").in("user_id", userIds);
  if (error) throw error;
  const ownerIdToUserId = new Map<number, number>((owners ?? []).map((o: any) => [o.owner_id, o.user_id]));
  const ownerIds = [...ownerIdToUserId.keys()];
  if (!ownerIds.length) return map;

  const { data: props, error: pErr } = await supabase
    .from("properties")
    .select("owner_id, property_id, city, rent")
    .in("owner_id", ownerIds)
    .order("property_id", { ascending: false });
  if (pErr) throw pErr;

  const seenOwner = new Set<number>();
  for (const p of props ?? []) {
    if (seenOwner.has(p.owner_id)) continue;
    seenOwner.add(p.owner_id);
    const uid = ownerIdToUserId.get(p.owner_id);
    if (uid === undefined) continue;
    map.set(uid, { has_room: true, rent: p.rent != null ? Number(p.rent) : null, location: p.city ?? null });
  }
  return map;
}

type InterestedProperty = {
  property_id: number;
  title: string | null;
  city: string | null;
  rent: number | null;
  cover_image: string | null;
};

async function fetchInterestedPropertyByUserIds(userIds: number[]): Promise<Map<number, InterestedProperty>> {
  const map = new Map<number, InterestedProperty>();
  if (!userIds.length) return map;

  // Use inquiries as the signal of interest; fall back silently if table missing
  const { data: inquiries, error } = await supabase
    .from("inquiries")
    .select("user_id, property_id, created_at")
    .in("user_id", userIds)
    .order("created_at", { ascending: false });

  if (error || !inquiries?.length) return map;

  // Keep only the most-recent inquiry per user
  const userToPropId = new Map<number, number>();
  for (const row of inquiries) {
    if (!userToPropId.has(row.user_id)) {
      userToPropId.set(row.user_id, row.property_id);
    }
  }

  const propIds = [...new Set(userToPropId.values())];
  if (!propIds.length) return map;

  const { data: props, error: propErr } = await supabase
    .from("properties")
    .select("property_id, title, city, rent, monthly_rent, cover_image")
    .in("property_id", propIds);
  if (propErr || !props?.length) return map;

  const propById = new Map<number, any>((props as any[]).map((p) => [p.property_id, p]));

  for (const [userId, propId] of userToPropId.entries()) {
    const p = propById.get(propId);
    if (!p) continue;
    map.set(userId, {
      property_id: p.property_id,
      title: p.title ?? null,
      city: p.city ?? null,
      rent: p.monthly_rent ?? p.rent ?? null,
      cover_image: p.cover_image ?? null,
    });
  }

  return map;
}

async function fetchSavedPropertiesByUserIds(userIds: number[]): Promise<Map<number, InterestedProperty[]>> {
  const map = new Map<number, InterestedProperty[]>();
  if (!userIds.length) return map;

  const { data: savedRows, error } = await supabase
    .from("saved_items")
    .select("user_id, property_id")
    .in("user_id", userIds)
    .eq("item_type", "property")
    .not("property_id", "is", null)
    .order("saved_at", { ascending: false });

  if (error || !savedRows?.length) return map;

  const propIds = [...new Set((savedRows as any[]).map((r) => r.property_id))];
  const { data: props, error: propErr } = await supabase
    .from("properties")
    .select("property_id, title, city, rent, monthly_rent, cover_image")
    .in("property_id", propIds);
  if (propErr || !props?.length) return map;

  const propById = new Map<number, any>((props as any[]).map((p) => [p.property_id, p]));

  for (const row of savedRows as any[]) {
    const p = propById.get(row.property_id);
    if (!p) continue;
    const entry: InterestedProperty = {
      property_id: p.property_id,
      title: p.title ?? null,
      city: p.city ?? null,
      rent: p.monthly_rent ?? p.rent ?? null,
      cover_image: p.cover_image ?? null,
    };
    if (!map.has(row.user_id)) map.set(row.user_id, []);
    map.get(row.user_id)!.push(entry);
  }
  return map;
}

async function resolveOwnerId(identifier: string | number): Promise<number> {
  if (numeric(identifier)) {
    const owner = await supabase.from("owner_profiles").select("owner_id").eq("owner_id", Number(identifier)).maybeSingle();
    if (owner.data) return owner.data.owner_id;
  }
  const user = await resolveUser(identifier);
  const { data, error } = await supabase.from("owner_profiles").select("owner_id").eq("user_id", user.user_id).single();
  if (error || !data) throw new HttpError(404, `Owner profile for ${identifier} not found`);
  return data.owner_id;
}

async function upsertByField(table: string, field: string, value: unknown, payload: Record<string, unknown>, trackUpdatedAt = true) {
  const existing = await supabase.from(table).select("*").eq(field, value).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const updatePayload = trackUpdatedAt ? { ...payload, updated_at: new Date().toISOString() } : payload;
    const { data, error } = await supabase.from(table).update(updatePayload).eq(field, value).select("*").single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  if (error) throw error;
  return data;
}

async function fullUserProfile(identifier: string | number) {
  const user = await resolveUser(identifier);
  const [seeker, owner, matchCount, chatCount] = await Promise.all([
    supabase.from("seeker_profiles").select("*, seeker_preferred_locations(*)").eq("user_id", user.user_id).maybeSingle(),
    supabase.from("owner_profiles").select("*").eq("user_id", user.user_id).maybeSingle(),
    supabase.from("match_requests").select("*", { count: "exact", head: true }).eq("seeker_id", user.user_id),
    supabase.from("chat_participants").select("*", { count: "exact", head: true }).eq("user_id", user.user_id),
  ]);
  for (const result of [seeker, owner, matchCount, chatCount]) if (result.error) throw result.error;

  const seekerData = seeker.data as any;
  const ownerData = owner.data as any;

  const [profilePhotoUrl, lifestyleMap, roommateRow, propertyRow, savedPropsMap] = await Promise.all([
    resolveProfilePhotoUrl(user),
    seekerData?.seeker_id ? loadLifestyleMap(seekerData.seeker_id) : Promise.resolve({} as Record<string, string | number>),
    seekerData?.seeker_id ? loadRoommatePreferencesRow(seekerData.seeker_id) : Promise.resolve(null),
    fetchLatestPropertyForUser(user.user_id),
    fetchSavedPropertiesByUserIds([user.user_id]),
  ]);

  const current_room_details = mapPropertyToCurrentRoomDetails(propertyRow);
  const interestedProperties = savedPropsMap.get(user.user_id) ?? [];
  const interestedProperty = interestedProperties[0] ?? null;

  return {
    user_id: user.clerk_id ?? String(user.user_id),
    numeric_user_id: user.user_id,
    basic_info: {
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      profile_photo: profilePhotoUrl,
      is_verified: user.is_verified ?? null,
    },
    seeker_profile: seekerData
      ? {
          gender: seekerData.gender,
          age: seekerData.age,
          occupation: seekerData.occupation,
          bio: seekerData.bio,
          preferred_locations: seekerData.seeker_preferred_locations ?? [],
          lifestyle_preferences: {
            smoking: lifestyleMap.smoking ?? seekerData.smoking,
            drinking: lifestyleMap.drinking ?? seekerData.drinking,
            sleep_schedule: lifestyleMap.sleep_schedule ?? seekerData.sleep_schedule,
            cleanliness: lifestyleMap.cleanliness ?? seekerData.cleanliness,
          },
          roommate_preferences: roommateRow
            ? {
                preferred_gender: roommateRow.preferred_gender,
                age_range: { min: roommateRow.min_age, max: roommateRow.max_age },
                pet_friendly: roommateRow.allow_pets,
                additional_notes: roommateRow.notes,
              }
            : {
                preferred_gender: seekerData.preferred_gender,
                age_range: { min: seekerData.age_min, max: seekerData.age_max },
                pet_friendly: seekerData.pet_friendly,
                additional_notes: seekerData.roommate_notes,
              },
        }
      : null,
    owner_profile: ownerData
      ? {
          business_name: ownerData.business_name ?? null,
          owner_type: ownerData.owner_type ?? null,
          bio: ownerData.bio ?? null,
          kyc_status:
            ownerData.kyc_status ??
            (ownerData.kyc_verified === true ? "verified" : ownerData.kyc_verified === false ? "pending" : null),
          is_verified: ownerData.is_verified ?? ownerData.kyc_verified ?? null,
          rating: ownerData.rating ?? null,
          total_properties: ownerData.total_properties ?? null,
        }
      : null,
    current_room_details,
    propertyId: interestedProperty ? String(interestedProperty.property_id) : null,
    interestedProperty: interestedProperty ?? null,
    interestedProperties,
    stats: { profile_completion: 90, total_matches: matchCount.count ?? 0, active_chats: chatCount.count ?? 0 },
    compatibility_score: 87,
    timestamps: { created_at: user.created_at, updated_at: user.updated_at },
  };
}

export function createDomainRouter() {
  const router = Router();

  // Image upload — accepts multipart/form-data { file }, returns { url }
  router.post("/upload", uploadMiddleware.single("file"), uploadImage);

  router.post("/users", createUser);
  router.post("/users/profile", createOrUpdateUserProfile);

  router.get("/users/dashboard/:userId", async (req, res) => {
    try {
      const user = await resolveUser(req.params.userId);
      const [matches, saved, conversations, notifications, properties] = await Promise.all([
        supabase.from("match_requests").select("*").eq("seeker_id", user.user_id).limit(10).order("created_at", { ascending: false }),
        supabase.from("saved_items").select("*").eq("user_id", user.user_id).limit(10).order("saved_at", { ascending: false }),
        supabase.from("conversations").select("*").or(`user1_id.eq.${user.user_id},user2_id.eq.${user.user_id}`).limit(10).order("updated_at", { ascending: false }),
        supabase.from("notifications").select("*").eq("user_id", user.user_id).limit(10).order("created_at", { ascending: false }),
        supabase.from("properties").select("*, property_photos(*)").eq("status", "active").limit(6).order("created_at", { ascending: false }),
      ]);
      for (const result of [matches, conversations, properties]) if (result.error) throw result.error;
      // saved_items / notifications may not exist yet — treat missing table as empty list
      const savedData = saved.error ? [] : (saved.data ?? []);
      const notificationsData = notifications.error ? [] : (notifications.data ?? []);
      res.json({
        success: true,
        data: {
          user,
          matches: matches.data ?? [],
          saved: savedData,
          conversations: conversations.data ?? [],
          notifications: notificationsData,
          stats: {
            total_matches: matches.data?.length ?? 0,
            active_chats: conversations.data?.filter((item: any) => item.status === "active").length ?? 0,
            saved_properties: savedData.filter((item: any) => item.item_type === "property").length,
            profile_completion: 90,
          },
          recommended_roommates: matches.data ?? [],
          recommended_properties: properties.data ?? [],
          recent_activity: notificationsData,
          saved_items: {
            roommates: savedData.filter((item: any) => item.item_type === "roommate"),
            properties: savedData.filter((item: any) => item.item_type === "property"),
          },
        },
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/conversations", listConversationsEnriched);

  router.post("/conversations", createOrGetConversation);

  router.get("/messages/:conversationId", (req, res) => getMessagesByConversation(req as any, res));

  router.post("/inquiries", async (req, res) => {
    try {
      const user = await resolveUser(req.body.user_id);
      const { data, error } = await supabase
        .from("inquiries")
        .insert({ user_id: user.user_id, property_id: req.body.property_id, message: req.body.message, status: "pending" })
        .select("*")
        .single();
      if (error) throw error;
      res.status(201).json({ success: true, data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/users/:userId", async (req, res, next) => {
    if (["dashboard", "search"].includes(req.params.userId)) return next();
    try {
      res.json({ success: true, data: await fullUserProfile(req.params.userId) });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/users/:userId/unread-count", getUnreadCount);

  // Start chat from User Details page
  router.post("/users/:userId/conversations", createOrGetConversationForUser);

  router.post("/users/search", async (req, res) => {
    try {
      const filters = req.body.filters ?? {};
      const pagination = req.body.pagination ?? {};
      const sort = req.body.sort ?? {};
      const page = Math.max(Number(pagination.page ?? 1), 1);
      const limit = Math.min(Math.max(Number(pagination.limit ?? 10), 1), 100);
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabase
        .from("seeker_profiles")
        .select("*, users(*), seeker_preferred_locations(*), lifestyles(*), roommate_preferences(*)", { count: "exact" })
        .range(from, to);
      if (filters.gender) query = query.eq("gender", filters.gender);
      if (filters.age_range?.min) query = query.gte("age", filters.age_range.min);
      if (filters.age_range?.max) query = query.lte("age", filters.age_range.max);
      if (filters.occupation) query = query.ilike("occupation", `%${filters.occupation}%`);
      if (sort.by === "age") query = query.order("age", { ascending: sort.order !== "desc" });

      const { data, error, count } = await query;
      if (error) throw error;
      const userIds = (data ?? []).map((item: any) => item.user_id);

      // Run room snapshot and interested-property lookup in parallel
      const [roomByUser, interestedPropByUser] = await Promise.all([
        latestPropertySnapshotByUserIds(userIds),
        fetchInterestedPropertyByUserIds(userIds),
      ]);

      const rows = (data ?? [])
        .filter((item: any) => !filters.location || item.seeker_preferred_locations?.some((l: any) => String(l.location_name).toLowerCase().includes(String(filters.location).toLowerCase())))
        .filter((item: any) => filters.room_filters?.has_room === undefined || Boolean(roomByUser.get(item.user_id)?.has_room) === filters.room_filters.has_room)
        .filter((item: any) => !filters.budget?.min || Number(roomByUser.get(item.user_id)?.rent ?? 0) >= Number(filters.budget.min))
        .filter((item: any) => !filters.budget?.max || Number(roomByUser.get(item.user_id)?.rent ?? 0) <= Number(filters.budget.max))
        .map((item: any) => {
          const room = roomByUser.get(item.user_id);

          // Build lifestyle map from the joined lifestyles rows
          const lifestyleArr: Array<{ lifestyle_key: string; details: string }> = item.lifestyles ?? [];
          const lm: Record<string, string> = Object.fromEntries(lifestyleArr.map((l) => [l.lifestyle_key, String(l.details ?? "")]));

          // roommate_preferences is a one-to-many but effectively one row per seeker
          const rpArr: any[] = item.roommate_preferences ?? [];
          const rp = rpArr[0] ?? null;

          const locs: string[] = (item.seeker_preferred_locations ?? []).map((l: any) => l.location_name).filter(Boolean);

          const smokingRaw = (lm.smoking ?? "").toLowerCase();
          const drinkingRaw = (lm.drinking ?? "").toLowerCase();
          const smoking = smokingRaw === "yes" || smokingRaw === "occasionally";
          const drinking = drinkingRaw === "yes" || drinkingRaw === "occasionally";
          const validSchedules = ["early_bird", "night_owl", "flexible"];
          const schedule = validSchedules.includes(lm.sleep_schedule) ? lm.sleep_schedule : "flexible";
          const cleanNum = Number(lm.cleanliness ?? "3");
          const cleanliness = cleanNum >= 4 ? "high" : cleanNum >= 2 ? "medium" : "relaxed";

          const preferences: string[] = [];
          if (!smoking) preferences.push("Non-smoker");
          if (!drinking) preferences.push("Non-drinker");
          if (rp?.allow_pets) preferences.push("Pet-friendly");
          if (rp?.preferred_gender && rp.preferred_gender !== "any") preferences.push(`Prefers ${rp.preferred_gender}`);

          const preferredGender = ["male", "female", "any"].includes(rp?.preferred_gender) ? rp.preferred_gender : "any";
          const gender = item.gender === "male" ? "male" : "female";

          const interestedProperty = interestedPropByUser.get(item.user_id) ?? null;

          return {
            id: String(item.users?.clerk_id ?? item.user_id),
            name: item.users?.full_name ?? "Unknown",
            age: item.age ?? 25,
            gender,
            city: room?.location ?? locs[0] ?? "",
            occupation: item.occupation ?? "",
            company: "",
            bio: item.bio ?? "",
            compatibility: Math.min(98, 70 + cleanNum * 4),
            budget: room?.rent ?? 0,
            lifestyle: { smoking, drinking, pets: rp?.allow_pets ?? false, schedule, cleanliness },
            preferences,
            preferredGender,
            languages: [],
            avatar: item.users?.profile_photo ?? "",
            lookingIn: locs,
            propertyId: interestedProperty ? String(interestedProperty.property_id) : undefined,
            interestedProperty: interestedProperty ?? undefined,
          };
        })
        .sort((a: any, b: any) => sort.by === "compatibility" && sort.order !== "asc" ? b.compatibility - a.compatibility : 0);

      res.json({ success: true, page, limit, total: count ?? rows.length, data: rows });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/owners/profile", submitOwnerProfile);

  router.get("/owners/dashboard/:ownerId", async (req, res) => {
    try {
      const ownerId = await resolveOwnerId(req.params.ownerId);
      const owner = await supabase.from("owner_profiles").select("*, users(*)").eq("owner_id", ownerId).single();
      if (owner.error) throw owner.error;
      const properties = await supabase.from("properties").select("*, property_photos(*)").eq("owner_id", ownerId).order("created_at", { ascending: false });
      if (properties.error) throw properties.error;
      const propertyIds = (properties.data ?? []).map((property: any) => property.property_id);
      const [inquiries, messages, notifications, analytics] = await Promise.all([
        propertyIds.length ? supabase.from("inquiries").select("*, users(*), properties(*)").in("property_id", propertyIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
        supabase.from("conversations").select("*").or(`user1_id.eq.${owner.data.user_id},user2_id.eq.${owner.data.user_id}`).limit(10).order("updated_at", { ascending: false }),
        supabase.from("notifications").select("*").eq("user_id", owner.data.user_id).limit(10).order("created_at", { ascending: false }),
        Promise.resolve({ data: [], error: null }),
      ]);
      for (const result of [inquiries, messages]) if (result.error) throw result.error;
      // notifications / analytics may not exist yet — treat as empty
      const ownerNotifications = notifications.error ? [] : (notifications.data ?? []);
      const active = (properties.data ?? []).filter((property: any) => property.status === "active");

      res.json({
        success: true,
        data: {
          owner: {
            owner_id: owner.data.users?.clerk_id,
            full_name: owner.data.users?.full_name,
            profile_photo: owner.data.users?.profile_photo,
            is_verified: owner.data.is_verified,
            kyc_status: owner.data.kyc_status,
          },
          stats: {
            total_properties: properties.data?.length ?? 0,
            active_listings: active.length,
            inactive_listings: (properties.data?.length ?? 0) - active.length,
            total_views: (properties.data ?? []).reduce((sum: number, property: any) => sum + Number(property.total_views ?? 0), 0),
            total_inquiries: inquiries.data?.length ?? 0,
            total_bookings: 0,
          },
          earnings: { monthly_earnings: 0, pending_payments: 0, total_earnings: 0 },
          properties: (properties.data ?? []).map((property: any) => ({
            property_id: property.property_id,
            title: property.title,
            location: property.city,
            price: property.monthly_rent,
            status: property.status,
            available_rooms: property.available_rooms,
            views: property.total_views,
            inquiries: inquiries.data?.filter((inquiry: any) => inquiry.property_id === property.property_id).length ?? 0,
            cover_image: property.cover_image ?? null,
            created_at: property.created_at,
          })),
          recent_inquiries: (inquiries.data ?? []).slice(0, 10).map((inquiry: any) => ({
            inquiry_id: inquiry.inquiry_id,
            user: { user_id: inquiry.users?.clerk_id, name: inquiry.users?.full_name, profile_image: inquiry.users?.profile_photo },
            property: { property_id: inquiry.properties?.property_id, title: inquiry.properties?.title },
            message: inquiry.message,
            timestamp: inquiry.created_at,
            status: inquiry.status,
          })),
          recent_messages: messages.data ?? [],
          notifications: ownerNotifications,
          analytics: {
            views_trend: (analytics.data ?? []).map((row: any) => ({ date: row.date, views: row.views })),
            inquiry_trend: (analytics.data ?? []).map((row: any) => ({ date: row.date, count: row.inquiries })),
          },
          quick_actions: [{ label: "Add New Property", action: "/add-property" }, { label: "View Messages", action: "/messages" }],
        },
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/properties/search", searchPropertiesPost);

  router.post("/properties", upsertPropertyListing);

  router.get("/properties/:propertyId", getPropertyDetail);

  // Start chat from Property Details page
  router.post("/properties/:propertyId/conversations", createOrGetConversationForProperty);

  router.get("/properties/search", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 20), 100);
      let query = supabase.from("properties").select("*, property_photos(*), property_amenities(*)").eq("status", "active").limit(limit).order("created_at", { ascending: false });

      if (req.query.city) query = query.ilike("city", `%${String(req.query.city)}%`);
      if (req.query.property_type) query = query.eq("property_type", req.query.property_type);
      if (req.query.room_type) query = query.eq("room_type", req.query.room_type);
      if (req.query.min_rent) query = query.gte("monthly_rent", Number(req.query.min_rent));
      if (req.query.max_rent) query = query.lte("monthly_rent", Number(req.query.max_rent));
      if (req.query.q) query = query.or(`title.ilike.%${req.query.q}%,description.ilike.%${req.query.q}%,address.ilike.%${req.query.q}%`);

      const { data, error } = await query;
      if (error) throw error;
      res.json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  // Back-compat alias (older clients): creates/fetches conversation and optionally posts a first message.
  router.post("/chat/conversations", async (req, res) => {
    try {
      const sender = await resolveUser(req.body.sender_id);
      const receiver = await resolveUser(req.body.receiver_id);
      if (sender.user_id === receiver.user_id) throw new HttpError(400, "Conversation users must be different");

      const existing = await supabase
        .from("conversations")
        .select("*")
        .or(
          `and(user1_id.eq.${sender.user_id},user2_id.eq.${receiver.user_id}),and(user1_id.eq.${receiver.user_id},user2_id.eq.${sender.user_id})`,
        )
        .limit(1)
        .maybeSingle();
      if (existing.error) throw existing.error;

      const inserted = existing.data
        ? null
        : await supabase
            .from("conversations")
            .insert({
              user1_id: sender.user_id,
              user2_id: receiver.user_id,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select("*")
            .single();
      if (inserted?.error) {
        // race-safe: if someone else created it, fetch and continue
        if (inserted.error.code !== "23505") throw inserted.error;
        const retry = await supabase
          .from("conversations")
          .select("*")
          .or(
            `and(user1_id.eq.${sender.user_id},user2_id.eq.${receiver.user_id}),and(user1_id.eq.${receiver.user_id},user2_id.eq.${sender.user_id})`,
          )
          .limit(1)
          .maybeSingle();
        if (retry.error) throw retry.error;
        if (!retry.data) throw inserted.error;
        (inserted as any).data = retry.data;
      }

      const conversation = existing.data ?? inserted?.data ?? null;

      if (!conversation) throw new HttpError(500, "Unable to create conversation");

      const message = String(req.body?.message ?? "").trim();
      if (message) {
        const msgIns = await supabase.from("messages").insert({
          conversation_id: conversation.conversation_id,
          sender_id: sender.user_id,
          receiver_id: receiver.user_id,
          content: message,
          message_type: "text",
          read: false,
        });
        if (msgIns.error) throw msgIns.error;
        const upd = await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("conversation_id", conversation.conversation_id);
        if (upd.error) throw upd.error;
      }

      res.status(201).json({ success: true, data: { conversation_id: conversation.conversation_id, message: "Chat request sent" } });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/properties/:propertyId/view", async (req, res) => {
    try {
      const propertyId = Number(req.params.propertyId);
      const viewerId = req.body.viewer_id ?? null;
      const { data, error } = await supabase.from("property_views").insert({ property_id: propertyId, viewer_id: viewerId }).select("*").single();
      if (error) throw error;
      await supabase.rpc("increment_property_views", { target_property_id: propertyId });
      res.status(201).json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/users/:userId/dashboard", async (req, res) => {
    try {
      const { user_id: userId } = await resolveUser(req.params.userId);
      const [user, matches, saved, conversations, notifications] = await Promise.all([
        supabase.from("users").select("*").eq("user_id", userId).single(),
        supabase.from("match_requests").select("*").eq("seeker_id", userId).limit(10).order("created_at", { ascending: false }),
        supabase.from("saved_items").select("*").eq("user_id", userId).limit(10).order("saved_at", { ascending: false }),
        supabase.from("conversations").select("*").or(`user1_id.eq.${userId},user2_id.eq.${userId}`).limit(10).order("updated_at", { ascending: false }),
        supabase.from("notifications").select("*").eq("user_id", userId).eq("is_read", false).limit(10).order("created_at", { ascending: false }),
      ]);

      for (const result of [user, matches, conversations]) {
        if (result.error) throw result.error;
      }

      res.json({
        data: {
          user: user.data,
          matches: matches.data ?? [],
          saved: saved.error ? [] : (saved.data ?? []),
          conversations: conversations.data ?? [],
          notifications: notifications.error ? [] : (notifications.data ?? []),
        },
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/users/:userId/matches", async (req, res) => {
    try {
      const { user_id: userId } = await resolveUser(req.params.userId);
      const { data, error } = await supabase
        .from("match_requests")
        .select("*")
        .eq("seeker_id", userId)
        .order("compatibility_score", { ascending: false });
      if (error) throw error;
      res.json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/users/:userId/saved/properties", async (req, res) => {
    try {
      const { user_id: userId } = await resolveUser(req.params.userId);
      const savedPropsMap = await fetchSavedPropertiesByUserIds([userId]);
      res.json({ data: savedPropsMap.get(userId) ?? [] });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/users/:userId/saved", async (req, res) => {
    try {
      const { user_id: userId } = await resolveUser(req.params.userId);
      const { data, error } = await supabase.from("saved_items").select("*").eq("user_id", userId).order("saved_at", { ascending: false });
      if (error) throw error;
      res.json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/users/:userId/saved", async (req, res) => {
    try {
      const { user_id: userId } = await resolveUser(req.params.userId);
      const { data, error } = await supabase.from("saved_items").insert({ ...req.body, user_id: userId }).select("*").single();
      if (error) throw error;
      res.status(201).json({ data });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete("/users/:userId/saved/:savedId", async (req, res) => {
    try {
      const { user_id: userId } = await resolveUser(req.params.userId);
      const { error } = await supabase.from("saved_items").delete().eq("user_id", userId).eq("id", Number(req.params.savedId));
      if (error) throw error;
      res.status(204).send();
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/conversations/:conversationId", getConversation);
  router.get("/conversations/:conversationId/messages", getMessagesPaginated);
  router.post("/conversations/:conversationId/messages", postMessageToConversation);
  router.post("/conversations/:conversationId/read", markMessagesRead);

  return router;
}
