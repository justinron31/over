import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { router } from "./router.tsx";
import { AuthContextProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./components/theme/themeProvider";

import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthContextProvider>
        <RouterProvider router={router} />
        <Toaster richColors position="top-center" />
      </AuthContextProvider>
    </ThemeProvider>
  </StrictMode>
);
