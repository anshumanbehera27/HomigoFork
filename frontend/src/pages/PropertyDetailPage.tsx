import { useState, useEffect, useCallback } from "react";
import MaterialIcon from "../components/ui/MaterialIcon";
import ProfileGate from "../components/ui/ProfileGate";
import { api } from "../lib/api";
import { queueOpenChatIntent } from "../lib/chatIntent";
import { useHomigoAuth } from "../components/auth/AuthContext";

type PageProps = { onNavigate: (page: string) => void };

type PropertyDetail = {
  property_id: number;
  listing_type: string | null;
  promotion_type: string | null;
  status: string | null;
  property_details: {
    title: string;
    description: string | null;
    property_type: string | null;
    room_type: string | null;
  };
  location: {
    address: string | null;
    city: string | null;
    state: string | null;
    lat: number | null;
    lng: number | null;
  };
  pricing: {
    monthly_rent: number;
    rent: number;
    security_deposit: number;
    maintenance_charges: number;
  };
  availability: {
    available_from: string | null;
    minimum_stay_months: number | null;
    is_available: boolean;
  };
  specs: {
    total_rooms: number | null;
    available_rooms: number | null;
    bathrooms: number | null;
    balcony: boolean | null;
  };
  features: {
    amenities: string[];
    furnishing: string | null;
  };
  media: {
    cover_image: string | null;
    images: string[];
  };
  owner: {
    owner_id: number;
    name: string | null;
    email: string | null;
    phone: string | null;
    business_name: string | null;
    is_verified: boolean;
    kyc_status: string | null;
    avatar: string | null;
    bio: string | null;
    rating: number | null;
    total_properties: number | null;
  };
};

