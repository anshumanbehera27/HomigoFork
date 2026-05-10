import MaterialIcon from "../components/ui/MaterialIcon";
import { useHomigoAuth } from "../components/auth/AuthContext";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

type PageProps = { onNavigate: (page: string) => void };

type BackendFullUserProfile = {
  user_id: string;
  numeric_user_id: number;
  basic_info: {
    full_name: string | null;
    email: string;
    phone: string | null;
    role: string | null;
    profile_photo: string | null;
    is_verified: boolean | null;
  };
  seeker_profile:
    | null
    | {
        gender: string | null;
        age: number | null;
        occupation: string | null;
        bio: string | null;
        preferred_locations: Array<{ location_name?: string | null }>;
        lifestyle_preferences: {
          smoking?: unknown;
          drinking?: unknown;
          sleep_schedule?: unknown;
          cleanliness?: unknown;
        };
        roommate_preferences: {
          preferred_gender?: string | null;
          age_range?: { min?: number | null; max?: number | null };
          pet_friendly?: boolean | null;
          additional_notes?: string | null;
        };
      };
  owner_profile:
    | null
    | {
        business_name: string | null;
        kyc_status: string | null;
        rating: number | null;
        total_properties: number | null;
        is_verified: boolean | null;
        bio: string | null;
      };
  current_room_details:
    | null
    | {
        location?: string | null;
        rent?: number | null;
      };
  stats?: {
    profile_completion?: number | null;
    total_matches?: number | null;
    active_chats?: number | null;
  };
  timestamps?: {
    created_at?: string | null;
  };
};

