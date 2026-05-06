import { useRef, useState } from "react";
import MaterialIcon from "../../components/ui/MaterialIcon";
import RegistrationShell from "../../components/ui/RegistrationShell";
import { api } from "../../lib/api";
import { useHomigoAuth } from "../../components/auth/AuthContext";
import { readOwnerDraft } from "../../lib/registrationDraft";

type PageProps = { onNavigate: (page: string) => void };

type UploadZoneProps = {
  file: File | null;
  onFile: (f: File) => void;
  icon: string;
  hint: string;
};

function UploadZone({ file, onFile, icon, hint }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  const isImage = file && file.type.startsWith("image/");
  const previewUrl = isImage ? URL.createObjectURL(file!) : null;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition ${
        dragging ? "border-primary bg-primary/5" : file ? "border-primary/40 bg-surface-container-low" : "border-outline-variant bg-surface-container-low hover:border-primary hover:bg-primary/5"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {previewUrl ? (
        <div className="relative">
          <img src={previewUrl} alt="Preview" className="h-40 w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition hover:opacity-100">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-on-surface">Change file</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-container">
            <MaterialIcon name={icon} className="text-outline" />
          </div>
          <p className="text-sm font-semibold text-on-surface">Click to upload or drag &amp; drop</p>
          <p className="text-xs text-on-surface-variant">{hint}</p>
        </div>
      )}

      {file && !previewUrl && (
        <div className="flex items-center gap-3 px-4 py-3">
          <MaterialIcon name="description" className="text-primary" />
          <span className="flex-1 truncate text-sm font-medium text-on-surface">{file.name}</span>
          <MaterialIcon name="check_circle" className="text-teal-600" fill />
        </div>
      )}

      {file && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onFile(null as any); }}
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
          aria-label="Remove file"
        >
          <MaterialIcon name="close" className="text-sm" />
        </button>
      )}
    </div>
  );
}

