// ─── Seeker draft ─────────────────────────────────────────────────────────────

export type RegistrationDraft = {
  basic_info: {
    full_name: string;
    email: string;
    phone: string;
    role: "seeker" | "owner" | "both";
    profile_photo?: string;
  };
  seeker_profile: {
    gender: "male" | "female" | "other";
    age: number;
    occupation: string;
    bio: string;
    preferred_locations: Array<{ location_name: string; lat?: number; lng?: number; priority: number }>;
    lifestyle_preferences: {
      smoking: "yes" | "no" | "occasionally";
      drinking: "yes" | "no" | "occasionally";
      sleep_schedule: "early_bird" | "night_owl" | "flexible";
      cleanliness: number;
    };
    roommate_preferences: {
      preferred_gender: "male" | "female" | "any";
      age_range: { min: number; max: number };
      pet_friendly: boolean;
      additional_notes: string;
    };
  };
};

const SEEKER_KEY = "homigo.registrationDraft";

export const defaultRegistrationDraft: RegistrationDraft = {
  basic_info: {
    full_name: "",
    email: "",
    phone: "",
    role: "seeker",
  },
  seeker_profile: {
    gender: "female",
    age: 26,
    occupation: "",
    bio: "",
    preferred_locations: [],
    lifestyle_preferences: {
      smoking: "no",
      drinking: "no",
      sleep_schedule: "flexible",
      cleanliness: 3,
    },
    roommate_preferences: {
      preferred_gender: "any",
      age_range: { min: 22, max: 35 },
      pet_friendly: false,
      additional_notes: "",
    },
  },
};

export function readRegistrationDraft(): RegistrationDraft {
  const raw = localStorage.getItem(SEEKER_KEY);
  if (!raw) return defaultRegistrationDraft;
  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultRegistrationDraft,
      ...parsed,
      basic_info: { ...defaultRegistrationDraft.basic_info, ...parsed.basic_info },
      seeker_profile: {
        ...defaultRegistrationDraft.seeker_profile,
        ...parsed.seeker_profile,
        lifestyle_preferences: {
          ...defaultRegistrationDraft.seeker_profile.lifestyle_preferences,
          ...parsed.seeker_profile?.lifestyle_preferences,
        },
        roommate_preferences: {
          ...defaultRegistrationDraft.seeker_profile.roommate_preferences,
          ...parsed.seeker_profile?.roommate_preferences,
          age_range: {
            ...defaultRegistrationDraft.seeker_profile.roommate_preferences.age_range,
            ...parsed.seeker_profile?.roommate_preferences?.age_range,
          },
        },
      },
    };
  } catch {
    return defaultRegistrationDraft;
  }
}

export function saveRegistrationDraft(patch: Partial<RegistrationDraft>) {
  const current = readRegistrationDraft();
  const next: RegistrationDraft = {
    ...current,
    ...patch,
    basic_info: { ...current.basic_info, ...patch.basic_info },
    seeker_profile: {
      ...current.seeker_profile,
      ...patch.seeker_profile,
      lifestyle_preferences: {
        ...current.seeker_profile.lifestyle_preferences,
        ...patch.seeker_profile?.lifestyle_preferences,
      },
      roommate_preferences: {
        ...current.seeker_profile.roommate_preferences,
        ...patch.seeker_profile?.roommate_preferences,
        age_range: {
          ...current.seeker_profile.roommate_preferences.age_range,
          ...patch.seeker_profile?.roommate_preferences?.age_range,
        },
      },
    },
  };
  localStorage.setItem(SEEKER_KEY, JSON.stringify(next));
  return next;
}

// ─── Owner draft ──────────────────────────────────────────────────────────────

export type OwnerDraft = {
  basic_info: {
    full_name: string;
    email: string;
    phone: string;
    profile_photo?: string;
  };
  owner_profile: {
    business_name: string;
    owner_type: "individual" | "company";
    bio: string;
  };
  property: {
    title: string;
    property_type: string;
    room_type: string;
    address: string;
    city: string;
    monthly_rent: string;
    available_from: string;
    amenities: string[];
    images: string[];
  };
};

const OWNER_KEY = "homigo.ownerDraft";

export const defaultOwnerDraft: OwnerDraft = {
  basic_info: { full_name: "", email: "", phone: "" },
  owner_profile: { business_name: "", owner_type: "individual", bio: "" },
  property: {
    title: "",
    property_type: "apartment",
    room_type: "private_room",
    address: "",
    city: "",
    monthly_rent: "",
    available_from: "",
    amenities: [],
    images: [],
  },
};

export function readOwnerDraft(): OwnerDraft {
  const raw = localStorage.getItem(OWNER_KEY);
  if (!raw) return defaultOwnerDraft;
  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultOwnerDraft,
      ...parsed,
      basic_info: { ...defaultOwnerDraft.basic_info, ...parsed.basic_info },
      owner_profile: { ...defaultOwnerDraft.owner_profile, ...parsed.owner_profile },
      property: { ...defaultOwnerDraft.property, ...parsed.property },
    };
  } catch {
    return defaultOwnerDraft;
  }
}

export function saveOwnerDraft(patch: Partial<OwnerDraft>) {
  const current = readOwnerDraft();
  const next: OwnerDraft = {
    ...current,
    ...patch,
    basic_info: { ...current.basic_info, ...patch.basic_info },
    owner_profile: { ...current.owner_profile, ...patch.owner_profile },
    property: { ...current.property, ...patch.property },
  };
  localStorage.setItem(OWNER_KEY, JSON.stringify(next));
  return next;
}

// ─── Onboarding completion ────────────────────────────────────────────────────

const ONBOARDING_KEY = "homigo.onboardingDone";

export function markOnboardingComplete(role: "seeker" | "owner") {
  localStorage.setItem(ONBOARDING_KEY, role);
}

export function isOnboardingComplete(): boolean {
  return Boolean(localStorage.getItem(ONBOARDING_KEY));
}