// ── Dummy user data ────────────────────────────────────────────────────────────
const DUMMY_USER = {
  name: "Anshuman Behera",
  role: "both" as "seeker" | "owner" | "both",
  avatar:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBrttYiGSnz3mIxd0tdo4A4VTkLx8NWevJbTqcdszWAt2t3SmnISydHo3l1lGLnwQUShZLyyUDlmeISfyM5oLbhom-78GQFwxKgQ49r3ZJWQI8Kns9ZQDXlo-wGzDRUpdHuFpR_RVlUpM1evFPwsCN30Ok8AoEdhNqbe9SiWgrzUXEHXNyRDDej79bYKtdll6v_zNDDFILklynWAb9QtKkS3vHK1zhhAKagt6dHIkISKg9iYGk2AE4bRkcqwEafO1w5A7lR0qabspdk",
  email: "anshuman.behera@gmail.com",
  phone: "+91 98765 43210",
  location: "Bengaluru, Karnataka",
  occupation: "Software Engineer",
  company: "Infosys",
  bio: "Calm, creative, and tidy professional looking for a warm co-living space with people who communicate clearly and respect personal space. Early riser, love weekend hikes and cooking on Sundays.",
  verified: true,
  memberSince: "January 2025",
  stats: {
    matches: 12,
    saved: 8,
    activeChats: 3,
    profileCompletion: 87,
  },
  seeker: {
    age: 24,
    gender: "Male",
    budget: 18000,
    preferredLocations: ["Koramangala", "Indiranagar", "HSR Layout", "Whitefield"],
    lifestyle: {
      smoking:       false,
      drinking:      false,
      sleepSchedule: "Early Bird",
      cleanliness:   "Very Tidy",
      pets:          true,
      cooking:       true,
    },
    preferences: {
      preferredGender: "Any",
      ageRange: { min: 22, max: 32 },
      notes: "Looking for calm, working professionals who respect quiet hours after 10 pm. Clean kitchen is a must.",
    },
    languages: ["English", "Hindi", "Odia"],
  },
  owner: {
    businessName: "Behera Properties",
    kyc: "Verified",
    rating: 4.8,
    totalProperties: 2,
  },
  properties: [
    {
      id: "p1",
      title: "Koramangala 2BHK – Fully Furnished",
      location: "Koramangala 5th Block, Bengaluru",
      city: "Bengaluru",
      rent: 22000,
      propertyType: "apartment",
      roomType: "full",
      areaSqFt: 850,
      bedrooms: 2,
      bathrooms: 2,
      rating: 4.8,
      verified: true,
      status: "active",
      amenities: ["Wi-Fi", "AC", "Gym", "Security", "Parking", "Lift"],
      image: "https://picsum.photos/seed/km1/640/400",
      availableFrom: "2026-05-01",
      views: 142,
      inquiries: 9,
    },
    {
      id: "p2",
      title: "Indiranagar Studio – Modern",
      location: "100 Feet Road, Indiranagar, Bengaluru",
      city: "Bengaluru",
      rent: 15000,
      propertyType: "studio",
      roomType: "full",
      areaSqFt: 420,
      bedrooms: 1,
      bathrooms: 1,
      rating: 4.6,
      verified: true,
      status: "active",
      amenities: ["Wi-Fi", "AC", "Furnished", "CCTV", "Power Backup"],
      image: "https://picsum.photos/seed/in2/640/400",
      availableFrom: "2026-05-10",
      views: 87,
      inquiries: 4,
    },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const LIFESTYLE_ITEMS = (s: typeof DUMMY_USER.seeker.lifestyle) => [
  { icon: s.smoking   ? "smoking_rooms" : "smoke_free",   label: "Smoking",   value: s.smoking   ? "Smoker"       : "Non-smoker",    ok: !s.smoking   },
  { icon: s.drinking  ? "sports_bar"    : "no_drinks",    label: "Drinking",  value: s.drinking  ? "Social drinker": "Non-drinker",   ok: !s.drinking  },
  { icon: "schedule",                                      label: "Schedule",  value: s.sleepSchedule,                                ok: true         },
  { icon: "cleaning_services",                             label: "Cleanliness", value: s.cleanliness,                               ok: true         },
  { icon: s.pets      ? "pets"          : "pets",          label: "Pets",      value: s.pets      ? "Pet-friendly" : "No pets",       ok: s.pets       },
  { icon: "restaurant",                                    label: "Cooking",   value: s.cooking   ? "Home cook"    : "Eats out",      ok: true         },
];

function formatMemberSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function normalizeRole(role: unknown): "seeker" | "owner" | "both" | null {
  const v = String(role ?? "").toLowerCase();
  if (v === "seeker" || v === "owner" || v === "both") return v;
  return null;
}

function formatGender(gender: unknown): string | null {
  const v = String(gender ?? "").toLowerCase();
  if (!v) return null;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function yesNoToBool(value: unknown): boolean | null {
  const v = String(value ?? "").toLowerCase();
  if (!v) return null;
  if (v === "true" || v === "yes" || v === "y" || v === "1" || v === "occasionally") return true;
  if (v === "false" || v === "no" || v === "n" || v === "0") return false;
  return null;
}

function formatSchedule(value: unknown): string | null {
  const v = String(value ?? "").toLowerCase();
  if (!v) return null;
  if (v === "early_bird") return "Early Bird";
  if (v === "night_owl") return "Night Owl";
  if (v === "flexible") return "Flexible";
  return v;
}

function formatCleanliness(value: unknown): string | null {
  const v = String(value ?? "").toLowerCase();
  if (!v) return null;
  if (v === "high" || v === "very_tidy") return "Very Tidy";
  if (v === "medium") return "Moderately tidy";
  if (v === "relaxed" || v === "low") return "Relaxed";
  return v;
}

// ── Property card (owner listings) ────────────────────────────────────────────
function PropertyCard({
  p,
  onNavigate,
}: {
  p: (typeof DUMMY_USER.properties)[number];
  onNavigate: (pg: string) => void;
}) {
  return (
    <article
      onClick={() => onNavigate("accommodation")}
      className="group cursor-pointer overflow-hidden rounded-2xl bg-surface-container-lowest shadow-ambient transition-all hover:-translate-y-1 hover:shadow-lg"
    >
      {/* Image */}
      <div className="relative h-44 overflow-hidden bg-surface-container-low">
        <img
          src={p.image}
          alt={p.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {p.verified && (
            <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
              <MaterialIcon name="verified" className="text-[10px]" fill /> Verified
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${p.status === "active" ? "bg-tertiary text-white" : "bg-outline text-white"}`}>
            {p.status}
          </span>
        </div>
        <div className="absolute right-3 top-3">
          <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold capitalize text-white backdrop-blur-sm">
            {p.propertyType}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6">
          <p className="font-headline text-base font-black text-white">
            ₹{p.rent.toLocaleString("en-IN")}<span className="text-xs font-medium">/mo</span>
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="truncate font-headline font-bold text-on-surface group-hover:text-primary">
          {p.title}
        </h3>
        <p className="mt-0.5 flex items-center gap-0.5 text-xs text-on-surface-variant">
          <MaterialIcon name="location_on" className="text-[11px] text-primary" />
          {p.location}
        </p>

        <div className="mt-3 flex items-center gap-3 text-xs text-on-surface-variant">
          <span className="flex items-center gap-1"><MaterialIcon name="bed" className="text-[13px]" /> {p.bedrooms} Bed</span>
          <span className="flex items-center gap-1"><MaterialIcon name="bathroom" className="text-[13px]" /> {p.bathrooms} Bath</span>
          <span className="flex items-center gap-1"><MaterialIcon name="straighten" className="text-[13px]" /> {p.areaSqFt} ft²</span>
          <span className="ml-auto flex items-center gap-0.5 font-semibold text-amber-500">
            <MaterialIcon name="star" className="text-[12px]" fill /> {p.rating}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.amenities.slice(0, 3).map((a) => (
            <span key={a} className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">
              {a}
            </span>
          ))}
          {p.amenities.length > 3 && (
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-semibold text-outline">
              +{p.amenities.length - 3}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-4 border-t border-surface-container pt-3 text-xs text-on-surface-variant">
          <span className="flex items-center gap-1"><MaterialIcon name="visibility" className="text-[13px] text-primary" /> {p.views} views</span>
          <span className="flex items-center gap-1"><MaterialIcon name="mail" className="text-[13px] text-secondary" /> {p.inquiries} inquiries</span>
          <span className="ml-auto text-outline">
            Available {new Date(p.availableFrom).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        </div>
      </div>
    </article>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function UserProfile({ onNavigate }: PageProps) {
  const { userProfile, userId, authReady } = useHomigoAuth();
  const [backendProfile, setBackendProfile] = useState<BackendFullUserProfile | null>(null);

  useEffect(() => {
    if (!authReady) return;
    if (userId == null || userId === "") {
      setBackendProfile(null);
      return;
    }

    let cancelled = false;
    api
      .getUserDetails(userId)
      .then((res: any) => {
        const payload = (res?.data ?? null) as BackendFullUserProfile | null;
        if (!cancelled) setBackendProfile(payload);
      })
      .catch(() => {
        if (!cancelled) setBackendProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, userId]);

  const merged = useMemo(() => {
    const role = normalizeRole(backendProfile?.basic_info?.role) ?? DUMMY_USER.role;
    const is_verified = backendProfile?.basic_info?.is_verified;
    const verified = typeof is_verified === "boolean" ? is_verified : DUMMY_USER.verified;

    const memberSince =
      formatMemberSince(backendProfile?.timestamps?.created_at) ?? DUMMY_USER.memberSince;

    const preferredLocationsFromApi =
      backendProfile?.seeker_profile?.preferred_locations
        ?.map((l) => String(l?.location_name ?? "").trim())
        .filter(Boolean) ?? [];

    const location =
      backendProfile?.current_room_details?.location ??
      preferredLocationsFromApi[0] ??
      DUMMY_USER.location;

    const budgetFromApi = backendProfile?.current_room_details?.rent;
    const budget = typeof budgetFromApi === "number" && Number.isFinite(budgetFromApi) ? budgetFromApi : DUMMY_USER.seeker.budget;

    const smoking = yesNoToBool(backendProfile?.seeker_profile?.lifestyle_preferences?.smoking);
    const drinking = yesNoToBool(backendProfile?.seeker_profile?.lifestyle_preferences?.drinking);
    const sleepSchedule = formatSchedule(backendProfile?.seeker_profile?.lifestyle_preferences?.sleep_schedule);
    const cleanliness = formatCleanliness(backendProfile?.seeker_profile?.lifestyle_preferences?.cleanliness);

    const seeker = {
      ...DUMMY_USER.seeker,
      age: backendProfile?.seeker_profile?.age ?? DUMMY_USER.seeker.age,
      gender: formatGender(backendProfile?.seeker_profile?.gender) ?? DUMMY_USER.seeker.gender,
      budget,
      preferredLocations: preferredLocationsFromApi.length ? preferredLocationsFromApi : DUMMY_USER.seeker.preferredLocations,
      lifestyle: {
        ...DUMMY_USER.seeker.lifestyle,
        smoking: smoking ?? DUMMY_USER.seeker.lifestyle.smoking,
        drinking: drinking ?? DUMMY_USER.seeker.lifestyle.drinking,
        sleepSchedule: sleepSchedule ?? DUMMY_USER.seeker.lifestyle.sleepSchedule,
        cleanliness: cleanliness ?? DUMMY_USER.seeker.lifestyle.cleanliness,
      },
      preferences: {
        ...DUMMY_USER.seeker.preferences,
        preferredGender:
          (backendProfile?.seeker_profile?.roommate_preferences?.preferred_gender
            ? String(backendProfile.seeker_profile.roommate_preferences.preferred_gender)
            : null) ?? DUMMY_USER.seeker.preferences.preferredGender,
        ageRange: {
          min:
            backendProfile?.seeker_profile?.roommate_preferences?.age_range?.min ??
            DUMMY_USER.seeker.preferences.ageRange.min,
          max:
            backendProfile?.seeker_profile?.roommate_preferences?.age_range?.max ??
            DUMMY_USER.seeker.preferences.ageRange.max,
        },
        notes:
          backendProfile?.seeker_profile?.roommate_preferences?.additional_notes ??
          DUMMY_USER.seeker.preferences.notes,
      },
    };

    const owner = {
      ...DUMMY_USER.owner,
      businessName: backendProfile?.owner_profile?.business_name ?? DUMMY_USER.owner.businessName,
      kyc: backendProfile?.owner_profile?.kyc_status ?? DUMMY_USER.owner.kyc,
      rating: backendProfile?.owner_profile?.rating ?? DUMMY_USER.owner.rating,
      totalProperties: backendProfile?.owner_profile?.total_properties ?? DUMMY_USER.owner.totalProperties,
    };

    const stats = {
      ...DUMMY_USER.stats,
      matches: backendProfile?.stats?.total_matches ?? DUMMY_USER.stats.matches,
      activeChats: backendProfile?.stats?.active_chats ?? DUMMY_USER.stats.activeChats,
      profileCompletion: backendProfile?.stats?.profile_completion ?? DUMMY_USER.stats.profileCompletion,
    };

    const occupation = backendProfile?.seeker_profile?.occupation ?? DUMMY_USER.occupation;
    const bio = backendProfile?.seeker_profile?.bio ?? backendProfile?.owner_profile?.bio ?? DUMMY_USER.bio;

    return {
      role,
      verified,
      memberSince,
      location,
      occupation,
      bio,
      seeker,
      owner,
      stats,
      properties: DUMMY_USER.properties,
      company: DUMMY_USER.company,
    };
  }, [backendProfile]);

  // Auth data takes priority; DUMMY fills every field not yet returned from the backend
  const name = backendProfile?.basic_info?.full_name ?? userProfile?.fullName ?? DUMMY_USER.name;
  const avatar = backendProfile?.basic_info?.profile_photo ?? userProfile?.imageUrl ?? DUMMY_USER.avatar;
  const email = backendProfile?.basic_info?.email ?? userProfile?.email ?? DUMMY_USER.email;
  const phone = backendProfile?.basic_info?.phone ?? userProfile?.phone ?? DUMMY_USER.phone;

  const { location, occupation, company, bio, verified, memberSince, stats, seeker, owner, properties, role } = merged;

  const isOwner  = role === "owner"  || role === "both";
  const isSeeker = role === "seeker" || role === "both";
  const lifestyleItems = LIFESTYLE_ITEMS(seeker.lifestyle);

  const roleLabel =
    role === "both" ? "Seeker & Owner" : role === "owner" ? "Owner" : "Seeker";
  const headlineLine =
    [occupation, company].filter(Boolean).join(" · ") || "Homigo member";

  return (
    <div className="min-h-screen bg-surface-container-low pt-16">

      {/* ── Cover (gradient + dot grid only — no blob overlays) ─────────────── */}
      <div
        className="relative h-40 overflow-hidden bg-gradient-to-r from-primary via-[#0a7d7d] to-secondary md:h-48"
        aria-hidden
      >
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: "radial-gradient(circle at center, white 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-20 md:px-8">
        {/* ── Summary card (overlaps banner — matches reference layout) ───────── */}
        <div className="-mt-14 md:-mt-[4.25rem]">
          <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-ambient ring-1 ring-outline-variant/25 md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="relative shrink-0">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt=""
                      className="h-28 w-28 rounded-2xl bg-surface-container-low object-cover shadow-md ring-4 ring-white md:h-[7.75rem] md:w-[7.75rem]"
                    />
                  ) : (
                    <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-gradient-to-br from-secondary/90 to-primary shadow-md ring-4 ring-white md:h-[7.75rem] md:w-[7.75rem]">
                      <MaterialIcon name="person" className="text-5xl text-white/90" fill />
                    </div>
                  )}
                  {verified && (
                    <span
                      className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-tertiary ring-[3px] ring-white"
                      title="Verified"
                    >
                      <MaterialIcon name="verified" className="text-[15px] text-white" fill />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 pb-0.5">
                  <h1 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface md:text-3xl">
                    {name}
                  </h1>
                  <p className="mt-1 text-sm text-on-surface-variant">{headlineLine}</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
                    <span className="flex items-center gap-1.5 text-xs text-outline">
                      <MaterialIcon name="location_on" className="text-[15px] text-primary" />
                      {location}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-outline">
                      <MaterialIcon name="calendar_today" className="text-[15px] text-on-surface-variant" />
                      Member since {memberSince}
                    </span>
                    <span
                      className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        role === "both"
                          ? "bg-secondary-fixed text-on-secondary-fixed"
                          : role === "owner"
                            ? "bg-primary/10 text-primary"
                            : "bg-tertiary/10 text-tertiary"
                      }`}
                    >
                      {roleLabel}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-3 lg:flex-col lg:items-end xl:flex-row">
                <button
                  type="button"
                  onClick={() => onNavigate("messages")}
                  className="btn-tonal inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold"
                >
                  <MaterialIcon name="chat" className="text-lg" />
                  Message
                </button>
                <button
                  type="button"
                  className="btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold"
                >
                  <MaterialIcon name="edit" className="text-lg" />
                  Edit profile
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Stats row ───────────────────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: "group", label: "Matches", value: stats.matches, color: "text-primary", bg: "bg-primary/10" },
            { icon: "favorite", label: "Saved", value: stats.saved, color: "text-error", bg: "bg-error/10" },
            {
              icon: "chat",
              label: "Active Chats",
              value: stats.activeChats,
              color: "text-secondary",
              bg: "bg-secondary/10",
            },
            {
              icon: "trending_up",
              label: "Profile",
              sublabel: "Profile strength",
              value: `${stats.profileCompletion}%`,
              color: "text-tertiary",
              bg: "bg-tertiary/10",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-2xl bg-surface-container-lowest p-4 shadow-ambient ring-1 ring-outline-variant/20"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${item.bg} ${item.color}`}
              >
                <MaterialIcon name={item.icon} className="text-xl" />
              </span>
              <div className="min-w-0">
                <p className={`font-headline text-xl font-black tabular-nums ${item.color}`}>{item.value}</p>
                <p className="text-xs font-medium text-on-surface-variant">{item.label}</p>
                {"sublabel" in item && item.sublabel ? (
                  <p className="sr-only">{item.sublabel}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* ── Profile completion ───────────────────────────────────────────────── */}
        <div className="mt-4 rounded-2xl bg-surface-container-lowest px-5 py-4 shadow-ambient ring-1 ring-outline-variant/20">
          <div className="flex items-center justify-between text-sm">
            <span className="font-headline font-bold text-on-surface">Profile Completion</span>
            <span className="font-headline font-black text-primary">{stats.profileCompletion}%</span>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-surface-container-high">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary-container transition-all duration-700"
              style={{ width: `${stats.profileCompletion}%` }}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-on-surface-variant">
            Add a bio and preferred locations to reach 100%
          </p>
        </div>

        {/* ── Main content grid ──────────────────────────────────────────────── */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">

          <section className="space-y-6">

            {/* About */}
            <div className="card">
              <h2 className="font-headline text-xl font-bold">About</h2>
              <p className="mt-4 leading-relaxed text-on-surface-variant">{bio}</p>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { icon: "person",      label: "Age",         value: `${seeker.age} years` },
                  { icon: "wc",          label: "Gender",      value: seeker.gender },
                  { icon: "work",        label: "Works at",    value: company || "—" },
                  { icon: "payments",    label: "Budget",      value: `₹${seeker.budget.toLocaleString("en-IN")}/mo` },
                  { icon: "email",       label: "Email",       value: email },
                  { icon: "phone",       label: "Phone",       value: phone },
                ].map(({ icon, label, value }) => (
                  <div key={label} className="flex items-center gap-2.5 rounded-lg bg-surface-container-low p-3">
                    <MaterialIcon name={icon} className="shrink-0 text-lg text-primary" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-outline">{label}</p>
                      <p
                        className={`text-sm font-semibold text-on-surface ${
                          label === "Email" || label === "Phone" ? "break-words" : "truncate"
                        }`}
                      >
                        {value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lifestyle */}
            <div className="card">
              <h2 className="font-headline text-xl font-bold">Lifestyle</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {lifestyleItems.map(({ icon, label, value, ok }) => (
                  <div key={label} className="flex items-center gap-3 rounded-xl bg-surface-container-low p-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ok ? "bg-tertiary/10" : "bg-error/10"}`}>
                      <MaterialIcon name={icon} className={`text-base ${ok ? "text-tertiary" : "text-error"}`} />
                    </span>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-outline">{label}</p>
                      <p className="text-sm font-semibold text-on-surface">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Roommate Preferences */}
            {isSeeker && (
              <div className="card">
                <h2 className="font-headline text-xl font-bold">Roommate Preferences</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-primary/8 p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-primary">Preferred Gender</p>
                    <p className="mt-1 font-headline text-xl font-black text-on-surface">{seeker.preferences.preferredGender}</p>
                  </div>
                  <div className="rounded-xl bg-secondary/8 p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-secondary">Age Range</p>
                    <p className="mt-1 font-headline text-xl font-black text-on-surface">
                      {seeker.preferences.ageRange.min}–{seeker.preferences.ageRange.max} yrs
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-outline">Additional Notes</p>
                  <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{seeker.preferences.notes}</p>
                </div>
              </div>
            )}

            {/* Looking in */}
            {isSeeker && (
              <div className="card">
                <h2 className="mb-4 font-headline text-xl font-bold">Looking In</h2>
                <div className="flex flex-wrap gap-2">
                  {seeker.preferredLocations.map((loc) => (
                    <span key={loc} className="flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
                      <MaterialIcon name="location_on" className="text-xs" />
                      {loc}
                    </span>
                  ))}
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-outline">Languages</p>
                  <div className="flex flex-wrap gap-2">
                    {seeker.languages.map((lang) => (
                      <span key={lang} className="rounded-full bg-surface-container-high px-4 py-1.5 text-sm font-semibold text-on-surface">
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </section>

          {/* ── Sidebar ──────────────────────────────────────────────────────── */}
          <aside className="space-y-5">

            {/* Verification */}
            <div className="card space-y-3">
              <h3 className="font-headline text-base font-bold">Verification</h3>
              {[
                { icon: "verified_user", label: "Identity Verified",  ok: verified },
                { icon: "phone",         label: "Phone Confirmed",     ok: true     },
                { icon: "email",         label: "Email Confirmed",     ok: true     },
                { icon: "badge",         label: "KYC Completed",       ok: isOwner  },
              ].map(({ icon, label, ok }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ok ? "bg-tertiary/10" : "bg-surface-container"}`}>
                    <MaterialIcon name={icon} className={`text-base ${ok ? "text-tertiary" : "text-outline"}`} fill={ok} />
                  </span>
                  <span className={`text-sm font-semibold ${ok ? "text-on-surface" : "text-outline"}`}>{label}</span>
                  {ok
                    ? <MaterialIcon name="check_circle" className="ml-auto text-sm text-tertiary" fill />
                    : <MaterialIcon name="radio_button_unchecked" className="ml-auto text-sm text-outline" />}
                </div>
              ))}
            </div>

            {/* Owner info */}
            {isOwner && (
              <div className="card">
                <h3 className="mb-3 font-headline text-base font-bold">Owner Profile</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant">Business</span>
                    <span className="font-semibold text-on-surface">{owner.businessName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant">KYC Status</span>
                    <span className="rounded-full bg-tertiary/10 px-2 py-0.5 text-xs font-bold text-tertiary">{owner.kyc}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant">Rating</span>
                    <span className="flex items-center gap-1 font-bold text-amber-500">
                      <MaterialIcon name="star" className="text-xs" fill /> {owner.rating}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant">Properties</span>
                    <span className="font-semibold text-on-surface">{owner.totalProperties} listed</span>
                  </div>
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="card">
              <h3 className="mb-3 font-headline text-base font-bold">Quick Actions</h3>
              <div className="space-y-2">
                {([
                  ["Find Roommates", "group",     "roommates"     ],
                  ["Browse Homes",  "apartment",  "accommodation" ],
                  ["Messages",      "chat",       "messages"      ],
                  ["Dashboard",     "dashboard",  "dashboard"     ],
                ] as const).map(([label, icon, page]) => (
                  <button
                    key={label}
                    onClick={() => onNavigate(page)}
                    className="flex w-full items-center gap-3 rounded-lg bg-surface-container-low px-3 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container"
                  >
                    <MaterialIcon name={icon} className="text-primary" />
                    {label}
                    <MaterialIcon name="arrow_forward" className="ml-auto text-sm text-outline" />
                  </button>
                ))}
              </div>
            </div>

          </aside>
        </div>

        {/* ── My Properties ──────────────────────────────────────────────────── */}
        {isOwner && properties.length > 0 && (
          <div className="mb-20 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-headline text-2xl font-extrabold">My Properties</h2>
                <p className="mt-0.5 text-sm text-on-surface-variant">
                  {properties.length} listing{properties.length !== 1 ? "s" : ""} managed by you
                </p>
              </div>
              <button
                onClick={() => onNavigate("accommodation")}
                className="btn-tonal flex items-center gap-2 text-sm"
              >
                <MaterialIcon name="add" className="text-sm" />
                Add property
              </button>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {properties.map((p) => (
                <PropertyCard key={p.id} p={p} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
