import { createBrowserRouter, Navigate } from "react-router-dom";

import App from "../App.tsx";
import Login from "../pages/Login.tsx";
import Register from "../pages/Register.tsx";
import ResetPassword from "../pages/ResetPassword.tsx";

import NotFoundPage from "../pages/NotFoundPage.tsx";
import Chat from "../pages/Chat.tsx";
import ChatRoom from "../pages/ChatRoom.tsx";
import Onboarding from "../pages/Onboarding.tsx";
import Profile from "../pages/Profile.tsx";
import ProtectedRoute from "./ProtectedRoute.tsx";
import AuthRoute from "./AuthRoute.tsx";
import ResetPasswordRoute from "./ResetPasswordRoute.tsx";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        path: "/",
        element: <Navigate to="/login" replace />,
      },
      {
        path: "/login",
        element: (
          <AuthRoute>
            <Login />
          </AuthRoute>
        ),
      },
      {
        path: "/register",
        element: (
          <AuthRoute>
            <Register />
          </AuthRoute>
        ),
      },
      {
        path: "/reset-password",
        element: (
          <ResetPasswordRoute>
            <ResetPassword />
          </ResetPasswordRoute>
        ),
      },
      {
        path: "/onboarding",
        element: <Onboarding />,
      },
      {
        path: "/chat",
        element: (
          <ProtectedRoute>
            <Chat />
          </ProtectedRoute>
        ),
      },
      {
        path: "/chat/:userId",
        element: (
          <ProtectedRoute>
            <ChatRoom />
          </ProtectedRoute>
        ),
      },
      {
        path: "/profile",
        element: (
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        ),
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);
