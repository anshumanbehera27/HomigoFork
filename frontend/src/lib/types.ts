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

export type SeekerSearchResult = {
  user_id: string | number;
  name?: string | null;
  age?: number | null;
  gender?: string | null;
  occupation?: string | null;
  location?: string | null;
  budget?: number | null;
  profile_image?: string | null;
  lifestyle?: {
    smoking?: unknown;
    drinking?: unknown;
    sleep?: unknown;
    cleanliness?: unknown;
  };
  compatibility: number;
};
