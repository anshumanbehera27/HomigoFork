export type ApiListResponse<T> = {
  data: T[];
  count?: number;
  page?: number;
  limit?: number;
};

export type ApiSingleResponse<T> = {
  data: T;
};

export type Property = {
  property_id: number;
  owner_id: number;
  title: string;
  description?: string | null;
  property_type?: string | null;
  room_type?: string | null;
  listing_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  monthly_rent: number;
  cover_image?: string | null;
  status?: string | null;
  total_views?: number | null;
  created_at?: string | null;
  property_images?: Array<{ image_url: string; order_no?: number | null }>;
  property_amenities?: Array<{ amenity: string }>;
};

export type PropertySearchResult = {
  property_id: number;
  title: string;
  city: string | null;
  cover_image: string | null;
  price: number;
  listing_type: string | null;
  promotion_type: string | null;
  property_type: string | null;
  room_type: string | null;
  owner: {
    owner_id: number;
    name: string | null;
    is_verified: boolean;
  };
};

export type User = {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
  profile_photo?: string | null;
  is_verified?: boolean | null;
};

export type RoommateMatch = {
  match_id: number;
  seeker_id: number;
  matched_user_id: number;
  compatibility?: number | null;
  status?: string | null;
  matched_user?: User;
};

export type Conversation = {
  conversation_id: number;
  sender_id: number;
  receiver_id: number;
  context_type?: string | null;
  context_id?: number | null;
  status?: string | null;
};

/** Raw row from `conversations` (chat controller create/get responses). */
export type ConversationRecord = {
  conversation_id: number;
  user1_id: number;
  user2_id: number;
  property_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/** Enriched conversation row returned by GET /conversations?user_id= */
export type EnrichedConversation = {
  conversation_id: number;
  created_at: string;
  updated_at: string;
  property_id: number | null;
  other_user_id: number;
  other_user_name: string | null;
  other_user_photo: string | null;
  other_user_role: string | null;
  last_message_id: number | null;
  last_message_content: string | null;
  last_message_sender_id: number | null;
  last_message_at: string | null;
  unread_count: number;
};

/** Message row returned by GET /conversations/:id/messages */
export type BackendMessage = {
  message_id: number;
  conversation_id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  message_type: string;
  read: boolean;
  timestamp: string;
};

export type PaginatedResponse<T> = {
  success: boolean;
  data: T[];
  pagination: {
    limit: number;
    next_cursor: number | null;
    has_more: boolean;
  };
};

export type Message = {
  message_id: number;
  conversation_id: number;
  sender_id: number;
  body: string;
  is_read?: boolean | null;
  sent_at?: string | null;
};

export type DashboardStats = {
  total_matches?: number;
  active_chats?: number;
  saved_properties?: number;
  profile_completion?: number;
};

export type DashboardData = {
  user: User;
  matches: RoommateMatch[];
  saved: unknown[];
  conversations: Conversation[];
  notifications: unknown[];
  stats?: DashboardStats;
  recommended_properties?: Property[];
};

export type RoommateProfile = {
  id: string;
  name: string;
  age: number;
  gender: "male" | "female";
  city: string;
  occupation: string;
  company: string;
  bio: string;
  compatibility: number;
  budget: number;
  lifestyle: {
    smoking: boolean;
    drinking: boolean;
    pets: boolean;
    schedule: "early_bird" | "night_owl" | "flexible";
    cleanliness: "high" | "medium" | "relaxed";
  };
  preferences: string[];
  preferredGender: "male" | "female" | "any";
  languages: string[];
  avatar: string;
  lookingIn: string[];
  propertyId?: string;
  interestedProperty?: {
    property_id: number;
    title: string | null;
    city: string | null;
    rent: number | null;
    cover_image: string | null;
  };
  interestedProperties?: Array<{
    property_id: number;
    title: string | null;
    city: string | null;
    rent: number | null;
    cover_image: string | null;
  }>;
};
