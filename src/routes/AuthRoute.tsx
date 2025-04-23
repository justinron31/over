import { Navigate } from "react-router-dom";
import { UserAuth } from "@/contexts/AuthContext";

interface AuthRouteProps {
  children: React.ReactNode;
}

const AuthRoute = ({ children }: AuthRouteProps) => {
  const { session } = UserAuth();

  // If user is authenticated, redirect to chat
  if (session) {
    return <Navigate to="/chat" replace />;
  }

  // If not authenticated, show the auth pages (login/register)
  return <>{children}</>;
};

export default AuthRoute;
