import { create } from "zustand";

interface AuthState {
  email: string;
  password: string;
  confirmPassword: string;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  setConfirmPassword: (confirmPassword: string) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  email: "",
  password: "",
  confirmPassword: "",
  setEmail: (email) => set({ email }),
  setPassword: (password) => set({ password }),
  setConfirmPassword: (confirmPassword) => set({ confirmPassword }),
  reset: () => set({ email: "", password: "", confirmPassword: "" }),
}));
