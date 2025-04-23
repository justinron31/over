import { Navigate, useLocation } from "react-router-dom";
import { UserAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface ResetPasswordRouteProps {
  children: React.ReactNode;
}

const ResetPasswordRoute = ({ children }: ResetPasswordRouteProps) => {
  const { session } = UserAuth();
  const location = useLocation();

  // Check if we have a recovery token in the URL
  const hasRecoveryToken = location.hash.includes("type=recovery");

  // If no recovery token and no session, redirect to login
  if (!hasRecoveryToken && !session) {
    toast.error("Invalid or missing reset password link");
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ResetPasswordRoute;