export default function PropertyDetailPage({ onNavigate }: PageProps) {
  const propertyId = sessionStorage.getItem("homigo_selected_property");
  const { userId } = useHomigoAuth();

  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [saved, setSaved] = useState(false);
  const [savedItemId, setSavedItemId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!propertyId) { setLoading(false); return; }
    Promise.all([
      api.getPropertyDetails(propertyId),
      api.getSavedItems(userId).catch(() => ({ data: [] })),
    ])
      .then(([propRes, savedRes]) => {
        setProperty((propRes as any).data as PropertyDetail);
        const numId = Number(propertyId);
        const match = (savedRes as any).data?.find(
          (item: any) => item.item_type === "property" && item.property_id === numId
        );
        if (match) { setSaved(true); setSavedItemId(match.id); }
      })
      .catch(() => setProperty(null))
      .finally(() => setLoading(false));
  }, [propertyId, userId]);

  const handleToggleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (saved && savedItemId != null) {
        await api.removeSavedItem(userId, savedItemId);
        setSaved(false);
        setSavedItemId(null);
      } else {
        const res = await api.addSavedItem(userId, { item_type: "property", property_id: Number(propertyId) });
        setSaved(true);
        setSavedItemId((res as any).data?.id ?? null);
      }
    } catch {
      // silently ignore — UI state unchanged
    } finally {
      setSaving(false);
    }
  }, [saved, savedItemId, saving, userId, propertyId]);

  const openPropertyChat = useCallback(() => {
    const pid = property?.property_id ?? Number(propertyId);
    if (!Number.isFinite(pid)) return;
    // Desired: redirect to Messages and open the owner's chat immediately.
    // Messages.tsx will consume this intent, create/get the conversation, and open it.
    queueOpenChatIntent({ v: 1, kind: "property", propertyId: pid });
    onNavigate("messages");
  }, [property?.property_id, propertyId, onNavigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface">
        <MaterialIcon name="sync" className="animate-spin text-4xl text-primary" />
        <p className="mt-4 text-sm text-on-surface-variant">Loading property…</p>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex min-h-screen flex-col bg-surface">
        <main className="flex flex-1 flex-col items-center justify-center gap-4 pt-20 text-center">
          <MaterialIcon name="apartment" className="text-6xl text-outline" />
          <p className="font-headline text-xl font-bold text-on-surface">Property not found</p>
          <button onClick={() => onNavigate("accommodation")} className="btn-primary">
            Back to listings
          </button>
        </main>
      </div>
    );
  }

  // Resolve image array — prefer gallery, fall back to cover
  const images = property.media.images.length > 0
    ? property.media.images
    : property.media.cover_image
      ? [property.media.cover_image]
      : [];

  const locationText =
    [property.location.address, property.location.city, property.location.state]
      .filter(Boolean)
      .join(", ") || "Location not specified";

  const roomLabel = property.property_details.room_type
    ? property.property_details.room_type.replace(/_/g, " ")
    : "Not specified";

  const rent = property.pricing.monthly_rent ?? property.pricing.rent;

  return (
    <div className="min-h-screen bg-surface pb-32">
      <main className="mx-auto max-w-6xl px-4 pt-24 sm:px-6">

        {/* Back breadcrumb */}
        <button
          onClick={() => onNavigate("accommodation")}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-on-surface-variant hover:text-primary"
        >
          <MaterialIcon name="arrow_back" className="text-sm" /> All Listings
        </button>

        <div className="grid gap-8 lg:grid-cols-12">

          {/* ── Left column ── */}
          <div className="lg:col-span-8">

            {/* Hero image */}
            <div className="relative overflow-hidden rounded-2xl bg-surface-container-low">
              {images.length > 0 ? (
                <img
                  src={images[activeImg]}
                  alt={property.property_details.title}
                  className="h-72 w-full object-cover sm:h-96"
                />
              ) : (
                <div className="flex h-72 w-full items-center justify-center bg-surface-container sm:h-96">
                  <MaterialIcon name="apartment" className="text-7xl text-outline" />
                </div>
              )}

              {/* Badges */}
              <div className="absolute left-4 top-4 flex flex-col gap-2">
                {property.owner.is_verified && (
                  <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-bold text-white shadow">
                    <MaterialIcon name="verified" className="text-[11px]" fill /> Verified
                  </span>
                )}
                {property.property_details.property_type && (
                  <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                    {property.property_details.property_type}
                  </span>
                )}
              </div>

              {/* Save button */}
              <button
                onClick={handleToggleSave}
                disabled={saving}
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow backdrop-blur-sm hover:bg-white disabled:opacity-60"
                aria-label="Save listing"
              >
                <MaterialIcon
                  name="favorite"
                  className={`text-xl transition ${saved ? "text-red-500" : "text-outline"}`}
                  fill={saved}
                />
              </button>

              {/* Dot nav */}
              {images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImg(i)}
                      className={`h-2 rounded-full transition-all ${i === activeImg ? "w-8 bg-white" : "w-2 bg-white/50"}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Thumbnail strip */}
            {images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition ${i === activeImg ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}
                  >
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* Title & price */}
            <div className="mt-6 flex items-start justify-between gap-4">
              <div>
                <h1 className="font-headline text-2xl font-extrabold leading-tight tracking-tight text-on-surface md:text-3xl">
                  {property.property_details.title}
                </h1>
                <p className="mt-1 flex items-center gap-1 text-sm text-on-surface-variant">
                  <MaterialIcon name="location_on" className="text-sm text-primary" />
                  {locationText}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-headline text-2xl font-black text-primary">
                  ₹{rent.toLocaleString("en-IN")}
                </p>
                <p className="text-xs text-outline">/month</p>
              </div>
            </div>

            {/* Stats strip */}
            <div className="mt-5 grid grid-cols-4 divide-x divide-surface-container overflow-hidden rounded-2xl border border-surface-container bg-surface-container-lowest">
              {[
                { icon: "bed", label: property.specs.available_rooms ?? "—", sub: "Rooms" },
                { icon: "bathroom", label: property.specs.bathrooms ?? "—", sub: "Bathroom" },
                { icon: "payments", label: `₹${(property.pricing.security_deposit ?? 0).toLocaleString("en-IN")}`, sub: "Deposit" },
                { icon: "chair", label: property.features.furnishing ?? "—", sub: "Furnishing" },
              ].map(({ icon, label, sub }) => (
                <div key={sub} className="flex flex-col items-center gap-0.5 px-1 py-4">
                  <MaterialIcon name={icon} className="text-xl text-primary" />
                  <span className="truncate font-headline text-base font-black text-on-surface">{String(label)}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-outline">{sub}</span>
                </div>
              ))}
            </div>

            {/* Availability */}
            <div className="mt-5 flex items-center gap-3 rounded-xl bg-secondary/10 px-5 py-3">
              <MaterialIcon name="calendar_month" className="text-secondary" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-secondary">
                  {property.availability.is_available ? "Available from" : "Availability"}
                </p>
                <p className="font-semibold text-on-surface">
                  {property.availability.available_from
                    ? new Date(property.availability.available_from).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
                    : property.availability.is_available
                      ? "Immediately"
                      : "Currently unavailable"}
                </p>
              </div>
            </div>

            {/* Room type */}
            <div className="mt-6">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-outline">Room Type</h2>
              <span className="rounded-full bg-surface-container-high px-5 py-2 text-sm font-semibold capitalize text-on-surface">
                {roomLabel}
              </span>
            </div>

            {/* About */}
            {property.property_details.description && (
              <div className="mt-6">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-outline">About this place</h2>
                <p className="leading-relaxed text-on-surface-variant">{property.property_details.description}</p>
              </div>
            )}

            {/* Amenities */}
            <div className="mt-6">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-outline">
                Amenities &amp; Features
              </h2>
              {property.features.amenities.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {property.features.amenities.map((a) => (
                    <span
                      key={a}
                      className="flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary"
                    >
                      <MaterialIcon name="check_circle" className="text-sm" fill />
                      {a}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">No amenities listed</p>
              )}
            </div>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-5 lg:col-span-4">

            {/* Owner card */}
            <ProfileGate action="contact the owner" onNavigate={onNavigate}>
              <div className="rounded-2xl border border-surface-container bg-surface-container-lowest p-5">
                <p className="mb-4 text-xs font-bold uppercase tracking-widest text-outline">Listed by</p>
                <div className="flex items-center gap-3">
                  {property.owner.avatar ? (
                    <img
                      src={property.owner.avatar}
                      alt={property.owner.name ?? "Owner"}
                      className="h-14 w-14 rounded-full object-cover ring-2 ring-primary/20"
                    />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <MaterialIcon name="person" className="text-3xl text-primary" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-headline font-bold text-on-surface">
                        {property.owner.name ?? "Owner"}
                      </p>
                      {property.owner.is_verified && (
                        <MaterialIcon name="verified" className="text-sm text-primary" fill />
                      )}
                    </div>
                    {property.owner.total_properties != null && (
                      <p className="text-xs text-on-surface-variant">
                        {property.owner.total_properties} propert{property.owner.total_properties === 1 ? "y" : "ies"}
                      </p>
                    )}
                    {property.owner.rating != null && (
                      <div className="mt-0.5 flex items-center gap-1">
                        <MaterialIcon name="star" className="text-[12px] text-amber-500" fill />
                        <span className="text-xs font-semibold">{property.owner.rating}</span>
                      </div>
                    )}
                  </div>
                </div>
                {property.owner.bio && (
                  <p className="mt-3 text-xs leading-relaxed text-on-surface-variant">{property.owner.bio}</p>
                )}
                <div className="mt-4 space-y-2 text-xs text-on-surface-variant">
                  {property.owner.phone && (
                    <p className="flex items-center gap-2">
                      <MaterialIcon name="call" className="text-sm text-primary" />
                      {property.owner.phone}
                    </p>
                  )}
                  {property.owner.email && (
                    <p className="flex items-center gap-2">
                      <MaterialIcon name="mail" className="text-sm text-primary" />
                      {property.owner.email}
                    </p>
                  )}
                </div>
                <button
                  onClick={openPropertyChat}
                  className="btn-primary mt-5 w-full flex items-center justify-center gap-2 text-sm"
                >
                  <MaterialIcon name="chat" className="text-sm" /> Message owner
                </button>
              </div>
            </ProfileGate>

            {/* Add to Interests */}
            <button
              onClick={handleToggleSave}
              disabled={saving}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition disabled:opacity-60 ${
                saved
                  ? "border border-red-200 bg-red-50 text-red-500"
                  : "border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
              }`}
            >
              <MaterialIcon name="favorite" className="text-sm" fill={saved} />
              {saved ? "Saved to my Interests" : "Add to my Interests"}
            </button>

            {/* Quick info card */}
            <div className="rounded-2xl border border-surface-container bg-surface-container-lowest p-5">
              <p className="mb-4 text-xs font-bold uppercase tracking-widest text-outline">Quick Info</p>
              <ul className="space-y-3 text-sm">
                {[
                  ["apartment", "Type", property.property_details.property_type ?? "—"],
                  ["meeting_room", "Room", roomLabel],
                  ["location_city", "City", property.location.city ?? "—"],
                  ["home", "Listing", property.listing_type ?? "—"],
                ].map(([icon, label, value]) => (
                  <li key={label} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-on-surface-variant">
                      <MaterialIcon name={icon} className="text-sm text-primary" />
                      {label}
                    </span>
                    <span className="font-semibold capitalize text-on-surface">{value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Sticky bottom CTA */}
      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-surface-container bg-white/90 px-4 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="font-headline text-lg font-black text-primary">
              ₹{rent.toLocaleString("en-IN")}
              <span className="text-xs font-normal text-outline">/mo</span>
            </p>
            <p className="text-xs text-on-surface-variant">{locationText}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleToggleSave}
              disabled={saving}
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition disabled:opacity-60 ${saved ? "bg-red-50 text-red-500" : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"}`}
            >
              <MaterialIcon name="favorite" className="text-sm" fill={saved} />
              {saved ? "Saved" : "Save"}
            </button>
            <ProfileGate action="send an inquiry" onNavigate={onNavigate}>
              <button
                onClick={openPropertyChat}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <MaterialIcon name="send" className="text-sm" /> Send Inquiry
              </button>
            </ProfileGate>
          </div>
        </div>
      </div>
    </div>
  );
}
