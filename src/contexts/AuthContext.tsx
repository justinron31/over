import { createContext, useContext, useEffect, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseAdmin } from "../services/supabase/supabase";

interface DeleteUserDataResponse {
  success: boolean;
  message?: string;
}

interface AuthContextType {
  signUpNewUser: (
    email: string,
    password: string
  ) => Promise<{
    success: boolean;
    data?: { user: User | null };
    error?: Error | null;
  }>;
  signInUser: (
    email: string,
    password: string
  ) => Promise<{
    success: boolean;
    data?: { user: User | null };
    error?: string;
  }>;
  session: Session | null;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthContextProviderProps {
  children: React.ReactNode;
}

export const AuthContextProvider: React.FC<AuthContextProviderProps> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);

  // Sign up
  const signUpNewUser = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.toLowerCase(),
      password: password,
    });

    if (error) {
      console.error("Error signing up: ", error);
      return { success: false, error };
    }

    return { success: true, data };
  };

  // Sign in
  const signInUser = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password: password,
      });

      // Handle Supabase error explicitly
      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err) {
      // Handle unexpected issues
      const error = err as Error;
      console.error("Unexpected error during sign-in:", error.message);
      return {
        success: false,
        error: "An unexpected error occurred. Please try again.",
      };
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Cleanup subscription on unmount
    return () => subscription.unsubscribe();
  }, []);

  // Sign out
  const signOut = async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
    }
  };

  // Delete account
  const deleteAccount = async () => {
    if (!session?.user) {
      return { success: false, error: "No user session found" };
    }

    try {
      // First verify the user exists
      const { data: profile, error: profileCheckError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", session.user.id)
        .single();

      if (profileCheckError || !profile) {
        console.error("Profile check error:", profileCheckError);
        return { success: false, error: "User profile not found" };
      }

      // Call our database function to delete user data first
      const { data, error: deleteDataError } = await supabase.rpc(
        "delete_user_data",
        {
          input_user_id: session.user.id,
        }
      );
      const deleteData = data as DeleteUserDataResponse;

      if (deleteDataError || (deleteData && !deleteData.success)) {
        console.error(
          "Error deleting user data:",
          deleteDataError || deleteData?.message
        );
        throw new Error(
          deleteDataError?.message ||
            deleteData?.message ||
            "Failed to delete user data"
        );
      }

      // Delete the actual auth user using the admin client
      const { error: deleteAuthError } =
        await supabaseAdmin.auth.admin.deleteUser(session.user.id);

      if (deleteAuthError) {
        console.error("Error deleting auth user:", deleteAuthError);
        return {
          success: false,
          error: "Failed to delete account completely",
        };
      }

      // Sign out after successful deletion
      await signOut();
      return { success: true };
    } catch (error) {
      console.error("Error deleting account:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete account. Please try again.",
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{ signUpNewUser, signInUser, session, signOut, deleteAccount }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const UserAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthContextProvider");
  }
  return context;
};
