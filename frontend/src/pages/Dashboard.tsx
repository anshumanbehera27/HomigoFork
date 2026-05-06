import BottomNavBar from "../components/layout/BottomNavBar";
import MaterialIcon from "../components/ui/MaterialIcon";
import { useEffect, useState } from "react";
import { useHomigoAuth } from "../components/auth/AuthContext";
import { api } from "../lib/api";
import type { DashboardData } from "../lib/types";

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

export default function Dashboard({ onNavigate }: PageProps) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const { userId, authReady } = useHomigoAuth();

  useEffect(() => {
    if (!authReady) return;
    api.getDashboard(userId)
      .then((r) => setDashboard(r.data))
      .catch(() => setDashboard(null));
  }, [userId, authReady]);

  const firstName = dashboard?.user?.full_name?.split(" ")[0] ?? "Julian";
  const matchCount = dashboard?.matches?.length ?? 12;

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
              today.
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
          {stats.map(({ icon, label, value = 0, color, bg }, i) => (
            <div key={label} className="card flex items-center gap-4 p-4">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bg} ${color}`}>
                <MaterialIcon name={icon} className="text-xl" />
              </span>
              <div>
                <p className="font-headline text-2xl font-black text-on-surface">
                  {i === 0 ? matchCount : value}
                </p>
                <p className="text-xs text-on-surface-variant">{label}</p>
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
                {(["Sasha, 26", "Marcus, 28", "Elena, 24"] as const).map((name, i) => (
                  <article key={name} className="rounded-xl bg-surface-container-low p-4">
                    <img
                      src={avatars[i]}
                      alt={name}
                      className="h-40 w-full rounded-lg object-cover"
                    />
                    <h4 className="mt-4 font-headline font-bold">{name}</h4>
                    <p className="text-sm text-on-surface-variant">
                      {(["Designer · Quiet · Early Bird", "Developer · Social · Weekend Cook", "Chef · Night Owl · Musician"] as const)[i]}
                    </p>
                    <span className="mt-3 inline-flex rounded-full bg-secondary-fixed px-3 py-1 text-xs font-bold text-on-secondary-fixed">
                      {([96, 94, 89] as const)[i]}% match
                    </span>
                  </article>
                ))}
              </div>
            </div>

            {/* Recent Listings */}
            <div className="card">
              <h3 className="mb-5 font-headline text-xl font-bold">Recent Listings</h3>
              <div className="space-y-3">
                {(["Brooklyn Loft – $1,400/mo", "Austin Studio – $950/mo", "Chicago Brownstone – $2,100/mo"] as const).map((listing) => (
                  <button
                    key={listing}
                    onClick={() => onNavigate("accommodation")}
                    className="flex w-full items-center justify-between rounded-lg bg-surface-container-low p-4 text-left hover:bg-surface-container"
                  >
                    <div className="flex items-center gap-3">
                      <MaterialIcon name="apartment" className="text-primary" />
                      <span className="font-medium">{listing}</span>
                    </div>
                    <MaterialIcon name="arrow_forward" className="text-outline" />
                  </button>
                ))}
              </div>
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
              {(["Sarah Jenkins", "Marcus Chen"] as const).map((name) => (
                <button
                  key={name}
                  onClick={() => onNavigate("messages")}
                  className="mb-3 flex w-full items-center gap-3 rounded-xl bg-surface-container-low p-4 text-left hover:bg-surface-container"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <MaterialIcon name="person" className="text-primary" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-on-surface">{name}</p>
                    <p className="truncate text-xs text-on-surface-variant">
                      I will send over the lease details soon.
                    </p>
                  </div>
                </button>
              ))}
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
