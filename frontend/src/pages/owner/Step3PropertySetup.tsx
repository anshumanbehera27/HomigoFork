import { useRef, useState } from "react";
import MaterialIcon from "../../components/ui/MaterialIcon";
import ProgressStepper from "../../components/ui/ProgressStepper";
import { readOwnerDraft, saveOwnerDraft } from "../../lib/registrationDraft";
import { api } from "../../lib/api";

type PageProps = { onNavigate: (page: string) => void };

const ALL_AMENITIES = ["Wi-Fi", "Laundry", "Furnished", "Balcony", "Gym", "Pet friendly", "Parking", "AC"];

export default function Step3PropertySetup({ onNavigate }: PageProps) {
  const draft = readOwnerDraft();
  const p = draft.property;

  const [title, setTitle] = useState(p.title);
  const [propertyType, setPropertyType] = useState(p.property_type);
  const [roomType, setRoomType] = useState(p.room_type);
  const [address, setAddress] = useState(p.address);
  const [city, setCity] = useState(p.city);
  const [monthlyRent, setMonthlyRent] = useState(p.monthly_rent);
  const [availableFrom, setAvailableFrom] = useState(p.available_from);
  const [amenities, setAmenities] = useState<string[]>(p.amenities);
  const [photos, setPhotos] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errors, setErrors] = useState<{ title?: string; city?: string; monthlyRent?: string }>({});

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setPhotos((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...images.filter((f) => !existing.has(f.name + f.size))];
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const toggleAmenity = (item: string) =>
    setAmenities((prev) => (prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]));

  const validate = () => {
    const next: typeof errors = {};
    if (!title.trim()) next.title = "Listing title is required.";
    if (!city.trim()) next.city = "City is required.";
    if (!monthlyRent || Number(monthlyRent) <= 0) next.monthlyRent = "Enter a valid monthly rent.";
    return next;
  };

  const handleContinue = async () => {
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    // Upload selected photos to Cloudinary, then save URLs to draft
    let imageUrls: string[] = readOwnerDraft().property.images ?? [];
    if (photos.length > 0) {
      setUploading(true);
      setUploadProgress(0);
      try {
        const urls: string[] = [];
        for (let i = 0; i < photos.length; i++) {
          const url = await api.uploadImage(photos[i], "homigo/properties");
          urls.push(url);
          setUploadProgress(Math.round(((i + 1) / photos.length) * 100));
        }
        imageUrls = urls;
      } catch {
        setErrors((prev) => ({ ...prev, title: "Photo upload failed. Please try again." }));
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    saveOwnerDraft({
      property: {
        title: title.trim(),
        property_type: propertyType,
        room_type: roomType,
        address: address.trim(),
        city: city.trim(),
        monthly_rent: monthlyRent,
        available_from: availableFrom,
        amenities,
        images: imageUrls,
      },
    });
    onNavigate("owner4");
  };

  return (
    <main className="min-h-screen bg-surface px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <ProgressStepper current={3} total={5} />
      </div>
      <form className="mx-auto mt-10 max-w-5xl space-y-6" onSubmit={(e) => { e.preventDefault(); handleContinue(); }}>
        <div>
          <h1 className="font-headline text-4xl font-extrabold">Build your listing</h1>
          <p className="mt-2 text-on-surface-variant">Details about your space help us find the perfect match.</p>
        </div>

        <section className="card space-y-4">
          <h2 className="font-headline text-2xl font-bold">Property Details</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value); setErrors((p) => ({ ...p, title: undefined })); }}
                placeholder="Listing title e.g. Sunlit Brooklyn Loft"
                className={errors.title ? "border-error ring-1 ring-error" : ""}
              />
              {errors.title && <p className="text-xs font-medium text-error">{errors.title}</p>}
            </label>
            <select value={roomType} onChange={(e) => setRoomType(e.target.value)}>
              <option value="private_room">Private room</option>
              <option value="full_apartment">Full apartment</option>
              <option value="shared_room">Shared room</option>
            </select>
          </div>
          <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
            <option value="apartment">Apartment</option>
            <option value="house">House</option>
            <option value="studio">Studio</option>
            <option value="villa">Villa</option>
          </select>
        </section>

        <section className="card space-y-4">
          <h2 className="font-headline text-2xl font-bold">Location</h2>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street address" />
          <label className="block space-y-1">
            <input
              value={city}
              onChange={(e) => { setCity(e.target.value); setErrors((p) => ({ ...p, city: undefined })); }}
              placeholder="City e.g. Brooklyn, NY"
              className={errors.city ? "border-error ring-1 ring-error" : ""}
            />
            {errors.city && <p className="text-xs font-medium text-error">{errors.city}</p>}
          </label>
        </section>

        <section className="card space-y-4">
          <h2 className="font-headline text-2xl font-bold">Pricing &amp; Availability</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <input
                value={monthlyRent}
                onChange={(e) => { setMonthlyRent(e.target.value); setErrors((p) => ({ ...p, monthlyRent: undefined })); }}
                placeholder="Monthly rent e.g. 1950"
                type="number"
                min="0"
                className={errors.monthlyRent ? "border-error ring-1 ring-error" : ""}
              />
              {errors.monthlyRent && <p className="text-xs font-medium text-error">{errors.monthlyRent}</p>}
            </label>
            <input
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              placeholder="Available from"
              type="date"
            />
          </div>
        </section>

        <section className="card space-y-4">
          <h2 className="font-headline text-2xl font-bold">Amenities &amp; Features</h2>
          <div className="flex flex-wrap gap-3">
            {ALL_AMENITIES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => toggleAmenity(item)}
                className={`chip ${amenities.includes(item) ? "bg-primary text-on-primary" : ""}`}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="mb-5 font-headline text-2xl font-bold">Photos</h2>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition ${
              isDragging
                ? "border-primary bg-primary/5 text-primary"
                : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-primary hover:text-primary"
            }`}
          >
            <MaterialIcon name="add_photo_alternate" className="text-5xl" />
            <p className="text-sm font-semibold">Drag photos here or <span className="text-primary underline">browse files</span></p>
            <p className="text-xs">PNG, JPG, WEBP — multiple allowed</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          {/* Previews */}
          {photos.length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {photos.map((file, i) => (
                <div key={file.name + file.size} className="group relative aspect-square overflow-hidden rounded-lg bg-surface-container">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
                    aria-label="Remove photo"
                  >
                    <MaterialIcon name="close" className="text-sm" />
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs font-bold text-white">Cover</span>
                  )}
                </div>
              ))}

              {/* Add more tile */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-primary hover:text-primary"
              >
                <MaterialIcon name="add" className="text-3xl" />
                <span className="text-xs font-semibold">Add more</span>
              </button>
            </div>
          )}

          {photos.length > 0 && !uploading && (
            <p className="mt-3 text-xs text-on-surface-variant">
              {photos.length} photo{photos.length !== 1 ? "s" : ""} selected · First photo is used as cover
            </p>
          )}
          {uploading && (
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-primary">
                <span className="flex items-center gap-1">
                  <MaterialIcon name="sync" className="animate-spin text-sm" /> Uploading photos…
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}
        </section>

        <div className="flex justify-between">
          <button type="button" onClick={() => onNavigate("owner2")} className="btn-tonal" disabled={uploading}>Back</button>
          <button type="button" onClick={handleContinue} className="btn-primary" disabled={uploading}>
            {uploading ? "Uploading…" : "Continue"}
          </button>
        </div>
      </form>
    </main>
  );
}