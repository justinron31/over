import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { router } from "./routes/router.tsx";
import { AuthContextProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./components/theme/themeProvider";
import { PresenceProvider } from "./contexts/PresenceContext";

import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthContextProvider>
        <PresenceProvider>
          <RouterProvider router={router} />
          <Toaster position="top-center" />
        </PresenceProvider>
      </AuthContextProvider>
    </ThemeProvider>
  </StrictMode>
);
