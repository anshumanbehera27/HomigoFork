import { useCallback, useEffect, useMemo, useState } from "react";
import LandingPage from "./pages/LandingPage";
import LoginSignup from "./pages/LoginSignup";
import RoleSelection from "./pages/RoleSelection";
import Dashboard from "./pages/Dashboard";
import RoommateFinder from "./pages/RoommateFinder";
import AccommodationSearch from "./pages/AccommodationSearch";
import PropertyDetailPage from "./pages/PropertyDetailPage";
import RoommateDetailPage from "./pages/RoommateDetailPage";
import Messages from "./pages/Messages";
import UserProfile from "./pages/UserProfile";
import Step1Registration from "./pages/onboarding/Step1Registration";
import Step2PhotoUpload from "./pages/onboarding/Step2PhotoUpload";
import Step3Preferences from "./pages/onboarding/Step3Preferences";
import Step4Complete from "./pages/onboarding/Step4Complete";
import OwnerStep1Registration from "./pages/owner/Step1Registration";
import Step2Profile from "./pages/owner/Step2Profile";
import Step3PropertySetup from "./pages/owner/Step3PropertySetup";
import Step4KYC from "./pages/owner/Step4KYC";
import Step5Complete from "./pages/owner/Step5Complete";
import AuthBridge from "./components/auth/AuthBridge";
import { AuthProvider } from "./components/auth/AuthContext";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import TopNavBar from "./components/layout/TopNavBar";

const validPages = new Set([
  "landing",
  "login",
  "role",
  "dashboard",
  "roommates",
  "roommate",
  "accommodation",
  "property",
  "messages",
  "profile",
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

type AppProps = {
  clerkEnabled?: boolean;
};

const publicPages = new Set(["landing", "login", "role"]);
const topNavPages = new Set(["landing", "dashboard", "roommates", "roommate", "accommodation", "property", "messages", "profile"]);

export default function App({ clerkEnabled = false }: AppProps) {
  const initialPage = useMemo(() => {
    const hash = window.location.hash.replace("#/", "");
    if (validPages.has(hash)) return hash;
    window.location.hash = "/landing";
    return "landing";
  }, []);
  const [page, setPage] = useState(initialPage);
  const [authUserId, setAuthUserId] = useState<string | number>(Number(import.meta.env.VITE_DEMO_USER_ID ?? 1));
  const [authUserProfile, setAuthUserProfile] = useState<{ fullName?: string | null; email?: string; phone?: string; imageUrl?: string } | undefined>();
  // In demo mode (no Clerk) auth is always ready; in Clerk mode, wait for Clerk to load
  const [authReady, setAuthReady] = useState(!clerkEnabled);

  const navigate = useCallback((nextPage: string) => {
    setPage(nextPage);
    window.location.hash = `/${nextPage}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleUserIdChange = useCallback((userId: string | number | null) => {
    setAuthUserId(userId ?? Number(import.meta.env.VITE_DEMO_USER_ID ?? 1));
  }, []);

  const handleUserProfileChange = useCallback(
    (profile: { fullName?: string | null; email?: string; phone?: string; imageUrl?: string } | null) => {
      setAuthUserProfile(profile ?? undefined);
    },
    [],
  );

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace("#/", "");
      if (validPages.has(hash)) setPage(hash);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const renderPage = () => {
    switch (page) {
    case "login":
      return <LoginSignup onNavigate={navigate} />;
    case "role":
      return <RoleSelection onNavigate={navigate} />;
    case "dashboard":
      return <Dashboard onNavigate={navigate} />;
    case "roommates":
      return <RoommateFinder onNavigate={navigate} />;
    case "roommate":
      return <RoommateDetailPage onNavigate={navigate} />;
    case "accommodation":
      return <AccommodationSearch onNavigate={navigate} />;
    case "property":
      return <PropertyDetailPage onNavigate={navigate} />;
    case "messages":
      return <Messages onNavigate={navigate} />;
    case "profile":
      return <UserProfile onNavigate={navigate} />;
    case "onboarding1":
      return <Step1Registration onNavigate={navigate} />;
    case "onboarding2":
      return <Step2PhotoUpload onNavigate={navigate} />;
    case "onboarding3":
      return <Step3Preferences onNavigate={navigate} />;
    case "onboarding4":
      return <Step4Complete onNavigate={navigate} />;
    case "owner1":
      return <OwnerStep1Registration onNavigate={navigate} />;
    case "owner2":
      return <Step2Profile onNavigate={navigate} />;
    case "owner3":
      return <Step3PropertySetup onNavigate={navigate} />;
    case "owner4":
      return <Step4KYC onNavigate={navigate} />;
    case "owner5":
      return <Step5Complete onNavigate={navigate} />;
    default:
      return <LandingPage onNavigate={navigate} />;
    }
  };

  const pageElement = renderPage();

  return (
    <AuthProvider value={{ userId: authUserId, isClerkEnabled: clerkEnabled, authReady, userProfile: authUserProfile }}>
      {topNavPages.has(page) && <TopNavBar onNavigate={navigate} />}
      {clerkEnabled && <AuthBridge onNavigate={navigate} onUserIdChange={handleUserIdChange} onUserProfileChange={handleUserProfileChange} onAuthReady={() => setAuthReady(true)} currentPage={page} />}
      {publicPages.has(page) ? pageElement : <ProtectedRoute clerkEnabled={clerkEnabled} onNavigate={navigate}>{pageElement}</ProtectedRoute>}
    </AuthProvider>
  );
}
