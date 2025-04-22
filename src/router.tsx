import { createBrowserRouter } from "react-router-dom";

import App from "./App.tsx";
import Login from "./pages/Login.tsx";

import NotFoundPage from "./NotFoundPage.tsx";

export const router = createBrowserRouter([
  { path: "/", element: <App /> },
  { path: "/login", element: <Login /> },
  { path: "*", element: <NotFoundPage /> },
]);
