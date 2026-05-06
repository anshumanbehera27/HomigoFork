import type { Request, Response } from "express";
import { supabase } from "../config/supabase.js";
import { HttpError, sendError } from "../utils/http.js";

type RoomSaveResult = {
  property_id: number;
  is_available: boolean | null;
  city: string | null;
  rent: number | null;
  images_count: number;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toKycVerified = (kycStatus: unknown): boolean | null => {
  const value = String(kycStatus ?? "").toLowerCase();
  if (!value) return null;
  if (value === "verified" || value === "approved") return true;
  if (["pending", "rejected", "failed"].includes(value)) return false;
  return null;
};

const toAmenityLabel = (key: string): string =>
  key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

async function ensureUser(userId: unknown, basicInfo: any) {
  if (!basicInfo?.email) throw new HttpError(400, "basic_info.email is required");
  const role = basicInfo.role ?? "seeker";
  const clerkId: string | null = basicInfo.clerk_id ?? null;

  // Prefer lookup by clerk_id when provided so we don't create duplicates
  // if the user's email ever changes in Clerk.
  const existing = clerkId
    ? await supabase.from("users").select("*").eq("clerk_id", clerkId).maybeSingle()
    : await supabase.from("users").select("*").eq("email", basicInfo.email).maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data) {
    const updatePayload: Record<string, unknown> = {
      full_name: basicInfo.full_name ?? existing.data.full_name,
      phone: basicInfo.phone ?? existing.data.phone,
      role,
      updated_at: new Date().toISOString(),
    };
    if (clerkId) updatePayload.clerk_id = clerkId;

    const updated = await supabase
      .from("users")
      .update(updatePayload)
      .eq("user_id", existing.data.user_id)
      .select("*")
      .single();
    if (updated.error || !updated.data) throw updated.error ?? new Error("Unable to update user");
    return updated.data;
  }

  const createPayload: Record<string, unknown> = {
    full_name: basicInfo.full_name ?? null,
    email: basicInfo.email,
    phone: basicInfo.phone ?? null,
    role,
    updated_at: new Date().toISOString(),
  };
  if (clerkId) createPayload.clerk_id = clerkId;

  // Only set explicit numeric user_id on first insert, never on update.
  const numericUserId = toNumber(userId);
  if (numericUserId !== null) createPayload.user_id = numericUserId;

  const created = await supabase.from("users").insert(createPayload).select("*").single();
  if (created.error || !created.data) throw created.error ?? new Error("Unable to create user");
  return created.data;
}

