import { useEffect, useMemo, useState } from "react";
import BottomNavBar from "../components/layout/BottomNavBar";
import MaterialIcon from "../components/ui/MaterialIcon";
import { useHomigoAuth } from "../components/auth/AuthContext";
import { api } from "../lib/api";
import type { RoommateProfile } from "../lib/types";

type PageProps = { onNavigate: (page: string) => void };

type Filters = {
  gender: "all" | "male" | "female";
  schedule: "all" | "early_bird" | "night_owl" | "flexible";
  maxBudget: number;
  city: string;
  smoking: "all" | "no";
  pets: "all" | "yes";
};

const DEFAULT_FILTERS: Filters = {
  gender: "all",
  schedule: "all",
  maxBudget: 30000,
  city: "all",
  smoking: "all",
  pets: "all",
};

const CITIES = ["all", "Bangalore", "Mumbai", "Hyderabad", "Delhi", "Pune", "Chennai", "Kolkata", "Ahmedabad", "Noida"];

function ProfileCard({ profile, onClick }: { profile: RoommateProfile; onClick: () => void }) {
  return (
    <article
      onClick={onClick}
      className="group relative cursor-pointer overflow-hidden rounded-2xl bg-surface-container-lowest shadow-ambient transition-all hover:-translate-y-1 hover:shadow-lg active:scale-95"
    >
      <div className="relative h-52 overflow-hidden bg-gradient-to-br from-primary/10 to-secondary/10">
        {profile.avatar ? (
          <img src={profile.avatar} alt={profile.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary/10">
            <MaterialIcon name="person" className="text-6xl text-primary/40" />
          </div>
        )}
        <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-black shadow ${profile.compatibility >= 90 ? "bg-secondary text-white" : "bg-secondary-fixed text-on-secondary-fixed"}`}>
          {profile.compatibility}%
        </span>
        {!profile.lifestyle.smoking && (
          <span className="absolute bottom-3 left-3 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">Non-smoker</span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-headline font-bold text-on-surface group-hover:text-primary">
              {profile.name}, {profile.age}
            </h3>
            <p className="truncate text-xs text-primary">{profile.occupation || "—"}</p>
            <p className="mt-0.5 flex items-center gap-0.5 text-xs text-on-surface-variant">
              <MaterialIcon name="location_on" className="text-[11px]" />{profile.city || "—"}
            </p>
          </div>
          <p className="shrink-0 font-headline text-sm font-black text-on-surface">
            {profile.budget > 0 ? <>₹{(profile.budget / 1000).toFixed(0)}k<span className="text-[10px] font-semibold text-outline">/mo</span></> : "—"}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {profile.preferences.slice(0, 3).map((pref) => (
            <span key={pref} className="rounded-full bg-surface-container-high px-2.5 py-0.5 text-[10px] font-semibold text-on-surface-variant">
              {pref}
            </span>
          ))}
          {profile.preferences.length > 3 && (
            <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 text-[10px] font-semibold text-outline">
              +{profile.preferences.length - 3}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export default function RoommateFinder({ onNavigate }: PageProps) {
  const [profiles, setProfiles] = useState<RoommateProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const { userId } = useHomigoAuth();
  const [myIds, setMyIds] = useState<{ publicId: string | null; numericId: number | null }>({
    publicId: null,
    numericId: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setMyIds({ publicId: null, numericId: null });
      return;
    }

    // `RoommateProfile.id` may be a Clerk id OR numeric Supabase id (as string).
    // Resolve both for the current user so we can always filter ourselves out.
    api
      .getUserDetails(userId)
      .then((res: any) => {
        const d = res?.data ?? res;
        const publicId = d?.user_id != null ? String(d.user_id) : null;
        const numericId = d?.numeric_user_id != null && Number.isFinite(Number(d.numeric_user_id)) ? Number(d.numeric_user_id) : null;
        if (!cancelled) setMyIds({ publicId, numericId });
      })
      .catch(() => {
        // Fallback: at least try filtering by whatever is in auth context
        const numeric = Number(userId);
        setMyIds({ publicId: String(userId), numericId: Number.isFinite(numeric) ? numeric : null });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    api
      .searchUsers({ filters: {}, pagination: { page: 1, limit: 50 }, sort: { by: "compatibility", order: "desc" } })
      .then((res) => setProfiles(res.data ?? []))
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, []);

  const setF = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: val }));

  const filtered = useMemo(() => profiles.filter((p) => {
    // Hide current logged-in user from roommate showcase (supports Clerk id + numeric id)
    const pidStr = String(p.id);
    if (myIds.publicId && pidStr === myIds.publicId) return false;
    if (String(userId) && pidStr === String(userId)) return false;

    const pidNum = Number(p.id);
    if (Number.isFinite(pidNum) && myIds.numericId != null && pidNum === myIds.numericId) return false;

    if (filters.gender !== "all" && p.gender !== filters.gender) return false;
    if (filters.schedule !== "all" && p.lifestyle.schedule !== filters.schedule) return false;
    if (filters.maxBudget < 30000 && p.budget > filters.maxBudget) return false;
    if (filters.city !== "all" && !p.city.toLowerCase().includes(filters.city.toLowerCase()) && !p.lookingIn.some((loc) => loc.toLowerCase().includes(filters.city.toLowerCase()))) return false;
    if (filters.smoking === "no" && p.lifestyle.smoking) return false;
    if (filters.pets === "yes" && !p.lifestyle.pets) return false;
    return true;
  }), [profiles, filters, userId, myIds.numericId, myIds.publicId]);

  const openRoommate = (profile: RoommateProfile) => {
    sessionStorage.setItem("homigo_selected_roommate", profile.id);
    sessionStorage.setItem("homigo_selected_roommate_data", JSON.stringify(profile));
    onNavigate("roommate");
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6">
        {/* Page header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Roommate Finder</p>
            <h1 className="font-headline text-3xl font-extrabold tracking-tight md:text-4xl">
              Find your ideal flatmate
            </h1>
            <p className="mt-1 text-on-surface-variant">
              {loading ? "Loading profiles…" : `${filtered.length} profile${filtered.length !== 1 ? "s" : ""} found`}
            </p>
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="btn-tonal flex w-fit items-center gap-2 self-start sm:self-auto"
          >
            <MaterialIcon name="tune" className="text-sm" />
            {showFilters ? "Hide Filters" : "Filters"}
            {Object.entries(filters).some(([k, v]) => v !== DEFAULT_FILTERS[k as keyof Filters]) && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white">!</span>
            )}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mb-6 rounded-2xl border border-surface-container bg-surface-container-lowest p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
              <label className="col-span-2 space-y-1 sm:col-span-1">
                <span className="text-xs font-bold uppercase tracking-wider text-outline">City</span>
                <select value={filters.city} onChange={(e) => setF("city", e.target.value)} className="text-sm">
                  {CITIES.map((c) => <option key={c} value={c}>{c === "all" ? "All cities" : c}</option>)}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-outline">Gender</span>
                <select value={filters.gender} onChange={(e) => setF("gender", e.target.value as Filters["gender"])} className="text-sm">
                  <option value="all">Any</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-outline">Schedule</span>
                <select value={filters.schedule} onChange={(e) => setF("schedule", e.target.value as Filters["schedule"])} className="text-sm">
                  <option value="all">Any</option>
                  <option value="early_bird">Early Bird</option>
                  <option value="night_owl">Night Owl</option>
                  <option value="flexible">Flexible</option>
                </select>
              </label>

              <label className="col-span-2 space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-outline">
                  Max Budget: <span className="text-primary">₹{filters.maxBudget.toLocaleString("en-IN")}</span>
                </span>
                <input
                  type="range" min={8000} max={30000} step={1000}
                  value={filters.maxBudget}
                  onChange={(e) => setF("maxBudget", Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-container-highest accent-primary"
                />
                <div className="flex justify-between text-[10px] text-outline">
                  <span>₹8k</span><span>₹30k</span>
                </div>
              </label>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setF("smoking", filters.smoking === "all" ? "no" : "all")}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${filters.smoking === "no" ? "bg-primary text-white" : "bg-surface-container text-on-surface-variant"}`}
                >
                  <MaterialIcon name="smoke_free" className="text-sm" /> Non-smokers
                </button>
                <button
                  onClick={() => setF("pets", filters.pets === "all" ? "yes" : "all")}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${filters.pets === "yes" ? "bg-primary text-white" : "bg-surface-container text-on-surface-variant"}`}
                >
                  <MaterialIcon name="pets" className="text-sm" /> Pet Friendly
                </button>
              </div>
            </div>

            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="mt-4 text-xs font-semibold text-on-surface-variant underline-offset-2 hover:text-primary hover:underline"
            >
              Reset all filters
            </button>
          </div>
        )}

        {/* City quick-filter pills */}
        <div className="mb-6 flex flex-wrap gap-2">
          {CITIES.map((city) => (
            <button
              key={city}
              onClick={() => setF("city", city)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${filters.city === city ? "bg-primary text-white" : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"}`}
            >
              {city === "all" ? "All Cities" : city}
            </button>
          ))}
        </div>

        {/* Grid / loading / empty states */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-on-surface-variant">
            <MaterialIcon name="sync" className="animate-spin text-5xl text-primary" />
            <p className="mt-4 text-sm font-semibold">Loading roommate profiles…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-on-surface-variant">
            <MaterialIcon name="person_search" className="text-5xl text-outline" />
            <p className="mt-4 font-headline text-xl font-bold">No profiles match your filters</p>
            <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn-primary mt-5">Clear filters</button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((profile) => (
              <ProfileCard key={profile.id} profile={profile} onClick={() => openRoommate(profile)} />
            ))}
          </div>
        )}
      </main>

      <BottomNavBar onNavigate={onNavigate} />
    </div>
  );
}
