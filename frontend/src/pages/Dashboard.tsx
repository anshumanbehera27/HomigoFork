import BottomNavBar from "../components/layout/BottomNavBar";
import MaterialIcon from "../components/ui/MaterialIcon";
import { useEffect, useState } from "react";
import { useHomigoAuth } from "../components/auth/AuthContext";
import { api } from "../lib/api";
import { queueOpenChatIntent } from "../lib/chatIntent";
import type { DashboardData } from "../lib/types";
import type { RoommateProfile } from "../lib/types";
import type { PropertySearchResult } from "../lib/types";

type PageProps = { onNavigate: (page: string) => void };

const avatars = [
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBt6-rU3gXyjpmDiNHE44UgI-8tu1mYS1vGj0Q4Gt8skC0GX00RpglCCQ0H1Q24ekxC7cCfHe9D0GuA6h61RG_d_MWyc7-TCiQ_44C9VDuGKmbsLygg1XSGOFllwmb2cv0ZBSUNpVZmyn1xT7Dq5BWf_MEgUCh4exZK8OsoGtScvzCYZ08R8hexS6UN0unKR9Fa4TBIrZ_5xRuMSSaKmCEKk-Zs1MqDkj4IJ5EtJyytBKoOLao4YOxIENuiYths9Z55AyqOAvQY9ork",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBrPJBF7srrmk03peLPORbgHhvaGs38hHzbbFVse5StT8eWEyekgDzx49MuN6r9aT3pGGKRKvl_pbutlq5EkZxVPSWl0Rh3QqaIhhOr9OLkFj_qdYxYYSVBi-lh0Kr_rSLJr3947bW1Mj95iIaWYrGszmWGFbo62o3tzESnj7hcPU3FCfkYFO5oPVYodzUV8NNzUBs_dhqin9Y_eQnubU9KclTfHlcZAegl76AvkCMnMMe2ivPKJ225J5AD-o9WHKr6SH8Ag6s1YJS7",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuB0OmWKPHyxAyKUoVld3y2DCdvltSYhXefSN7SaGt_cEofQYxY5_8mNpwtw3TL0QWCO4zoM9NKOYqTbpVWOHJ16Lx_MFonIoQ_Hr11SycRpL37Rg2c5g-9gJjtpSIQwVkIp4GFEat7u7lrhzAHSp6ceVtwyDpudXWu1x-0rmeU3WMZM2wS9arz1U5JFTXln8sfijeKHQ3jX64VDBlIewUIm2n9KIvtRZ2536LlqJ7IuEmj0TAVnx6DAYrSQyVzI77d9E6X3k2UvhWNX",
];

const stats = [
  { icon: "group", label: "New Matches", color: "text-primary", bg: "bg-primary/10" },
  { icon: "favorite", label: "Saved", value: 8, color: "text-error", bg: "bg-error/10" },
  { icon: "chat", label: "Messages", value: 3, color: "text-secondary", bg: "bg-secondary/10" },
  { icon: "apartment", label: "Listings Viewed", value: 24, color: "text-tertiary", bg: "bg-tertiary/10" },
] as const;

const MOCK_DASHBOARD = {
  matchCount: 5,
  savedCount: 3,
  messageCount: 3,
  listingViews: 24,
} as const;

const INDIAN_CITIES = [
  "Bangalore",
  "Bengaluru",
  "Mumbai",
  "Hyderabad",
  "Delhi",
  "New Delhi",
  "Gurgaon",
  "Pune",
  "Chennai",
  "Kolkata",
  "Noida",
  "Bhubaneswar",
] as const;

function isIndianCity(city: string | null | undefined) {
  if (!city) return false;
  const normalized = city.split(",")[0]?.trim().toLowerCase() ?? "";
  return INDIAN_CITIES.some((x) => x.toLowerCase() === normalized);
}

