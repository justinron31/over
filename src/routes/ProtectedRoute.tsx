import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { UserAuth } from "@/contexts/AuthContext";
import { supabase } from "@/services/supabase/supabase";
import { Spinner } from "@/components/ui/spinner";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { session } = UserAuth();
  const [loading, setLoading] = useState(true);
  const [hasUsername, setHasUsername] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkProfile = async () => {
      try {
        if (!session?.user) {
          navigate("/login");
          return;
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", session.user.id)
          .single();

        if (error) {
          console.error("Error checking profile:", error);
          return;
        }

        setHasUsername(!!profile?.username);
      } catch (error) {
        console.error("Error in checkProfile:", error);
      } finally {
        setLoading(false);
      }
    };

    checkProfile();
  }, [session, navigate]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!hasUsername) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
