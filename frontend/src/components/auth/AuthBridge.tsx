import { useAuth, useUser } from "@clerk/clerk-react";
import { useEffect, useRef } from "react";
import { api, setAuthTokenGetter } from "../../lib/api";
import { markOnboardingComplete } from "../../lib/registrationDraft";

type AuthBridgeProps = {
  onNavigate: (page: string) => void;
  onUserIdChange: (userId: string | number | null) => void;
  onUserProfileChange: (
    profile: { fullName?: string | null; email?: string; phone?: string; imageUrl?: string } | null,
  ) => void;
  onAuthReady: () => void;
  currentPage: string;
};

const PUBLIC_PAGES = new Set(["landing", "login"]);

/** After refresh, Clerk rehydrates and this effect runs again — do not overwrite `#/messages` (etc.) with dashboard. */
const PRESERVE_ROUTE_ON_SESSION_HYDRATION = new Set([
  "dashboard",
  "messages",
  "profile",
  "roommates",
  "roommate",
  "accommodation",
  "property",
  "role",
  "onboarding1",
  "onboarding2",
  "onboarding3",
  "onboarding4",
  "owner1",
  "owner2",
  "owner3",
  "owner4",
  "owner5",
]);

export default function AuthBridge({ onNavigate, onUserIdChange, onUserProfileChange, onAuthReady, currentPage }: AuthBridgeProps) {
  const { getToken, isSignedIn } = useAuth();
  const { user, isLoaded } = useUser();
  // Prevents duplicate sign-in processing across re-renders
  const didHandleSignIn = useRef(false);

  // Register the Clerk token getter so every api.* call is authenticated
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  // Keep app auth context in sync with Clerk state
  useEffect(() => {
    if (!isLoaded) return;
    onAuthReady();
    if (isSignedIn && user) {
      onUserIdChange(user.id);
      onUserProfileChange({
        fullName: user.fullName,
        email: user.primaryEmailAddress?.emailAddress,
        phone: user.primaryPhoneNumber?.phoneNumber,
        imageUrl: user.imageUrl,
      });
    } else {
      onUserIdChange(null);
      onUserProfileChange(null);
    }
    // Callbacks are intentionally omitted — they are stable via useCallback in App.tsx
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, user]);

  // On sign-in: sync user record to Supabase, then route to the right page
  useEffect(() => {
    // Reset gate on sign-out so the next sign-in is handled correctly
    if (isLoaded && !isSignedIn) {
      didHandleSignIn.current = false;
      return;
    }
    if (!isLoaded || !isSignedIn || !user) return;
    if (didHandleSignIn.current) return;
    didHandleSignIn.current = true;

    (async () => {
      // Upsert the Clerk user into Supabase (saves clerk_id, email, name, photo).
      // Use the returned Supabase user_id as the app-wide userId so all
      // subsequent API calls use the stable numeric PK, not the Clerk ID string.
      let resolvedUserId: string | number = user.id;
      try {
        const syncResult = await api.syncUser();
        if (syncResult?.data?.user_id) {
          resolvedUserId = syncResult.data.user_id;
          onUserIdChange(resolvedUserId);
        }
      } catch {
        // Non-fatal — continue even if sync fails (e.g. backend has no CLERK_SECRET_KEY)
      }

      // Don't redirect away from public pages (e.g. landing) on auto sign-in
      if (PUBLIC_PAGES.has(currentPage)) return;

      const preserveRoute = PRESERVE_ROUTE_ON_SESSION_HYDRATION.has(currentPage);

      // Determine destination: returning users (role set) → dashboard; new users → role selection
      try {
        const result = await api.getUserDetails(resolvedUserId) as any;
        // If sync failed, recover the stable numeric Supabase user_id from the profile response
        if (result?.data?.numeric_user_id && resolvedUserId === user.id) {
          resolvedUserId = result.data.numeric_user_id;
          onUserIdChange(resolvedUserId);
        }
        const role = result?.data?.basic_info?.role;
        if (role === "seeker" || role === "owner") {
          markOnboardingComplete(role);
        }
        if (preserveRoute) return;

        if (role === "seeker" || role === "owner") {
          onNavigate("dashboard");
        } else {
          onNavigate("role");
        }
      } catch {
        if (preserveRoute) return;
        onNavigate("role");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, user]);

  return null;
}