function RecentListingCard({ property, onClick }: { property: PropertySearchResult; onClick: () => void }) {
  return (
    <article
      onClick={onClick}
      className="group cursor-pointer overflow-hidden rounded-2xl bg-surface-container-lowest shadow-ambient transition-all hover:-translate-y-1 hover:shadow-lg active:scale-[0.98]"
    >
      <div className="relative h-40 overflow-hidden bg-surface-container-low">
        {property.cover_image ? (
          <img
            src={property.cover_image}
            alt={property.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-container">
            <MaterialIcon name="apartment" className="text-5xl text-outline" />
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {property.owner.is_verified && (
            <span className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
              <MaterialIcon name="verified" className="text-[10px]" fill /> Verified
            </span>
          )}
        </div>

        {property.property_type && (
          <div className="absolute right-3 top-3">
            <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
              {property.property_type}
            </span>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6">
          <p className="font-headline text-base font-black text-white">
            ₹{property.price.toLocaleString("en-IN")}
            <span className="text-xs font-medium">/mo</span>
          </p>
        </div>
      </div>

      <div className="p-4">
        <h4 className="truncate font-headline font-bold text-on-surface group-hover:text-primary">
          {property.title}
        </h4>
        <p className="mt-0.5 flex items-center gap-0.5 text-xs text-on-surface-variant">
          <MaterialIcon name="location_on" className="text-[11px] text-primary" />
          {property.city ?? "Location not specified"}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
          {property.listing_type && (
            <span className="flex items-center gap-1 capitalize">
              <MaterialIcon name="home" className="text-[13px]" /> {property.listing_type}
            </span>
          )}
          {property.room_type && (
            <span className="flex items-center gap-1">
              <MaterialIcon name="bed" className="text-[13px]" />
              {property.room_type.replace(/_/g, " ")}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-surface-container pt-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <MaterialIcon name="person" className="text-[14px] text-primary" />
          </span>
          <span className="truncate text-xs text-on-surface-variant">{property.owner.name ?? "Owner"}</span>
          <MaterialIcon name="arrow_forward" className="ml-auto text-sm text-outline" />
        </div>
      </div>
    </article>
  );
}

export default function Dashboard({ onNavigate }: PageProps) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [recentChats, setRecentChats] = useState<Array<{ conversation_id: number; other_user_id: number; other_user_name: string | null; last_message_content: string | null; updated_at: string }>>([]);
  const [suggestedRoommates, setSuggestedRoommates] = useState<RoommateProfile[]>([]);
  const [recentListings, setRecentListings] = useState<PropertySearchResult[]>([]);
  const [recentListingsLoading, setRecentListingsLoading] = useState(true);
  const { userId, authReady } = useHomigoAuth();

  useEffect(() => {
    if (!authReady) return;
    api.getDashboard(userId)
      .then((r) => setDashboard(r.data))
      .catch(() => setDashboard(null));
  }, [userId, authReady]);

  useEffect(() => {
    if (!authReady) return;
    api
      .listConversations(userId)
      .then((r) => {
        const rows = (r.data ?? []).slice(0, 2).map((c) => ({
          conversation_id: c.conversation_id,
          other_user_id: c.other_user_id,
          other_user_name: c.other_user_name,
          last_message_content: c.last_message_content,
          updated_at: c.last_message_at ?? c.updated_at,
        }));
        setRecentChats(rows);
      })
      .catch(() => setRecentChats([]));
  }, [userId, authReady]);

  useEffect(() => {
    if (!authReady) return;
    api
      .searchUsers({ filters: {}, pagination: { page: 1, limit: 10 }, sort: { by: "compatibility", order: "desc" } })
      .then((res) => {
        const rows = (res.data ?? []).filter((p) => String(p.id) !== String(userId)).slice(0, 3);
        setSuggestedRoommates(rows);
      })
      .catch(() => setSuggestedRoommates([]));
  }, [userId, authReady]);

  useEffect(() => {
    if (!authReady) return;
    setRecentListingsLoading(true);
    api
      .searchProperties({ page: 1, limit: 30 })
      .then((res) => {
        const all = res.data ?? [];
        const indian = all.filter((p) => isIndianCity(p.city));
        const rows = indian.slice(0, 3);
        setRecentListings(rows);
      })
      .catch(() => setRecentListings([]))
      .finally(() => setRecentListingsLoading(false));
  }, [authReady]);

  const openRoommate = (profile: RoommateProfile) => {
    sessionStorage.setItem("homigo_selected_roommate", profile.id);
    sessionStorage.setItem("homigo_selected_roommate_data", JSON.stringify(profile));
    onNavigate("roommate");
  };

  const openProperty = (property: PropertySearchResult) => {
    sessionStorage.setItem("homigo_selected_property", String(property.property_id));
    onNavigate("property");
  };

  const firstName = dashboard?.user?.full_name?.split(" ")[0] ?? "Devansh";
  const isMockMode = dashboard == null;
  const matchCount = MOCK_DASHBOARD.matchCount;
  const savedCount = MOCK_DASHBOARD.savedCount;
  const messageCount = MOCK_DASHBOARD.messageCount;
  const listingViews = MOCK_DASHBOARD.listingViews;

  const statCards = [
    { icon: "group", label: "New Matches", value: matchCount, color: "text-primary", bg: "bg-primary/10" },
    { icon: "favorite", label: "Saved", value: savedCount, color: "text-error", bg: "bg-error/10" },
    { icon: "chat", label: "Messages", value: messageCount, color: "text-secondary", bg: "bg-secondary/10" },
    { icon: "apartment", label: "Listings Viewed", value: listingViews, color: "text-tertiary", bg: "bg-tertiary/10" },
  ] as const;

  return (
    <div className="min-h-screen bg-surface pt-16">

      {/* ── Welcome hero ─────────────────────────────────────────────────────── */}
      <div className="border-b border-surface-container bg-gradient-to-br from-primary/8 via-surface to-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-10 md:px-10">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-primary">Dashboard</p>
            <h1 className="mt-1 font-headline text-4xl font-extrabold tracking-tight md:text-5xl">
              Welcome back,{" "}
              <span className="italic text-primary">{firstName}.</span>
            </h1>
            <p className="mt-2 text-on-surface-variant">
              You have{" "}
              <span className="font-bold text-on-surface">{matchCount} new matches</span>{" "}
              today{isMockMode ? " (sample data)" : ""}.
            </p>
          </div>
          <button
            onClick={() => onNavigate("profile")}
            className="btn-tonal hidden items-center gap-2 md:flex"
          >
            <MaterialIcon name="edit" className="text-sm" />
            Edit profile
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 pb-28 pt-8 md:px-10">

        {/* ── Stats row ──────────────────────────────────────────────────────── */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {statCards.map((item) => (
            <div key={item.label} className="card flex items-center gap-4 p-4">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.bg} ${item.color}`}>
                <MaterialIcon name={item.icon} className="text-xl" />
              </span>
              <div>
                <p className="font-headline text-2xl font-black text-on-surface">
                  {item.value}
                </p>
                <p className="text-xs text-on-surface-variant">{item.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main grid ──────────────────────────────────────────────────────── */}
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">

          <section className="space-y-6">

            {/* Suggested Roommates */}
            <div className="card">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="font-headline text-xl font-bold">Suggested Roommates</h3>
                <button onClick={() => onNavigate("roommates")} className="font-bold text-primary">
                  View all
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {(suggestedRoommates.length ? suggestedRoommates : ([null, null, null] as const)).map((p, i) => {
                  const name = p ? `${p.name}, ${p.age}` : (["Sasha, 26", "Marcus, 28", "Elena, 24"] as const)[i];
                  const subtitle = p
                    ? [p.occupation, p.city].filter(Boolean).join(" · ")
                    : (["Designer · Quiet · Early Bird", "Developer · Social · Weekend Cook", "Chef · Night Owl · Musician"] as const)[i];
                  const avatar = p?.avatar || avatars[i];
                  const match = p?.compatibility ?? ([96, 94, 89] as const)[i];

                  return (
                    <article
                      key={p?.id ?? name}
                      onClick={() => p && openRoommate(p)}
                      className={`rounded-xl bg-surface-container-low p-4 ${p ? "cursor-pointer hover:bg-surface-container" : ""}`}
                    >
                      <img src={avatar} alt={name} className="h-40 w-full rounded-lg object-cover" />
                      <h4 className="mt-4 font-headline font-bold">{name}</h4>
                      <p className="text-sm text-on-surface-variant">{subtitle || "—"}</p>
                      <span className="mt-3 inline-flex rounded-full bg-secondary-fixed px-3 py-1 text-xs font-bold text-on-secondary-fixed">
                        {match}% match
                      </span>
                    </article>
                  );
                })}
              </div>
            </div>

            {/* Recent Listings */}
            <div className="card">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="font-headline text-xl font-bold">Recent Listings</h3>
                <button onClick={() => onNavigate("accommodation")} className="font-bold text-primary">
                  View details
                </button>
              </div>
              {recentListingsLoading ? (
                <div className="flex items-center gap-3 rounded-xl bg-surface-container-low p-4">
                  <MaterialIcon name="sync" className="animate-spin text-primary" />
                  <span className="text-sm font-semibold text-on-surface-variant">Loading listings…</span>
                </div>
              ) : recentListings.length === 0 ? (
                <button
                  type="button"
                  onClick={() => onNavigate("accommodation")}
                  className="flex w-full items-center justify-between rounded-xl bg-surface-container-low p-4 text-left hover:bg-surface-container"
                >
                  <div className="min-w-0">
                    <p className="font-headline text-base font-bold text-on-surface">No recent Indian-city listings yet</p>
                    <p className="mt-1 text-xs text-on-surface-variant">Browse all listings</p>
                  </div>
                  <MaterialIcon name="arrow_forward" className="text-outline" />
                </button>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {recentListings.map((p) => (
                    <RecentListingCard key={p.property_id} property={p} onClick={() => openProperty(p)} />
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-6">

            {/* Compatibility Pulse */}
            <div className="card bg-gradient-to-br from-secondary to-primary text-white">
              <h3 className="font-headline text-xl font-bold">Compatibility Pulse</h3>
              <p className="mt-4 text-sm text-white/90">
                Your profile is 94% optimized for Quiet Creative living clusters.
              </p>
              <div className="mt-6 h-3 rounded-full bg-white/20">
                <div className="h-full w-[94%] rounded-full bg-white" />
              </div>
              <p className="mt-2 text-right text-xs font-bold text-white/80">94%</p>
            </div>

            {/* Messages preview */}
            <div className="card">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-headline text-xl font-bold">
                  <MaterialIcon name="chat" className="text-primary" /> Messages
                </h3>
                <button onClick={() => onNavigate("messages")} className="text-sm font-bold text-primary">
                  View all
                </button>
              </div>
              {recentChats.length === 0 ? (
                <button
                  type="button"
                  onClick={() => onNavigate("messages")}
                  className="flex w-full items-center justify-between rounded-xl bg-surface-container-low p-4 text-left hover:bg-surface-container"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-on-surface">Open inbox</p>
                    <p className="truncate text-xs text-on-surface-variant">Start a chat from a profile or use New message</p>
                  </div>
                  <MaterialIcon name="arrow_forward" className="text-outline" />
                </button>
              ) : (
                recentChats.map((c) => (
                  <button
                    key={c.conversation_id}
                    type="button"
                    onClick={() => {
                      queueOpenChatIntent({ v: 1, kind: "user", targetUserId: c.other_user_id });
                      onNavigate("messages");
                    }}
                    className="mb-3 flex w-full items-center gap-3 rounded-xl bg-surface-container-low p-4 text-left hover:bg-surface-container"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <MaterialIcon name="person" className="text-primary" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-on-surface">{c.other_user_name ?? `User ${c.other_user_id}`}</p>
                      <p className="truncate text-xs text-on-surface-variant">
                        {c.last_message_content ?? "No messages yet"}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Quick actions */}
            <div className="card">
              <h3 className="mb-4 font-headline text-xl font-bold">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["Find Roommates", "group", "roommates"],
                  ["Browse Homes", "apartment", "accommodation"],
                  ["My Profile", "person", "profile"],
                  ["Messages", "chat", "messages"],
                ] as const).map(([label, icon, page]) => (
                  <button
                    key={label}
                    onClick={() => onNavigate(page)}
                    className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-low p-4 text-center hover:bg-surface-container"
                  >
                    <MaterialIcon name={icon} className="text-2xl text-primary" />
                    <span className="text-xs font-bold text-on-surface">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>

      <BottomNavBar onNavigate={onNavigate} />
    </div>
  );
}
