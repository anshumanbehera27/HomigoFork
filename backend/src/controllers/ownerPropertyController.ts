import type { NextFunction, Request, Response } from "express";
import { supabase } from "../config/supabase.js";
import { HttpError, sendError } from "../utils/http.js";

/** DB enum `property_type_enum` values from schema.sql */
const PROPERTY_TYPE_ENUM = new Set(["1BHK", "2BHK", "Shared", "PG"]);

const numeric = (value: unknown) => /^\d+$/.test(String(value ?? ""));

function mapPropertyTypeToEnum(input: unknown): string {
  const raw = String(input ?? "").trim();
  if (PROPERTY_TYPE_ENUM.has(raw)) return raw;
  const lower = raw.toLowerCase();
  const map: Record<string, string> = {
    apartment: "2BHK",
    villa: "2BHK",
    studio: "1BHK",
    pg: "PG",
    hostel: "PG",
    shared: "Shared",
    "entire_unit": "2BHK",
  };
  return map[lower] ?? "2BHK";
}

async function ensureUserByBasic(basic: { full_name?: string; email: string; phone?: string; photo?: string }) {
  if (!basic?.email) throw new HttpError(400, "basic_info.email is required");
  const existing = await supabase.from("users").select("*").eq("email", basic.email).maybeSingle();
  if (existing.error) throw existing.error;

  if (existing.data) {
    const upd = await supabase
      .from("users")
      .update({
        full_name: basic.full_name ?? existing.data.full_name,
        phone: basic.phone ?? existing.data.phone,
        role: "owner",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", existing.data.user_id)
      .select("*")
      .single();
    if (upd.error || !upd.data) throw upd.error ?? new Error("Unable to update user");
    if (basic.photo) await saveUserProfilePhoto(upd.data.user_id, basic.photo);
    return upd.data;
  }

  const ins = await supabase
    .from("users")
    .insert({
      full_name: basic.full_name ?? null,
      email: basic.email,
      phone: basic.phone ?? null,
      role: "owner",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (ins.error || !ins.data) throw ins.error ?? new Error("Unable to create user");
  if (basic.photo) await saveUserProfilePhoto(ins.data.user_id, basic.photo);
  return ins.data;
}

async function saveUserProfilePhoto(userId: number, photoUrl: string) {
  const m = await supabase.from("media").insert({ url: photoUrl, type: "image", uploaded_by: userId }).select("media_id").single();
  if (m.error || !m.data) throw m.error ?? new Error("Unable to save profile photo");
  const u = await supabase.from("users").update({ profile_photo_id: m.data.media_id, profile_photo: photoUrl, updated_at: new Date().toISOString() }).eq("user_id", userId);
  if (u.error) throw u.error;
}

async function resolveOwnerProfileId(ownerRef: unknown): Promise<number> {
  if (numeric(ownerRef)) {
    const asNum = Number(ownerRef);
    const byOwner = await supabase.from("owner_profiles").select("owner_id").eq("owner_id", asNum).maybeSingle();
    if (byOwner.data) return byOwner.data.owner_id;
    const byUser = await supabase.from("owner_profiles").select("owner_id").eq("user_id", asNum).maybeSingle();
    if (byUser.data) return byUser.data.owner_id;
    throw new HttpError(404, "Owner profile not found for given id");
  }
  const { data, error } = await supabase.from("users").select("user_id").eq("email", String(ownerRef)).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "User not found for owner_id");
  const op = await supabase.from("owner_profiles").select("owner_id").eq("user_id", data.user_id).maybeSingle();
  if (op.error) throw op.error;
  if (!op.data) throw new HttpError(404, "Owner profile not found; complete POST /api/owners/profile first");
  return op.data.owner_id;
}

async function ensureAmenityIds(keys: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const key of keys) {
    const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const up = await supabase.from("amenity_catalog").upsert({ key, label }, { onConflict: "key" }).select("amenity_id").single();
    if (up.error || !up.data) throw up.error ?? new Error(`Amenity upsert failed: ${key}`);
    ids.push(up.data.amenity_id);
  }
  return ids;
}

async function replacePropertyPhotos(propertyId: number, imageUrls: string[], coverUrl?: string | null) {
  const { data: existing } = await supabase.from("property_photos").select("media_id").eq("property_id", propertyId);
  if (existing?.length) {
    const mediaIds = existing.map((r: { media_id: number }) => r.media_id).filter(Boolean);
    await supabase.from("property_photos").delete().eq("property_id", propertyId);
    if (mediaIds.length) await supabase.from("media").delete().in("media_id", mediaIds);
  }

  const ordered = coverUrl ? [coverUrl, ...imageUrls.filter((u) => u !== coverUrl)] : imageUrls;
  let order = 0;
  for (const url of ordered) {
    if (!url) continue;
    const media = await supabase.from("media").insert({ url, type: "image", uploaded_by: null }).select("media_id").single();
    if (media.error || !media.data) throw media.error ?? new Error("Failed to save property image");
    const ph = await supabase.from("property_photos").insert({
      property_id: propertyId,
      media_id: media.data.media_id,
      sort_order: order++,
    });
    if (ph.error) throw ph.error;
  }
}

async function replacePropertyAmenities(propertyId: number, amenityKeys: string[]) {
  await supabase.from("property_amenities").delete().eq("property_id", propertyId);
  if (!amenityKeys.length) return;
  const ids = await ensureAmenityIds(amenityKeys);
  const ins = await supabase.from("property_amenities").insert(ids.map((amenity_id) => ({ property_id: propertyId, amenity_id })));
  if (ins.error) throw ins.error;
}

/**
 * POST /api/owners/profile
 * basic_info, owner_profile, verification_details (government_id + address_proof)
 */
export async function submitOwnerProfile(req: Request, res: Response) {
  try {
    const body = req.body ?? {};
    const basic = body.basic_info ?? {};
    const owner = body.owner_profile ?? {};
    const verification = body.verification_details ?? {};

    const user = await ensureUserByBasic({
      full_name: basic.name ?? basic.full_name,
      email: basic.email,
      phone: basic.phone,
      photo: basic.photo ?? basic.profile_photo,
    });

    const existingOp = await supabase.from("owner_profiles").select("owner_id").eq("user_id", user.user_id).maybeSingle();
    const businessFields = {
      business_name: owner.business_name ?? null,
      owner_type: owner.owner_type ?? owner.type ?? "individual",
      bio: owner.bio ?? null,
    };

    const saved = existingOp.data
      ? await supabase.from("owner_profiles").update(businessFields).eq("owner_id", existingOp.data.owner_id).select("*").single()
      : await supabase
          .from("owner_profiles")
          .insert({
            user_id: user.user_id,
            rating: null,
            total_properties: 0,
            kyc_verified: false,
            ...businessFields,
            kyc_status: "pending",
            is_verified: false,
          })
          .select("*")
          .single();

    if (saved.error || !saved.data) throw saved.error ?? new Error("Unable to save owner profile");

    const gov = verification.government_id ?? {};
    const addr = verification.address_proof ?? {};
    const imgs: string[] = Array.isArray(gov.document_images) ? gov.document_images : [];
    const kycRow = {
      owner_id: saved.data.owner_id,
      id_type: gov.id_type ?? "pan",
      id_number: gov.id_number ?? null,
      id_front_url: imgs[0] ?? null,
      id_back_url: imgs[1] ?? null,
      address_doc_type: addr.document_type ?? "utility_bill",
      address_doc_url: addr.document_image ?? addr.document_url,
    };
    if (!kycRow.address_doc_url) throw new HttpError(400, "verification_details.address_proof.document_image is required");

    const kycIns = await supabase.from("kyc_documents").insert(kycRow).select("kyc_id").single();
    if (kycIns.error) {
      if (String(kycIns.error.message).includes("does not exist") || kycIns.error.code === "42P01") {
        throw new HttpError(500, "kyc_documents table missing — run backend/supabase/schema_extensions_api.sql");
      }
      throw kycIns.error;
    }

    res.status(201).json({
      success: true,
      message: "Owner profile and KYC submitted successfully",
      data: {
        owner_id: saved.data.owner_id,
        kyc_status: saved.data.kyc_status ?? "pending",
        is_verified: Boolean(saved.data.is_verified),
      },
    });
  } catch (error) {
    sendError(res, error);
  }
}

/**
 * POST /api/properties
 */
export async function upsertPropertyListing(req: Request, res: Response) {
  try {
    const body = req.body ?? {};
    const ownerId = await resolveOwnerProfileId(body.owner_id);
    const details = body.property_details ?? {};
    const location = body.location ?? {};
    const pricing = body.pricing ?? {};
    const availability = body.availability ?? {};
    const specs = body.property_specs ?? body.specs ?? {};
    const features = body.features ?? {};
    const media = body.media ?? {};

    const monthlyRent = pricing.monthly_rent ?? pricing.rent;
    if (monthlyRent == null) throw new HttpError(400, "pricing.monthly_rent is required");

    const propertyTypeEnum = mapPropertyTypeToEnum(details.property_type ?? details.type);
    const rentValue = Number(monthlyRent);

    const row: Record<string, unknown> = {
      owner_id: ownerId,
      title: details.title ?? "Listing",
      description: details.description ?? null,
      property_type: propertyTypeEnum,
      room_type: details.room_type ?? null,
      listing_type: body.listing_type ?? "rent",
      promotion_type: body.promotion_type ?? "standard",
      city: location.city ?? null,
      address: location.address ?? null,
      state: location.state ?? null,
      latitude: location.lat ?? location.latitude ?? null,
      longitude: location.lng ?? location.longitude ?? null,
      rent: rentValue,
      monthly_rent: rentValue,
      security_deposit: pricing.security_deposit ?? 0,
      maintenance_charges: pricing.maintenance_charges ?? 0,
      available_from: availability.available_from ?? null,
      minimum_stay_months: availability.minimum_stay_months ?? null,
      available_rooms: specs.available_rooms ?? availability.available_rooms ?? 1,
      total_rooms: specs.total_rooms ?? null,
      bathrooms: specs.bathrooms ?? null,
      balcony: specs.balcony ?? null,
      furnishing: features.furnishing ?? null,
      cover_image: media.cover_image ?? null,
      status: body.status ?? "active",
      is_available: body.status !== "archived" && body.status !== "paused",
      available_for: body.available_for ?? "any",
      updated_at: new Date().toISOString(),
    };

    const existingId = numeric(body.property_id) ? Number(body.property_id) : null;
    const result = existingId
      ? await supabase.from("properties").update(row).eq("property_id", existingId).eq("owner_id", ownerId).select("*").single()
      : await supabase.from("properties").insert({ ...row, created_at: new Date().toISOString() }).select("*").single();

    if (result.error || !result.data) throw result.error ?? new HttpError(400, "Could not save property");

    const propertyId = result.data.property_id as number;
    await replacePropertyAmenities(propertyId, features.amenities ?? []);
    const images: string[] = Array.isArray(media.images) ? media.images : [];
    await replacePropertyPhotos(propertyId, images, media.cover_image);

    res.status(existingId ? 200 : 201).json({
      success: true,
      message: existingId ? "Property updated successfully" : "Property created successfully",
      data: { property_id: propertyId, status: result.data.status ?? "active" },
    });
  } catch (error) {
    sendError(res, error);
  }
}

/**
 * POST /api/properties/search
 */
export async function searchPropertiesPost(req: Request, res: Response) {
  try {
    const filters = req.body.filters ?? {};
    const pagination = req.body.pagination ?? {};
    const sort = req.body.sort ?? {};
    const page = Math.max(Number(pagination.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(pagination.limit ?? 10), 1), 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("properties")
      .select(
        `
        *,
        owner_profiles ( owner_id, kyc_status, is_verified, kyc_verified, users ( user_id, full_name, email, phone ) ),
        property_photos ( sort_order, media ( url ) ),
        property_amenities ( amenity_catalog ( key ) )
      `,
        { count: "exact" },
      )
      .eq("is_available", true)
      .range(from, to);

    if (filters.city) query = query.ilike("city", `%${filters.city}%`);
    if (filters.property_type) query = query.eq("property_type", filters.property_type);
    if (filters.room_type) query = query.eq("room_type", filters.room_type);
    if (filters.promotion_type) query = query.eq("promotion_type", filters.promotion_type);
    if (filters.available_rooms != null) query = query.gte("available_rooms", filters.available_rooms);
    if (filters.price_range?.min != null) query = query.gte("rent", filters.price_range.min);
    if (filters.price_range?.max != null) query = query.lte("rent", filters.price_range.max);

    const ascending = sort.order === "asc";
    if (sort.by === "price") query = query.order("rent", { ascending });
    else query = query.order("created_at", { ascending: false });

    const { data, error, count } = await query;
    if (error) throw error;

    const want = filters.amenities ?? [];
    const rows = (data ?? []).filter((p: any) =>
      want.every((a: string) => (p.property_amenities ?? []).some((x: any) => x.amenity_catalog?.key === a)),
    );

    const list = rows.map((p: any) => {
      const photos = [...(p.property_photos ?? [])].sort((a: any, b: any) => Number(a.sort_order) - Number(b.sort_order));
      const cover = p.cover_image ?? photos[0]?.media?.url ?? null;
      const price = p.monthly_rent ?? p.rent;
      const verified = Boolean(p.owner_profiles?.is_verified ?? p.owner_profiles?.kyc_verified);
      return {
        property_id: p.property_id,
        title: p.title,
        city: p.city,
        cover_image: cover,
        price,
        listing_type: p.listing_type,
        promotion_type: p.promotion_type,
        property_type: p.property_type,
        room_type: p.room_type,
        owner: {
          owner_id: p.owner_profiles?.owner_id,
          name: p.owner_profiles?.users?.full_name,
          is_verified: verified,
        },
      };
    });

    res.json({ success: true, total: count ?? list.length, page, limit, data: list });
  } catch (error) {
    sendError(res, error);
  }
}

/**
 * GET /api/properties/:propertyId
 */
export async function getPropertyDetail(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.params.propertyId === "search") return next();
    const propertyId = Number(req.params.propertyId);
    if (!Number.isFinite(propertyId)) throw new HttpError(400, "Invalid property_id");

    const { data: property, error } = await supabase
      .from("properties")
      .select(
        `
        *,
        owner_profiles ( owner_id, business_name, kyc_status, is_verified, kyc_verified, rating, total_properties, bio, users ( user_id, full_name, email, phone, profile_photo ) ),
        property_photos ( sort_order, caption, media ( url ) ),
        property_amenities ( amenity_catalog ( key, label ) )
      `,
      )
      .eq("property_id", propertyId)
      .maybeSingle();

    if (error) throw error;
    if (!property) throw new HttpError(404, "Property not found");

    const photos = [...((property as any).property_photos ?? [])].sort((a: any, b: any) => Number(a.sort_order) - Number(b.sort_order));
    const gallery = photos.map((r: any) => r.media?.url).filter(Boolean);
    const amenities = ((property as any).property_amenities ?? []).map((r: any) => r.amenity_catalog?.key).filter(Boolean);
    const op = (property as any).owner_profiles;
    const verified = Boolean(op?.is_verified ?? op?.kyc_verified);

    res.json({
      success: true,
      data: {
        property_id: property.property_id,
        listing_type: (property as any).listing_type,
        promotion_type: (property as any).promotion_type,
        status: (property as any).status,
        property_details: {
          title: property.title,
          description: property.description,
          property_type: property.property_type,
          room_type: (property as any).room_type,
        },
        location: {
          address: property.address,
          city: property.city,
          state: (property as any).state,
          lat: property.latitude,
          lng: property.longitude,
        },
        pricing: {
          monthly_rent: (property as any).monthly_rent ?? property.rent,
          rent: property.rent,
          security_deposit: (property as any).security_deposit,
          maintenance_charges: (property as any).maintenance_charges,
        },
        availability: {
          available_from: (property as any).available_from,
          minimum_stay_months: (property as any).minimum_stay_months,
          is_available: property.is_available,
        },
        specs: {
          total_rooms: (property as any).total_rooms,
          available_rooms: (property as any).available_rooms,
          bathrooms: (property as any).bathrooms,
          balcony: (property as any).balcony,
        },
        features: {
          amenities,
          furnishing: (property as any).furnishing,
        },
        media: {
          cover_image: (property as any).cover_image ?? gallery[0] ?? null,
          images: gallery,
        },
        owner: {
          owner_id: op?.owner_id,
          name: op?.users?.full_name,
          email: op?.users?.email,
          phone: op?.users?.phone,
          business_name: op?.business_name,
          is_verified: verified,
          kyc_status: op?.kyc_status ?? (verified ? "approved" : "pending"),
          avatar: op?.users?.profile_photo ?? null,
          bio: op?.bio ?? null,
          rating: op?.rating ?? null,
          total_properties: op?.total_properties ?? null,
        },
      },
    });
  } catch (error) {
    sendError(res, error);
  }
}
