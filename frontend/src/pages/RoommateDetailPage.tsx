import { useCallback, useEffect, useState } from "react";
import MaterialIcon from "../components/ui/MaterialIcon";
import ProfileGate from "../components/ui/ProfileGate";
import { api } from "../lib/api";
import { queueOpenChatIntent } from "../lib/chatIntent";
import type { RoommateProfile } from "../lib/types";

type PageProps = { onNavigate: (page: string) => void };

const SCHEDULE_LABEL: Record<string, string> = {
  early_bird: "Early Bird",
  night_owl: "Night Owl",
  flexible: "Flexible",
};
const SCHEDULE_ICON: Record<string, string> = {
  early_bird: "wb_sunny",
  night_owl: "nightlight",
  flexible: "schedule",
};
const CLEAN_LABEL: Record<string, string> = {
  high: "Very tidy",
  medium: "Balanced",
  relaxed: "Relaxed",
};

/** Map the fullUserProfile API response shape → RoommateProfile */
function mapApiProfile(d: any): RoommateProfile {
  const sp = d.seeker_profile ?? {};
  const lp = sp.lifestyle_preferences ?? {};
  const rp = sp.roommate_preferences ?? {};
  const locs: string[] = (sp.preferred_locations ?? []).map((l: any) => l.location_name).filter(Boolean);

  const smokingRaw = String(lp.smoking ?? "").toLowerCase();
  const drinkingRaw = String(lp.drinking ?? "").toLowerCase();
  const smoking = smokingRaw === "yes" || smokingRaw === "occasionally";
  const drinking = drinkingRaw === "yes" || drinkingRaw === "occasionally";
  const schedule = (["early_bird", "night_owl", "flexible"].includes(lp.sleep_schedule) ? lp.sleep_schedule : "flexible") as "early_bird" | "night_owl" | "flexible";
  const cleanNum = Number(lp.cleanliness ?? 3);
  const cleanliness: "high" | "medium" | "relaxed" = cleanNum >= 4 ? "high" : cleanNum >= 2 ? "medium" : "relaxed";

  const preferences: string[] = [];
  if (!smoking) preferences.push("Non-smoker");
  if (!drinking) preferences.push("Non-drinker");
  if (rp.pet_friendly) preferences.push("Pet-friendly");
  if (rp.preferred_gender && rp.preferred_gender !== "any") preferences.push(`Prefers ${rp.preferred_gender}`);

  const budget = d.current_room_details?.rent ?? 0;
  const interestedPropertyRaw = d.interestedProperty ?? null;
  const interestedProperty =
    interestedPropertyRaw && typeof interestedPropertyRaw === "object"
      ? {
          property_id: Number(interestedPropertyRaw.property_id),
          title: interestedPropertyRaw.title ?? null,
          city: interestedPropertyRaw.city ?? null,
          rent:
            interestedPropertyRaw.rent != null
              ? Number(interestedPropertyRaw.rent)
              : interestedPropertyRaw.monthly_rent != null
                ? Number(interestedPropertyRaw.monthly_rent)
                : null,
          cover_image: interestedPropertyRaw.cover_image ?? null,
        }
      : undefined;

  const interestedProperties: RoommateProfile["interestedProperties"] =
    Array.isArray(d.interestedProperties) && d.interestedProperties.length > 0
      ? d.interestedProperties.map((p: any) => ({
          property_id: Number(p.property_id),
          title: p.title ?? null,
          city: p.city ?? null,
          rent: p.rent != null ? Number(p.rent) : p.monthly_rent != null ? Number(p.monthly_rent) : null,
          cover_image: p.cover_image ?? null,
        }))
      : interestedProperty
        ? [interestedProperty]
        : [];

  return {
    id: String(d.user_id),
    name: d.basic_info?.full_name ?? "Unknown",
    age: sp.age ?? 25,
    gender: sp.gender === "male" ? "male" : "female",
    city: d.current_room_details?.location ?? locs[0] ?? "",
    occupation: sp.occupation ?? "",
    company: "",
    bio: sp.bio ?? "",
    compatibility: Math.min(98, 70 + cleanNum * 4),
    budget,
    lifestyle: { smoking, drinking, pets: rp.pet_friendly ?? false, schedule, cleanliness },
    preferences,
    preferredGender: (["male", "female", "any"].includes(rp.preferred_gender) ? rp.preferred_gender : "any") as "male" | "female" | "any",
    languages: [],
    avatar: d.basic_info?.profile_photo ?? "",
    lookingIn: locs,
    propertyId: d.propertyId != null ? String(d.propertyId) : interestedProperty ? String(interestedProperty.property_id) : undefined,
    interestedProperty,
    interestedProperties,
  };
}

