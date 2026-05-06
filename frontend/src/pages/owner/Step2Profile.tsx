import { useRef, useState } from "react";
import ProgressStepper from "../../components/ui/ProgressStepper";
import MaterialIcon from "../../components/ui/MaterialIcon";
import { readOwnerDraft, saveOwnerDraft } from "../../lib/registrationDraft";
import { api } from "../../lib/api";

type PageProps = { onNavigate: (page: string) => void };

export default function Step2Profile({ onNavigate }: PageProps) {
  const draft = readOwnerDraft();
  const inputRef = useRef<HTMLInputElement>(null);

  const [bio, setBio] = useState(draft.owner_profile.bio);
  const [ownerType, setOwnerType] = useState<"individual" | "company">(draft.owner_profile.owner_type);
  const [photo, setPhoto] = useState<string | undefined>(draft.basic_info.profile_photo);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    // Show a local object URL as preview immediately while the upload runs
    const localPreview = URL.createObjectURL(file);
    setPhoto(localPreview);
    try {
      const cloudinaryUrl = await api.uploadImage(file, "homigo/profiles");
      setPhoto(cloudinaryUrl);
      // Persist the Cloudinary URL into the draft right away so it survives navigation
      saveOwnerDraft({ basic_info: { ...readOwnerDraft().basic_info, profile_photo: cloudinaryUrl } });
    } catch {
      setUploadError("Upload failed — please try again.");
      setPhoto(draft.basic_info.profile_photo); // revert to previous
    } finally {
      setUploading(false);
    }
  };

  const handleContinue = () => {
    saveOwnerDraft({
      basic_info: { ...readOwnerDraft().basic_info, profile_photo: photo },
      owner_profile: { ...draft.owner_profile, bio: bio.trim(), owner_type: ownerType },
    });
    onNavigate("owner3");
  };

  const initials = draft.basic_info.full_name
    ? draft.basic_info.full_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <main className="min-h-screen bg-surface px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <ProgressStepper current={2} total={5} />
      </div>
      <section className="mx-auto mt-10 grid max-w-6xl gap-8 lg:grid-cols-[1fr_360px]">
        <form className="card space-y-5" onSubmit={(e) => { e.preventDefault(); handleContinue(); }}>
          <h1 className="font-headline text-4xl font-extrabold">Build your host profile</h1>
          <p className="text-on-surface-variant">Introduce yourself to potential guests and tenants.</p>

          {/* Profile photo */}
          <div
            onClick={() => !uploading && inputRef.current?.click()}
            onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            onDragOver={(e) => e.preventDefault()}
            className={`group flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-surface-container-low p-8 text-center transition-colors ${uploading ? "cursor-not-allowed border-outline-variant opacity-60" : "border-outline-variant hover:border-primary"}`}
          >
            {photo ? (
              <div className="relative mb-3">
                <img src={photo} alt="Profile" className="h-20 w-20 rounded-full object-cover" />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                    <MaterialIcon name="sync" className="animate-spin text-xl text-white" />
                  </div>
                )}
              </div>
            ) : (
              <MaterialIcon name={uploading ? "sync" : "cloud_upload"} className={`mb-3 text-5xl text-primary ${uploading ? "animate-spin" : ""}`} />
            )}
            <p className="text-sm font-semibold">
              {uploading ? "Uploading to Cloudinary…" : photo ? "Click to change photo" : "Click to upload or drag and drop"}
            </p>
            {uploadError && <p className="mt-2 text-xs font-semibold text-error">{uploadError}</p>}
          </div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />

          {/* Owner type */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-on-surface-variant">I am a</p>
            <div className="flex gap-3">
              {(["individual", "company"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setOwnerType(type)}
                  className={`rounded-full px-6 py-2.5 text-sm font-semibold capitalize ${ownerType === type ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface"}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Bio */}
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-on-surface-variant">About you / your company</span>
            <textarea
              rows={5}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="We manage thoughtfully designed homes for people who value comfort, location, and reliable support."
              className="w-full"
            />
          </label>

          <div className="flex justify-between">
            <button type="button" onClick={() => onNavigate("owner1")} className="btn-tonal" disabled={uploading}>Back</button>
            <button type="button" onClick={handleContinue} className="btn-primary" disabled={uploading}>
              {uploading ? "Uploading…" : "Continue"}
            </button>
          </div>
        </form>

        <aside className="card h-fit text-center">
          <h3 className="font-headline text-lg font-bold">Live Preview</h3>
          <div className="mx-auto mt-6 grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-primary/10">
            {photo
              ? <img src={photo} alt="Preview" className="h-full w-full object-cover" />
              : <span className="text-3xl font-black text-primary">{initials}</span>}
          </div>
          <p className="mt-4 font-bold">{draft.basic_info.full_name || "Your Name"}</p>
          <p className="text-sm capitalize text-on-surface-variant">
            {ownerType} Host
            {draft.owner_profile.business_name ? ` · ${draft.owner_profile.business_name}` : ""}
          </p>
          {bio && <p className="mt-3 line-clamp-3 text-xs text-on-surface-variant">{bio}</p>}
        </aside>
      </section>
    </main>
  );
}