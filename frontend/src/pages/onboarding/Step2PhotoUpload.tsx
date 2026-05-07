import { useRef, useState } from "react";
import MaterialIcon from "../../components/ui/MaterialIcon";
import RegistrationShell from "../../components/ui/RegistrationShell";
import { useHomigoAuth } from "../../components/auth/AuthContext";
import { readRegistrationDraft, saveRegistrationDraft } from "../../lib/registrationDraft";
import { api } from "../../lib/api";

type PageProps = { onNavigate: (page: string) => void };

const previewPhoto = "https://lh3.googleusercontent.com/aida-public/AB6AXuBG7mMYsJlFFEM02NcyJiF1hTfyo6nBKsCB7z3-PUiq3nmS75HcRgiLPuOMFMWskaUHKi-m63j6aJkkls8F7IhQHLkCcSj-SKKMS79zW8CmUv0UROnp9806CxCTxGuUiOyoctU4RzxlEsxCEdzLOONAm3Tcnx4lh2_h-5IzpNO8cXDx1FRUay3S8tKF2yo4pdCnnLXQ98Uy8NqZpiByQnm2CRCBGf0nFIxd1hPzZ1ju9TYuKgkXtMiEBJlEHUPI7acdIMwKFvIk8C0S";

export default function Step2PhotoUpload({ onNavigate }: PageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { userId } = useHomigoAuth();
  const [photo, setPhoto] = useState(readRegistrationDraft().basic_info.profile_photo ?? previewPhoto);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    // Show local preview immediately while uploading
    const localUrl = URL.createObjectURL(file);
    setPhoto(localUrl);
    try {
      // Step 1: Upload to Cloudinary, get HTTPS URL back
      const cloudinaryUrl = await api.uploadImage(file, "homigo/profiles");
      setPhoto(cloudinaryUrl);

      // Step 2: Persist URL to Supabase immediately (media table + users.profile_photo)
      const draft = readRegistrationDraft();
      const updatedDraft = saveRegistrationDraft({
        basic_info: { ...draft.basic_info, profile_photo: cloudinaryUrl },
      });
      await api.saveUserProfile({
        user_id: userId,
        basic_info: {
          email: updatedDraft.basic_info.email,
          full_name: updatedDraft.basic_info.full_name,
          profile_photo: cloudinaryUrl,
        },
      });
    } catch {
      setUploadError("Upload failed. Please try again.");
      setPhoto(previewPhoto);
    } finally {
      setUploading(false);
    }
  };

  const saveAndContinue = () => {
    saveRegistrationDraft({ basic_info: { ...readRegistrationDraft().basic_info, profile_photo: photo } });
    onNavigate("onboarding3");
  };

  return (
    <RegistrationShell currentStep={2} sideTimeline onBack={() => onNavigate("onboarding1")} onContinue={saveAndContinue} loading={uploading}>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-10 text-center">
          <div className="mb-4 flex items-center justify-center gap-3 lg:hidden">
            <div className="h-1.5 w-12 rounded-full bg-primary" />
            <div className="h-1.5 w-12 rounded-full bg-primary" />
            <div className="h-1.5 w-12 rounded-full bg-surface-container-highest" />
            <div className="h-1.5 w-12 rounded-full bg-surface-container-highest" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary lg:hidden">Step 2 of 4</p>
          <h1 className="mt-2 font-headline text-4xl font-extrabold tracking-tight text-on-surface">Add your profile photo</h1>
          <p className="mx-auto mt-2 max-w-md text-on-surface-variant">Profiles with clear photos get 3x more match requests from potential roommates.</p>
        </div>
        <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2">
          <div className="rounded-xl bg-surface-container-lowest p-8">
            <button onClick={() => inputRef.current?.click()} onDrop={(event) => { event.preventDefault(); handleFile(event.dataTransfer.files[0]); }} onDragOver={(event) => event.preventDefault()} className="group flex aspect-square w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant bg-surface-bright p-8 text-center transition-colors hover:border-primary" type="button">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary-container/10 transition-transform group-hover:scale-110">
                <MaterialIcon name="add_a_photo" className="text-4xl text-primary" />
              </div>
              <p className="mb-1 font-bold text-on-surface">Drag and drop</p>
              <p className="mb-6 text-sm text-on-surface-variant">or click to browse files</p>
              <span className="rounded-full bg-surface-container-high px-6 py-2 text-sm font-semibold text-on-surface">Upload Photo</span>
            </button>
            <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handleFile(event.target.files?.[0])} />
            {uploading && (
              <p className="mt-3 flex items-center justify-center gap-2 text-xs text-primary">
                <MaterialIcon name="sync" className="animate-spin text-sm" /> Uploading…
              </p>
            )}
            {uploadError && <p className="mt-2 text-xs font-semibold text-error">{uploadError}</p>}
          </div>
          <div className="relative overflow-hidden rounded-xl bg-surface-container-lowest p-8">
            <div className="mb-6 flex items-center gap-2">
              <MaterialIcon name="stars" className="text-sm text-secondary" fill />
              <span className="text-xs font-bold uppercase tracking-wider text-secondary">Preview Preview</span>
            </div>
            <div className="group relative mb-6 aspect-square overflow-hidden rounded-xl">
              <img alt="Profile Preview" className="h-full w-full object-cover" src={photo} />
              <div className="absolute inset-0 flex items-center justify-center gap-3 bg-on-background/40 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => inputRef.current?.click()} className="rounded-full bg-white p-3 text-on-surface" type="button"><MaterialIcon name="edit" /></button>
                <button onClick={() => setPhoto(previewPhoto)} className="rounded-full bg-white p-3 text-error" type="button"><MaterialIcon name="delete" /></button>
              </div>
            </div>
            <h3 className="font-bold text-on-surface">Looking great!</h3>
            <p className="mt-2 text-sm text-on-surface-variant">This is how potential roommates will see you.</p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-secondary-fixed px-3 py-1.5 text-xs font-bold text-on-secondary-fixed">
              <MaterialIcon name="favorite" className="text-sm" fill />94% Compatibility Pulse
            </div>
          </div>
        </div>
        <div className="mt-12 text-center">
          <button onClick={saveAndContinue} className="text-sm font-semibold text-on-surface-variant underline-offset-4 transition-all hover:text-primary hover:underline">Skip for now</button>
        </div>
      </div>
      <div className="pointer-events-none fixed inset-0 -z-10 bg-surface-container-low" />
    </RegistrationShell>
  );
}