export default function Step4KYC({ onNavigate }: PageProps) {
  const { userId, userProfile } = useHomigoAuth();
  const [governmentIdType, setGovernmentIdType] = useState("aadhar");
  const [governmentIdNumber, setGovernmentIdNumber] = useState("");
  const [governmentIdFile, setGovernmentIdFile] = useState<File | null>(null);
  const [addressProofType, setAddressProofType] = useState("utility_bill");
  const [addressProofFile, setAddressProofFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "error" | "success"; message: string } | null>(null);

  const submitKyc = async () => {
    if (loading) return;
    if (!addressProofFile) {
      setStatus({ type: "error", message: "Address proof document is required." });
      return;
    }
    setLoading(true);
    setStatus(null);

    const draft = readOwnerDraft();
    const property = draft.property;

    const amenityKeys = property.amenities.map((label) =>
      label.toLowerCase().replace(/-/g, "_").replace(/\s+/g, "_"),
    );
    const roomTypeMap: Record<string, string> = {
      private_room: "private",
      shared_room: "shared",
      full_apartment: "pg",
    };
    const roomType = roomTypeMap[property.room_type] ?? property.room_type;
    const hasRoom = Boolean(property.city || property.title);

    try {
      // 1. Upload KYC documents to Cloudinary
      const [govIdUrl, addrProofUrl] = await Promise.all([
        governmentIdFile ? api.uploadImage(governmentIdFile, "homigo/kyc") : Promise.resolve(null),
        api.uploadImage(addressProofFile, "homigo/kyc"),
      ]);

      // 2. Save user + seeker/owner profile + property with images from draft
      await api.saveUserProfile({
        user_id: userId,
        basic_info: {
          full_name: draft.basic_info.full_name || userProfile?.fullName || null,
          email: draft.basic_info.email || userProfile?.email,
          phone: draft.basic_info.phone || userProfile?.phone || null,
          role: "owner",
          profile_photo: draft.basic_info.profile_photo || userProfile?.imageUrl || null,
        },
        owner_profile: { kyc_status: "pending" },
        current_room_details: hasRoom
          ? {
              has_room: true,
              room_type: roomType,
              location: property.city || null,
              rent: property.monthly_rent ? Number(property.monthly_rent) : null,
              vacancy: 1,
              description: property.title || null,
              room_images: property.images ?? [],
              amenities: amenityKeys,
              room_preferences: { preferred_gender: "any" },
            }
          : { has_room: false },
      });

      // 3. Submit KYC verification documents
      await api.saveOwnerProfile({
        basic_info: {
          name: draft.basic_info.full_name || userProfile?.fullName || null,
          email: draft.basic_info.email || userProfile?.email,
          phone: draft.basic_info.phone || userProfile?.phone || null,
        },
        owner_profile: {
          business_name: draft.owner_profile.business_name || null,
          owner_type: draft.owner_profile.owner_type,
          bio: draft.owner_profile.bio || null,
        },
        verification_details: {
          government_id: {
            id_type: governmentIdType,
            id_number: governmentIdNumber || null,
            document_images: govIdUrl ? [govIdUrl] : [],
          },
          address_proof: {
            document_type: addressProofType,
            document_image: addrProofUrl,
          },
        },
      });

      setStatus({ type: "success", message: "Verification submitted successfully!" });
      onNavigate("owner5");
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not submit verification. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <RegistrationShell
      currentStep={4}
      totalSteps={5}
      title="Identity Verification"
      subtitle="Verify your identity to ensure a safe and trusted community for all Homigo users."
      onBack={() => onNavigate("owner3")}
      onContinue={submitKyc}
      continueLabel="Save & Continue"
      loading={loading}
    >
      {/* Status badge row — aligned with the title block */}
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-primary">
          <MaterialIcon name="verified_user" className="text-sm" fill />
          <span className="text-xs font-bold uppercase tracking-widest">Bank-Grade Security</span>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-secondary-fixed px-3 py-1 text-on-secondary-fixed">
          <MaterialIcon name="pending" className="text-sm" />
          <span className="text-xs font-semibold">Status: Pending</span>
        </div>
      </div>

      {status && (
        <p className={`mb-6 rounded-lg p-4 text-sm font-semibold ${status.type === "error" ? "bg-error/10 text-error" : "bg-secondary-fixed text-on-secondary-fixed"}`}>
          {status.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
        {/* Left column — documents */}
        <div className="space-y-8 md:col-span-7">

          {/* Government ID */}
          <div className="rounded-xl bg-surface-container-lowest p-8">
            <div className="mb-6 flex items-start gap-4">
              <div className="rounded-xl bg-primary-container/20 p-3 text-primary">
                <MaterialIcon name="badge" />
              </div>
              <div>
                <h3 className="font-headline text-xl font-bold">Government ID</h3>
                <p className="text-sm text-on-surface-variant">Aadhar Card, Passport, or Driver's License</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <select value={governmentIdType} onChange={(e) => setGovernmentIdType(e.target.value)}>
                  <option value="aadhar">Aadhar Card</option>
                  <option value="passport">Passport</option>
                  <option value="pan">PAN Card</option>
                  <option value="dl">Driver's License</option>
                </select>
                <input
                  value={governmentIdNumber}
                  onChange={(e) => setGovernmentIdNumber(e.target.value)}
                  placeholder={governmentIdType === "aadhar" ? "XXXX-XXXX-XXXX" : "ID number"}
                />
              </div>
              <UploadZone
                file={governmentIdFile}
                onFile={setGovernmentIdFile}
                icon="upload_file"
                hint="PNG, JPG or PDF · max 10 MB"
              />
            </div>
          </div>

          {/* Address Proof */}
          <div className="rounded-xl bg-surface-container-lowest p-8">
            <div className="mb-6 flex items-start gap-4">
              <div className="rounded-xl bg-primary-container/20 p-3 text-primary">
                <MaterialIcon name="home_pin" />
              </div>
              <div>
                <h3 className="font-headline text-xl font-bold">Address Proof</h3>
                <p className="text-sm text-on-surface-variant">Utility bill, Rent agreement, or Bank statement</p>
              </div>
            </div>
            <div className="space-y-4">
              <select value={addressProofType} onChange={(e) => setAddressProofType(e.target.value)}>
                <option value="utility_bill">Utility Bill</option>
                <option value="bank_statement">Bank Statement</option>
                <option value="rent_agreement">Rent Agreement</option>
              </select>
              <UploadZone
                file={addressProofFile}
                onFile={setAddressProofFile}
                icon="description"
                hint="Recent document issued within last 3 months"
              />
            </div>
          </div>
        </div>

        {/* Right column — info */}
        <div className="space-y-8 md:col-span-5">
          <div className="rounded-xl bg-surface-container-low p-6">
            <h4 className="mb-4 flex items-center gap-2 font-headline text-lg font-bold">
              <MaterialIcon name="shield" className="text-primary" fill />
              Why verify?
            </h4>
            <ul className="space-y-3">
              {[
                ["verified", "Premium verified badge on your profile"],
                ["trending_up", "Higher priority in roommate search results"],
                ["lock", "Secure encrypted data — never shared"],
                ["handshake", "Builds trust with potential tenants"],
              ].map(([icon, text]) => (
                <li key={text} className="flex items-start gap-3 text-sm text-on-surface-variant">
                  <MaterialIcon name={icon} className="mt-0.5 text-sm text-teal-600" />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
            <h4 className="mb-3 font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant">Tips</h4>
            <ul className="space-y-2 text-sm text-on-surface-variant">
              <li>· Make sure the document is clear and fully visible</li>
              <li>· All four corners must be in the frame</li>
              <li>· Avoid glare or shadows on the document</li>
              <li>· File size must be under 10 MB</li>
            </ul>
          </div>
        </div>
      </div>
    </RegistrationShell>
  );
}
