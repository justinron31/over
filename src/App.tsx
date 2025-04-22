import React from "react";
import { ThemeProvider } from "./components/theme/themProvider";

function App({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        {children}
      </ThemeProvider>
    </>
  );
}

export default App;
