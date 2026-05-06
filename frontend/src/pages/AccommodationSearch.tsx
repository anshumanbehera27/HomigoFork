import { useState, useEffect, useRef } from "react";
import BottomNavBar from "../components/layout/BottomNavBar";
import MaterialIcon from "../components/ui/MaterialIcon";
import { api } from "../lib/api";
import type { PropertySearchResult } from "../lib/types";

type PageProps = { onNavigate: (page: string) => void };

// ─── Filters ──────────────────────────────────────────────────────────────────
type Filters = {
  city: string;
  type: string;
  roomType: string;
  maxRent: number;
  verified: boolean;
};

const DEFAULT_FILTERS: Filters = {
  city: "all",
  type: "all",
  roomType: "all",
  maxRent: 100000,
  verified: false,
};

const CITIES = ["all", "Bangalore", "Mumbai", "Hyderabad", "Delhi", "Gurgaon", "Pune", "Chennai", "Kolkata", "Noida", "Bhubaneswar"];
const PROP_TYPES = ["all", "1BHK", "2BHK", "Shared", "PG"];
const ROOM_TYPES = [
  { value: "all", label: "Any" },
  { value: "entire_place", label: "Entire Place" },
  { value: "private_room", label: "Private Room" },
  { value: "shared_room", label: "Shared Room" },
];

// ─── Listing card ─────────────────────────────────────────────────────────────
function ListingCard({ property, onClick }: { property: PropertySearchResult; onClick: () => void }) {
  return (
    <article
      onClick={onClick}
      className="group cursor-pointer overflow-hidden rounded-2xl bg-surface-container-lowest shadow-ambient transition-all hover:-translate-y-1 hover:shadow-lg active:scale-[0.98]"
    >
      {/* Image */}
      <div className="relative h-48 overflow-hidden bg-surface-container-low">
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
        {/* Badges */}
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
        {/* Rent overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6">
          <p className="font-headline text-base font-black text-white">
            ₹{property.price.toLocaleString("en-IN")}
            <span className="text-xs font-medium">/mo</span>
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="truncate font-headline font-bold text-on-surface group-hover:text-primary">
          {property.title}
        </h3>
        <p className="mt-0.5 flex items-center gap-0.5 text-xs text-on-surface-variant">
          <MaterialIcon name="location_on" className="text-[11px] text-primary" />
          {property.city ?? "Location not specified"}
        </p>

        {/* Stats */}
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
          {property.promotion_type && property.promotion_type !== "standard" && (
            <span className="ml-auto flex items-center gap-0.5 font-semibold text-amber-500">
              <MaterialIcon name="bolt" className="text-[12px]" fill /> {property.promotion_type}
            </span>
          )}
        </div>

        {/* Owner */}
        <div className="mt-3 flex items-center gap-2 border-t border-surface-container pt-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <MaterialIcon name="person" className="text-[14px] text-primary" />
          </span>
          <span className="truncate text-xs text-on-surface-variant">
            {property.owner.name ?? "Owner"}
          </span>
          {property.owner.is_verified && (
            <MaterialIcon name="verified" className="ml-auto text-sm text-primary" fill />
          )}
        </div>
      </div>
    </article>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AccommodationSearch({ onNavigate }: PageProps) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [properties, setProperties] = useState<PropertySearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setF = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: val }));

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      api
        .searchProperties({
          city: filters.city !== "all" ? filters.city : undefined,
          property_type: filters.type !== "all" ? filters.type : undefined,
          room_type: filters.roomType !== "all" ? filters.roomType : undefined,
          max_rent: filters.maxRent,
        })
        .then((res) => {
          const all = res.data ?? [];
          const visible = filters.verified ? all.filter((p) => p.owner.is_verified) : all;
          setProperties(visible);
          setTotal(filters.verified ? visible.length : (res.total ?? res.count ?? all.length));
        })
        .catch(() => {
          setProperties([]);
          setTotal(0);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters]);

  const openProperty = (property: PropertySearchResult) => {
    sessionStorage.setItem("homigo_selected_property", String(property.property_id));
    onNavigate("property");
  };

  // ── Grid view ───────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-24 sm:px-6">
        {/* Page header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Accommodation</p>
            <h1 className="font-headline text-3xl font-extrabold tracking-tight md:text-4xl">
              Find your perfect home
            </h1>
            <p className="mt-1 text-on-surface-variant">
              {loading ? "Loading…" : `${total} listing${total !== 1 ? "s" : ""} found`}
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
              {/* City */}
              <label className="col-span-2 space-y-1 sm:col-span-1">
                <span className="text-xs font-bold uppercase tracking-wider text-outline">City</span>
                <select value={filters.city} onChange={(e) => setF("city", e.target.value)} className="text-sm">
                  {CITIES.map((c) => (
                    <option key={c} value={c}>{c === "all" ? "All cities" : c}</option>
                  ))}
                </select>
              </label>

              {/* Type */}
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-outline">Type</span>
                <select value={filters.type} onChange={(e) => setF("type", e.target.value)} className="text-sm">
                  {PROP_TYPES.map((t) => (
                    <option key={t} value={t}>{t === "all" ? "Any type" : t}</option>
                  ))}
                </select>
              </label>

              {/* Room type */}
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-outline">Room</span>
                <select value={filters.roomType} onChange={(e) => setF("roomType", e.target.value)} className="text-sm">
                  {ROOM_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              {/* Budget */}
              <label className="col-span-2 space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-outline">
                  Max Rent:{" "}
                  <span className="text-primary">₹{filters.maxRent.toLocaleString("en-IN")}</span>
                </span>
                <input
                  type="range" min={5000} max={100000} step={1000}
                  value={filters.maxRent}
                  onChange={(e) => setF("maxRent", Number(e.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-container-highest accent-primary"
                />
                <div className="flex justify-between text-[10px] text-outline">
                  <span>₹5k</span><span>₹1L</span>
                </div>
              </label>

              {/* Verified toggle */}
              <div className="flex items-end">
                <button
                  onClick={() => setF("verified", !filters.verified)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition ${
                    filters.verified ? "bg-primary text-white" : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  <MaterialIcon name="verified" className="text-sm" fill /> Verified only
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
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                filters.city === city
                  ? "bg-primary text-white"
                  : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
              }`}
            >
              {city === "all" ? "All Cities" : city}
            </button>
          ))}
        </div>

        {/* Cards grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant">
            <MaterialIcon name="sync" className="animate-spin text-4xl text-primary" />
            <p className="mt-4 text-sm">Loading properties…</p>
          </div>
        ) : properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center text-on-surface-variant">
            <MaterialIcon name="apartment" className="text-5xl text-outline" />
            <p className="mt-4 font-headline text-xl font-bold">No listings match your filters</p>
            <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn-primary mt-5">
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {properties.map((property) => (
              <ListingCard
                key={property.property_id}
                property={property}
                onClick={() => openProperty(property)}
              />
            ))}
          </div>
        )}
      </main>

      <BottomNavBar onNavigate={onNavigate} />
    </div>
  );
}
