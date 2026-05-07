import { useState } from "react";
import MaterialIcon from "../../components/ui/MaterialIcon";
import RegistrationShell from "../../components/ui/RegistrationShell";
import { useHomigoAuth } from "../../components/auth/AuthContext";
import { api } from "../../lib/api";
import { readRegistrationDraft, saveRegistrationDraft } from "../../lib/registrationDraft";

type PageProps = { onNavigate: (page: string) => void };

const mapImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuBDmmfdZ7yxQruFVKFuVvbMyIYhdUgYF8pERW-ErZli8HZ21DidGRaaoJHGkaz-6yZvo2gu033nWKxfA5ZGLaIUdegc9J1ZWf7u1851mehjVplXDZxVIggREA6W29kHBtehWJWB5snObOuWwa4DNo5sOr3ZCvV6fQG1cBkwyq33YpGSC41njteoG5jNrxgrFzvgU56dXoMJ9mDlCkFXe0KFD5TMvOXTUQKPkmVV575aAc1tto979_yUAjKkA4TaluZ0PT9zbF0Q4LlS";

export default function Step3Preferences({ onNavigate }: PageProps) {
  const draft = readRegistrationDraft();
  const { userId, userProfile } = useHomigoAuth();
  const [gender, setGender] = useState(draft.seeker_profile.gender);
  const [age, setAge] = useState(draft.seeker_profile.age);
  const [occupation, setOccupation] = useState(draft.seeker_profile.occupation);
  const [bio, setBio] = useState(draft.seeker_profile.bio);
  const [locationText, setLocationText] = useState(draft.seeker_profile.preferred_locations.map((item) => item.location_name).join(", "));
  const [sleepSchedule, setSleepSchedule] = useState(draft.seeker_profile.lifestyle_preferences.sleep_schedule);
  const [cleanliness, setCleanliness] = useState(draft.seeker_profile.lifestyle_preferences.cleanliness);
  const [preferredGender, setPreferredGender] = useState(draft.seeker_profile.roommate_preferences.preferred_gender);
  const [petFriendly, setPetFriendly] = useState(draft.seeker_profile.roommate_preferences.pet_friendly);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "error" | "success"; message: string } | null>(null);

  const submitProfile = async () => {
    if (loading) return;
    setLoading(true);
    setStatus(null);
    const saved = saveRegistrationDraft({
      basic_info: {
        ...draft.basic_info,
        full_name: userProfile?.fullName ?? draft.basic_info.full_name,
        email: userProfile?.email ?? draft.basic_info.email,
        profile_photo: draft.basic_info.profile_photo ?? userProfile?.imageUrl,
      },
      seeker_profile: {
        ...draft.seeker_profile,
        gender,
        age,
        occupation,
        bio,
        preferred_locations: locationText.split(",").map((location, index) => ({ location_name: location.trim(), priority: index + 1 })).filter((location) => location.location_name),
        lifestyle_preferences: {
          smoking: "no",
          drinking: "no",
          sleep_schedule: sleepSchedule,
          cleanliness,
        },
        roommate_preferences: {
          preferred_gender: preferredGender,
          age_range: { min: 22, max: 35 },
          pet_friendly: petFriendly,
          additional_notes: draft.seeker_profile.roommate_preferences.additional_notes,
        },
      },
    });

    try {
      await api.saveUserProfile({
        user_id: userId,
        basic_info: saved.basic_info,
        seeker_profile: saved.seeker_profile,
      });
      setStatus({ type: "success", message: "Profile saved! Heading to the next step…" });
      onNavigate("onboarding4");
    } catch (error) {
      console.error("[Step3] saveUserProfile failed:", error);
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Could not save registration. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <RegistrationShell currentStep={3} sideTimeline title="Curate Your Experience" onBack={() => onNavigate("onboarding2")} onContinue={submitProfile} continueLabel="Save & Continue" loading={loading}>
      <form className="mx-auto max-w-4xl space-y-12" onSubmit={(event) => event.preventDefault()}>
        {status && (
          <p className={`rounded-lg p-4 text-sm font-semibold ${status.type === "error" ? "bg-error/10 text-error" : "bg-secondary-fixed text-on-secondary-fixed"}`}>
            {status.message}
          </p>
        )}
        <section className="rounded-lg bg-surface-container-lowest p-8 shadow-[0px_12px_32px_rgba(24,28,28,0.06)]">
          <div className="mb-8 flex items-center gap-3"><span className="rounded-xl bg-primary-container p-3 text-on-primary-container"><MaterialIcon name="person" /></span><h2 className="font-headline text-2xl font-bold">Basic Profile</h2></div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="space-y-4">
              <label className="block text-sm font-bold text-on-surface-variant">Gender Identity</label>
              <div className="flex flex-wrap gap-3">
                {(["female", "male", "other"] as const).map((value) => <button key={value} onClick={() => setGender(value)} className={`rounded-full px-6 py-2.5 font-semibold ${gender === value ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface"}`} type="button">{value === "female" ? "Woman" : value === "male" ? "Man" : "Non-binary"}</button>)}
              </div>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-bold text-on-surface-variant">Your Age: <span className="text-primary">{age}</span></label>
              <input className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-container-highest accent-primary" max="65" min="18" type="range" value={age} onChange={(event) => setAge(Number(event.target.value))} />
              <div className="flex justify-between text-xs font-medium text-outline"><span>18</span><span>65+</span></div>
            </div>
            <label className="space-y-4 md:col-span-2">
              <span className="block text-sm font-bold text-on-surface-variant">Current Occupation</span>
              <input value={occupation} onChange={(event) => setOccupation(event.target.value)} className="rounded-xl bg-surface-container-low p-4" placeholder="e.g. Senior Designer at Tech Co" type="text" />
            </label>
            <label className="space-y-4 md:col-span-2">
              <span className="block text-sm font-bold text-on-surface-variant">Bio (The Editorial Hook)</span>
              <textarea value={bio} onChange={(event) => setBio(event.target.value)} className="resize-none rounded-xl bg-surface-container-low p-4" placeholder="Share a bit about your lifestyle..." rows={4} />
            </label>
          </div>
        </section>
        <section className="rounded-lg bg-surface-container-lowest p-8 shadow-[0px_12px_32px_rgba(24,28,28,0.06)]">
          <div className="mb-8 flex items-center gap-3"><span className="rounded-xl bg-secondary-container p-3 text-on-secondary-container"><MaterialIcon name="map" /></span><h2 className="font-headline text-2xl font-bold">Preferred Locations</h2></div>
          <div className="relative mb-6"><MaterialIcon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" /><input value={locationText} onChange={(event) => setLocationText(event.target.value)} className="rounded-xl bg-surface-container-low py-4 pl-12 pr-4" placeholder="Search neighborhoods or landmarks..." type="text" /></div>
          <div className="mb-8 flex flex-wrap gap-3">{locationText.split(",").map((location) => location.trim()).filter(Boolean).map((location) => <div key={location} className="flex items-center gap-2 rounded-full bg-secondary-fixed px-4 py-2 font-medium text-on-secondary-fixed"><span>{location}</span><MaterialIcon name="close" className="text-sm" /></div>)}</div>
          <div className="relative aspect-video overflow-hidden rounded-xl"><img className="h-full w-full object-cover" src={mapImage} alt="Preferred neighborhoods map" /><div className="absolute inset-0 bg-primary/10" /></div>
        </section>
        <section className="rounded-lg bg-surface-container-lowest p-8 shadow-[0px_12px_32px_rgba(24,28,28,0.06)]">
          <div className="mb-8 flex items-center gap-3"><span className="rounded-xl bg-tertiary-container p-3 text-on-tertiary-container"><MaterialIcon name="auto_awesome" /></span><h2 className="font-headline text-2xl font-bold">Lifestyle Preferences</h2></div>
          <div className="mb-12 grid grid-cols-2 gap-4 md:grid-cols-3">
            <button className="flex flex-col items-center gap-3 rounded-xl bg-surface-container-low p-6"><MaterialIcon name="smoke_free" className="text-3xl" /><span className="text-sm font-bold">Non-smoker</span></button>
            <button className="flex flex-col items-center gap-3 rounded-xl bg-surface-container-low p-6"><MaterialIcon name="no_drinks" className="text-3xl" /><span className="text-sm font-bold">No Drinking</span></button>
            <button onClick={() => setSleepSchedule("night_owl")} className={`flex scale-105 flex-col items-center gap-3 rounded-xl p-6 shadow-lg ${sleepSchedule === "night_owl" ? "bg-primary-container text-on-primary-container" : "bg-surface-container-low"}`}><MaterialIcon name="nightlight" className="text-3xl" /><span className="text-sm font-bold">Night Owl</span></button>
          </div>
          <div className="mx-auto max-w-lg space-y-6"><div className="flex items-center justify-between"><label className="block text-sm font-bold text-on-surface-variant">Cleanliness Standards</label><span className="rounded-full bg-secondary-fixed px-3 py-1 text-xs font-bold text-on-secondary-fixed">{cleanliness >= 5 ? "Spotless" : "Balanced"}</span></div><input className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-container-highest accent-secondary" max="5" min="1" type="range" value={cleanliness} onChange={(event) => setCleanliness(Number(event.target.value))} /><div className="flex justify-between text-xs font-medium text-outline"><span>Relaxed</span><span>Balanced</span><span>High</span></div></div>
        </section>
        <section className="rounded-lg bg-surface-container-lowest p-8 shadow-[0px_12px_32px_rgba(24,28,28,0.06)]">
          <div className="mb-8 flex items-center gap-3"><span className="rounded-xl bg-secondary-fixed p-3 text-on-secondary-fixed"><MaterialIcon name="group_add" fill /></span><h2 className="font-headline text-2xl font-bold">Roommate Preferences</h2></div>
          <div className="space-y-10"><div className="space-y-4"><div className="flex items-center justify-between"><label className="block text-sm font-bold text-on-surface-variant">Ideal Age Range</label><span className="text-sm font-bold text-primary">22 - 35 years</span></div><div className="relative h-2 rounded-full bg-surface-container-highest"><div className="absolute left-[15%] right-[40%] h-full rounded-full bg-primary" /><div className="absolute left-[15%] top-1/2 h-6 w-6 -translate-y-1/2 cursor-pointer rounded-full border-4 border-primary bg-white shadow-md" /><div className="absolute right-[40%] top-1/2 h-6 w-6 -translate-y-1/2 cursor-pointer rounded-full border-4 border-primary bg-white shadow-md" /></div></div>
          <div className="space-y-4"><label className="block text-sm font-bold text-on-surface-variant">Preferred Gender for Roommates</label><div className="flex flex-wrap gap-3">{(["female", "any", "male"] as const).map((value) => <button key={value} onClick={() => setPreferredGender(value)} className={`rounded-full px-6 py-2.5 font-semibold ${preferredGender === value ? "bg-secondary text-on-secondary" : "bg-surface-container-high text-on-surface"}`} type="button">{value === "female" ? "Women only" : value === "male" ? "Men only" : "Any Gender"}</button>)}</div></div>
          <div className="flex items-center justify-between rounded-xl bg-surface-container p-6"><div className="flex items-center gap-4"><MaterialIcon name="pets" className="text-2xl text-primary" /><div><p className="font-bold text-on-surface">Pet Friendly Household</p><p className="text-sm text-on-surface-variant">I'm comfortable living with furry friends</p></div></div><button onClick={() => setPetFriendly((value) => !value)} className={`relative h-8 w-14 rounded-full ${petFriendly ? "bg-primary" : "bg-surface-container-highest"}`} type="button"><div className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm ${petFriendly ? "right-1" : "left-1"}`} /></button></div></div>
        </section>
      </form>
    </RegistrationShell>
  );
}
