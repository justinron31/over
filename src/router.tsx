import { createBrowserRouter } from "react-router-dom";

import App from "./App.tsx";
import Login from "./pages/Login.tsx";
import Register from "./pages/Register.tsx";

import NotFoundPage from "./pages/NotFoundPage.tsx";

export const router = createBrowserRouter([
  { path: "/", element: <Login /> },
  { path: "/chat", element: <App /> },
  { path: "/login", element: <Login /> },
  { path: "/register", element: <Register /> },
  { path: "*", element: <NotFoundPage /> },
]);