export default function RoommateDetailPage({ onNavigate }: PageProps) {
  const [profile, setProfile] = useState<RoommateProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Resolve the userId — prefer the raw ID key, fall back to parsing the stored profile
    let userId = sessionStorage.getItem("homigo_selected_roommate");
    if (!userId) {
      try {
        const raw = sessionStorage.getItem("homigo_selected_roommate_data");
        if (raw) userId = (JSON.parse(raw) as RoommateProfile).id;
      } catch { /* ignore */ }
    }

    if (!userId) { setLoading(false); return; }

    // Show cached profile immediately so the page isn't blank while we fetch
    try {
      const raw = sessionStorage.getItem("homigo_selected_roommate_data");
      if (raw) setProfile(JSON.parse(raw) as RoommateProfile);
    } catch { /* ignore */ }

    // Always fetch full profile from API to get up-to-date interestedProperties[]
    api
      .getUserDetails(userId)
      .then((res) => {
        const data = (res as any).data ?? res;
        setProfile(mapApiProfile(data));
      })
      .catch(() => { /* keep cached profile if fetch fails */ })
      .finally(() => setLoading(false));
  }, []);

  const openRoommateChat = useCallback(() => {
    if (!profile) return;
    queueOpenChatIntent({ v: 1, kind: "user", targetUserId: profile.id });
    onNavigate("messages");
  }, [profile, onNavigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-surface">
        <main className="flex flex-1 flex-col items-center justify-center gap-4 pt-20 text-center">
          <MaterialIcon name="sync" className="animate-spin text-5xl text-primary" />
          <p className="text-sm font-semibold text-on-surface-variant">Loading profile…</p>
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col bg-surface">
        <main className="flex flex-1 flex-col items-center justify-center gap-4 pt-20 text-center">
          <MaterialIcon name="person_search" className="text-6xl text-outline" />
          <p className="font-headline text-xl font-bold text-on-surface">Profile not found</p>
          <button onClick={() => onNavigate("roommates")} className="btn-primary">
            Back to roommates
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-32">
      <main className="mx-auto max-w-5xl px-4 pt-24 sm:px-6">

        {/* Back breadcrumb */}
        <button
          onClick={() => onNavigate("roommates")}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-on-surface-variant hover:text-primary"
        >
          <MaterialIcon name="arrow_back" className="text-sm" /> All Roommates
        </button>

        <div className="grid gap-8 lg:grid-cols-12">

          {/* ── Left column ── */}
          <div className="space-y-6 lg:col-span-8">

            {/* Hero card */}
            <div className="overflow-hidden rounded-2xl bg-surface-container-lowest shadow-ambient">
              <div className="relative h-36 bg-gradient-to-br from-primary/30 via-secondary/20 to-primary/10">
                <button
                  onClick={() => setSaved((v) => !v)}
                  className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow backdrop-blur-sm hover:bg-white"
                  aria-label="Save profile"
                >
                  <MaterialIcon
                    name="favorite"
                    className={`text-xl transition ${saved ? "text-red-500" : "text-outline"}`}
                    fill={saved}
                  />
                </button>
                <span
                  className={`absolute bottom-4 right-4 rounded-full px-3 py-1 text-xs font-black shadow ${
                    profile.compatibility >= 90 ? "bg-secondary text-white" : "bg-secondary-fixed text-on-secondary-fixed"
                  }`}
                >
                  {profile.compatibility}% match
                </span>
              </div>

              {/* Avatar + identity */}
              <div className="px-6 pb-6">
                <div className="-mt-12 h-24 w-24 overflow-hidden rounded-2xl border-4 border-white shadow-lg bg-primary/10">
                  {profile.avatar ? (
                    <img src={profile.avatar} alt={profile.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <MaterialIcon name="person" className="text-4xl text-primary/40" />
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface">
                      {profile.name}, {profile.age}
                    </h1>
                    <p className="mt-0.5 font-semibold text-primary">
                      {profile.occupation || "—"}{profile.company ? ` · ${profile.company}` : ""}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-on-surface-variant">
                      <MaterialIcon name="location_on" className="text-sm" />
                      {profile.city || "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!profile.lifestyle.smoking && (
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Non-smoker</span>
                    )}
                    <span className="rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold capitalize text-on-surface-variant">
                      {profile.gender}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Budget & gender preference */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-primary/10 p-5 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">Monthly Budget</p>
                <p className="mt-1 font-headline text-2xl font-black text-primary">
                  {profile.budget > 0 ? `₹${profile.budget.toLocaleString("en-IN")}` : "—"}
                </p>
                <p className="text-xs text-on-surface-variant">per month</p>
              </div>
              <div className="rounded-2xl bg-secondary/10 p-5 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-secondary">Looking for</p>
                <p className="mt-1 font-headline text-2xl font-black capitalize text-secondary">
                  {profile.preferredGender === "any" ? "Anyone" : profile.preferredGender}
                </p>
                <p className="text-xs text-on-surface-variant">flatmate</p>
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <div className="rounded-2xl bg-surface-container-lowest p-6">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-outline">About</h2>
                <p className="leading-relaxed text-on-surface-variant">{profile.bio}</p>
              </div>
            )}

            {/* Lifestyle */}
            <div className="rounded-2xl bg-surface-container-lowest p-6">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-outline">Lifestyle</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">

                <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <MaterialIcon name={SCHEDULE_ICON[profile.lifestyle.schedule] ?? "schedule"} className="text-sm text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-outline">Schedule</p>
                    <p className="text-sm font-semibold text-on-surface">{SCHEDULE_LABEL[profile.lifestyle.schedule] ?? "Flexible"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <MaterialIcon name="cleaning_services" className="text-sm text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-outline">Cleanliness</p>
                    <p className="text-sm font-semibold text-on-surface">{CLEAN_LABEL[profile.lifestyle.cleanliness] ?? "Balanced"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${profile.lifestyle.smoking ? "bg-error/10" : "bg-green-100"}`}>
                    <MaterialIcon name={profile.lifestyle.smoking ? "smoking_rooms" : "smoke_free"} className={`text-sm ${profile.lifestyle.smoking ? "text-error" : "text-green-700"}`} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-outline">Smoking</p>
                    <p className="text-sm font-semibold text-on-surface">{profile.lifestyle.smoking ? "Smoker" : "Non-smoker"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <MaterialIcon name="sports_bar" className="text-sm text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-outline">Drinking</p>
                    <p className="text-sm font-semibold text-on-surface">{profile.lifestyle.drinking ? "Social drinker" : "Non-drinker"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <MaterialIcon name="pets" className="text-sm text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-outline">Pets</p>
                    <p className="text-sm font-semibold text-on-surface">{profile.lifestyle.pets ? "Pet friendly" : "No pets"}</p>
                  </div>
                </div>

              </div>
            </div>

            {/* Preferences */}
            {profile.preferences.length > 0 && (
              <div className="rounded-2xl bg-surface-container-lowest p-6">
                <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-outline">Flatmate Preferences</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.preferences.map((pref) => (
                    <span key={pref} className="rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
                      {pref}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Looking in */}
            {profile.lookingIn.length > 0 && (
              <div className="rounded-2xl bg-surface-container-lowest p-6">
                <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-outline">Looking In</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.lookingIn.map((loc) => (
                    <span key={loc} className="flex items-center gap-1.5 rounded-full bg-surface-container-high px-4 py-1.5 text-sm font-semibold text-on-surface">
                      <MaterialIcon name="location_on" className="text-xs text-primary" />
                      {loc}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Languages */}
            {profile.languages.length > 0 && (
              <div className="rounded-2xl bg-surface-container-lowest p-6">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-outline">Languages</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.languages.map((lang) => (
                    <span key={lang} className="rounded-full bg-surface-container-high px-4 py-1.5 text-sm font-semibold text-on-surface">
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Interested Properties (full-width showcase) ── */}
            {(profile.interestedProperties ?? []).length > 0 && (
              <div className="rounded-2xl bg-surface-container-lowest p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-widest text-outline">Interested Properties</h2>
                    <p className="mt-0.5 text-sm text-on-surface-variant">
                      Properties {profile.name.split(" ")[0]} is looking at
                    </p>
                  </div>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">
                    {profile.interestedProperties!.length}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {profile.interestedProperties!.map((prop) => (
                    <button
                      key={prop.property_id}
                      onClick={() => {
                        sessionStorage.setItem("homigo_selected_property", String(prop.property_id));
                        onNavigate("property");
                      }}
                      className="group overflow-hidden rounded-2xl border border-surface-container bg-surface-container-low text-left shadow-sm transition hover:border-primary hover:shadow-md active:scale-[0.98]"
                    >
                      {/* Image */}
                      <div className="relative h-44 w-full overflow-hidden bg-primary/10">
                        {prop.cover_image ? (
                          <img
                            src={prop.cover_image}
                            alt={prop.title ?? "Property"}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                            <MaterialIcon name="apartment" className="text-5xl text-primary/25" />
                            <span className="text-xs text-outline">No image</span>
                          </div>
                        )}
                        {/* Rent overlay */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8">
                          <p className="font-headline text-base font-black text-white">
                            {prop.rent != null ? (
                              <>₹{Number(prop.rent).toLocaleString("en-IN")}<span className="text-xs font-normal opacity-80">/mo</span></>
                            ) : (
                              <span className="text-sm font-normal opacity-70">Rent TBD</span>
                            )}
                          </p>
                        </div>
                        {/* View arrow */}
                        <div className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                          <MaterialIcon name="arrow_forward" className="text-sm text-white" />
                        </div>
                      </div>

                      {/* Details */}
                      <div className="p-4">
                        <p className="line-clamp-1 font-headline text-base font-bold text-on-surface group-hover:text-primary">
                          {prop.title ?? "Untitled Property"}
                        </p>
                        {prop.city && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-on-surface-variant">
                            <MaterialIcon name="location_on" className="text-[11px] text-primary" />
                            {prop.city}
                          </p>
                        )}
                        <div className="mt-3 flex items-center justify-between">
                          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                            View details
                          </span>
                          <MaterialIcon name="apartment" className="text-base text-outline" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* ── Right column ── */}
          <div className="space-y-5 lg:col-span-4">

            {/* Quick stats */}
            <div className="rounded-2xl border border-surface-container bg-surface-container-lowest p-5">
              <p className="mb-4 text-xs font-bold uppercase tracking-widest text-outline">At a Glance</p>
              <ul className="space-y-3 text-sm">
                {([
                  ["person", "Age", `${profile.age} years`],
                  ["wc", "Gender", profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1)],
                  ["location_city", "City", profile.city || "—"],
                  ...(profile.company ? [["work", "Works at", profile.company]] : []),
                  ["payments", "Budget", profile.budget > 0 ? `₹${profile.budget.toLocaleString("en-IN")}/mo` : "—"],
                ] as [string, string, string][]).map(([icon, label, value]) => (
                  <li key={label} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-on-surface-variant">
                      <MaterialIcon name={icon} className="text-sm text-primary" />
                      {label}
                    </span>
                    <span className="text-right font-semibold text-on-surface">{value}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact CTA */}
            <ProfileGate action="message this roommate" onNavigate={onNavigate}>
              <div className="rounded-2xl border border-surface-container bg-surface-container-lowest p-5">
                <p className="mb-1 font-headline font-bold text-on-surface">Interested?</p>
                <p className="mb-4 text-xs text-on-surface-variant">
                  Send a message to connect with {profile.name.split(" ")[0]}.
                </p>
                <button
                  onClick={openRoommateChat}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <MaterialIcon name="chat" className="text-sm" /> Send Message
                </button>
              </div>
            </ProfileGate>

          </div>
        </div>
      </main>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-surface-container bg-white/90 px-4 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-primary/10">
              {profile.avatar ? (
                <img src={profile.avatar} alt={profile.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <MaterialIcon name="person" className="text-lg text-primary/40" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-headline font-bold text-on-surface">{profile.name}</p>
              <p className="text-xs text-on-surface-variant">
                {profile.budget > 0 ? `₹${profile.budget.toLocaleString("en-IN")}/mo` : "—"}
                {profile.city ? ` · ${profile.city}` : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-3">
            <button
              onClick={() => setSaved((v) => !v)}
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition ${saved ? "bg-red-50 text-red-500" : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"}`}
            >
              <MaterialIcon name="favorite" className="text-sm" fill={saved} />
              {saved ? "Saved" : "Save"}
            </button>
            <ProfileGate action="message this roommate" onNavigate={onNavigate}>
              <button
                onClick={openRoommateChat}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <MaterialIcon name="chat" className="text-sm" /> Message
              </button>
            </ProfileGate>
          </div>
        </div>
      </div>
    </div>
  );
}