async function saveProfilePhoto(userId: number, profilePhotoUrl: string | undefined) {
  if (!profilePhotoUrl) return;
  const mediaInsert = await supabase
    .from("media")
    .insert({ url: profilePhotoUrl, type: "image", uploaded_by: userId })
    .select("media_id")
    .single();
  if (mediaInsert.error || !mediaInsert.data) throw mediaInsert.error ?? new Error("Unable to save profile photo");

  const userUpdate = await supabase
    .from("users")
    .update({ profile_photo_id: mediaInsert.data.media_id, profile_photo: profilePhotoUrl, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (userUpdate.error) throw userUpdate.error;
}

async function upsertSeekerProfile(userId: number, seekerProfile: any) {
  if (!seekerProfile) return;

  const seekerResult = await supabase
    .from("seeker_profiles")
    .upsert(
      {
        user_id: userId,
        gender: seekerProfile.gender ?? null,
        age: toNumber(seekerProfile.age),
        occupation: seekerProfile.occupation ?? null,
        bio: seekerProfile.bio ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (seekerResult.error || !seekerResult.data) throw seekerResult.error ?? new Error("Unable to save seeker profile");
  const seekerId = seekerResult.data.seeker_id;

  const deleteLocations = await supabase.from("seeker_preferred_locations").delete().eq("seeker_id", seekerId);
  if (deleteLocations.error) throw deleteLocations.error;

  const preferredLocations = seekerProfile.preferred_locations ?? [];
  if (preferredLocations.length) {
    const locationInsert = await supabase.from("seeker_preferred_locations").insert(
      preferredLocations.map((location: any) => ({
        seeker_id: seekerId,
        location_name: location.location_name ?? null,
        latitude: toNumber(location.lat),
        longitude: toNumber(location.lng),
        priority: toNumber(location.priority),
      })),
    );
    if (locationInsert.error) throw locationInsert.error;
  }

  const deleteLifestyle = await supabase.from("lifestyles").delete().eq("seeker_id", seekerId);
  if (deleteLifestyle.error) throw deleteLifestyle.error;

  const lifestyle = seekerProfile.lifestyle_preferences ?? {};
  const lifestyleEntries = Object.entries(lifestyle).filter(([, value]) => value !== undefined && value !== null);
  if (lifestyleEntries.length) {
    const lifestyleInsert = await supabase.from("lifestyles").insert(
      lifestyleEntries.map(([lifestyle_key, details]) => ({
        seeker_id: seekerId,
        lifestyle_key,
        details: String(details),
      })),
    );
    if (lifestyleInsert.error) throw lifestyleInsert.error;
  }

  const roommate = seekerProfile.roommate_preferences ?? {};
  const prefPayload = {
    seeker_id: seekerId,
    min_age: toNumber(roommate.age_range?.min),
    max_age: toNumber(roommate.age_range?.max),
    preferred_gender: roommate.preferred_gender ?? "any",
    allow_pets: roommate.pet_friendly ?? null,
    notes: roommate.additional_notes ?? null,
  };
  const existingPreference = await supabase
    .from("roommate_preferences")
    .select("pref_id")
    .eq("seeker_id", seekerId)
    .maybeSingle();
  if (existingPreference.error) throw existingPreference.error;

  if (existingPreference.data) {
    const updatePreference = await supabase
      .from("roommate_preferences")
      .update(prefPayload)
      .eq("pref_id", existingPreference.data.pref_id);
    if (updatePreference.error) throw updatePreference.error;
  } else {
    const insertPreference = await supabase.from("roommate_preferences").insert(prefPayload);
    if (insertPreference.error) throw insertPreference.error;
  }
}

async function ensureOwnerProfile(userId: number, ownerProfile: any) {
  if (!ownerProfile) return null;
  const saveOwner = await supabase
    .from("owner_profiles")
    .upsert(
      {
        user_id: userId,
        kyc_verified: toKycVerified(ownerProfile.kyc_status),
        total_properties: toNumber(ownerProfile.property_preferences?.total_rooms),
      },
      { onConflict: "user_id" },
    )
    .select("*")
    .single();
  if (saveOwner.error || !saveOwner.data) throw saveOwner.error ?? new Error("Unable to save owner profile");
  return saveOwner.data;
}

async function upsertCurrentRoom(ownerId: number, roomDetails: any): Promise<RoomSaveResult | null> {
  if (!roomDetails) return null;
  if (roomDetails.has_room === false) return null;

  const propertyPayload = {
    owner_id: ownerId,
    title: roomDetails.room_type ? `${roomDetails.room_type} room` : "Room available",
    description: roomDetails.description ?? null,
    city: roomDetails.location ?? null,
    address: roomDetails.location ?? null,
    rent: toNumber(roomDetails.rent),
    property_type: roomDetails.room_type === "shared" ? "Shared" : "PG",
    available_for: roomDetails.room_preferences?.preferred_gender ?? "any",
    is_available: (toNumber(roomDetails.vacancy) ?? 0) > 0,
    updated_at: new Date().toISOString(),
  };

  const existing = await supabase
    .from("properties")
    .select("property_id")
    .eq("owner_id", ownerId)
    .order("property_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const property = existing.data
    ? await supabase.from("properties").update(propertyPayload).eq("property_id", existing.data.property_id).select("*").single()
    : await supabase.from("properties").insert(propertyPayload).select("*").single();
  if (property.error || !property.data) throw property.error ?? new Error("Unable to save room/property details");
  const propertyId = property.data.property_id;

  const oldPhotos = await supabase.from("property_photos").select("media_id").eq("property_id", propertyId);
  if (oldPhotos.error) throw oldPhotos.error;

  const deletePhotos = await supabase.from("property_photos").delete().eq("property_id", propertyId);
  if (deletePhotos.error) throw deletePhotos.error;

  const oldMediaIds = (oldPhotos.data ?? []).map((item) => item.media_id).filter((id) => id != null);
  if (oldMediaIds.length) {
    const deleteMedia = await supabase.from("media").delete().in("media_id", oldMediaIds);
    if (deleteMedia.error) throw deleteMedia.error;
  }

  const roomImages: string[] = roomDetails.room_images ?? [];
  const mediaIds: number[] = [];
  for (const imageUrl of roomImages) {
    const mediaRow = await supabase
      .from("media")
      .insert({ url: imageUrl, type: "image", uploaded_by: null })
      .select("media_id")
      .single();
    if (mediaRow.error || !mediaRow.data) throw mediaRow.error ?? new Error("Unable to save room image");
    mediaIds.push(mediaRow.data.media_id);
  }

  if (mediaIds.length) {
    const photoInsert = await supabase.from("property_photos").insert(
      mediaIds.map((mediaId, index) => ({
        property_id: propertyId,
        media_id: mediaId,
        sort_order: index + 1,
      })),
    );
    if (photoInsert.error) throw photoInsert.error;
  }

  const removeAmenities = await supabase.from("property_amenities").delete().eq("property_id", propertyId);
  if (removeAmenities.error) throw removeAmenities.error;

  const amenities: string[] = roomDetails.amenities ?? [];
  if (amenities.length) {
    const amenityIds: number[] = [];
    for (const amenityKey of amenities) {
      const upsertAmenity = await supabase
        .from("amenity_catalog")
        .upsert({ key: amenityKey, label: toAmenityLabel(amenityKey) }, { onConflict: "key" })
        .select("amenity_id")
        .single();
      if (upsertAmenity.error || !upsertAmenity.data) throw upsertAmenity.error ?? new Error("Unable to save amenity");
      amenityIds.push(upsertAmenity.data.amenity_id);
    }
    const insertAmenities = await supabase.from("property_amenities").insert(
      amenityIds.map((amenityId) => ({
        property_id: propertyId,
        amenity_id: amenityId,
      })),
    );
    if (insertAmenities.error) throw insertAmenities.error;
  }

  return {
    property_id: propertyId,
    is_available: property.data.is_available ?? null,
    city: property.data.city ?? null,
    rent: property.data.rent ?? null,
    images_count: mediaIds.length,
  };
}

export async function createOrUpdateUserProfile(req: Request, res: Response) {
  try {
    const body = req.body ?? {};
    const basicInfo = body.basic_info ?? {};
    const user = await ensureUser(body.user_id, basicInfo);

    await saveProfilePhoto(user.user_id, basicInfo.profile_photo);
    await upsertSeekerProfile(user.user_id, body.seeker_profile);
    const owner = await ensureOwnerProfile(user.user_id, body.owner_profile);

    const roomResult =
      owner && body.current_room_details
        ? await upsertCurrentRoom(owner.owner_id, body.current_room_details)
        : null;

    res.json({
      success: true,
      message: "Room details updated successfully",
      data: {
        current_room_details: roomResult
          ? {
              room_id: `room_${roomResult.property_id}`,
              has_room: body.current_room_details?.has_room ?? true,
              location: roomResult.city,
              rent: roomResult.rent,
              vacancy: toNumber(body.current_room_details?.vacancy),
              images_count: roomResult.images_count,
              status: roomResult.is_available ? "active" : "inactive",
            }
          : null,
      },
    });
  } catch (error) {
    sendError(res, error);
  }
}

export async function createUser(req: Request, res: Response) {
  try {
    const basicInfo = req.body?.basic_info ?? req.body ?? {};
    const user = await ensureUser(req.body?.user_id, basicInfo);
    await saveProfilePhoto(user.user_id, basicInfo.profile_photo);

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    sendError(res, error);
  }
}
