import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UserAuth } from "@/contexts/AuthContext";
import { ModeToggle } from "@/components/theme/themeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/services/supabase/supabase";
import { toast } from "sonner";

interface Profile {
  username: string;
  avatar_url: string | null;
}

export default function Chat() {
  const navigate = useNavigate();
  const { session, signOut } = UserAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!session?.user) return;

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("username, avatar_url")
          .eq("id", session.user.id)
          .single();

        if (error) throw error;
        setProfile(data);
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    };

    fetchProfile();
  }, [session]);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out successfully");
      navigate("/login");
    } catch (error) {
      toast.error("Error signing out. Please try again.");
      console.error("Error signing out:", error);
    }
  };

  // Get initials from username for avatar fallback
  const getInitials = (username: string) => {
    return username
      .split(/[-_\s]/)
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              {profile && (
                <button
                  onClick={() => navigate("/profile")}
                  className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors duration-200"
                >
                  <Avatar className="h-10 w-10 ring-2 ring-violet-500 ring-offset-2 ring-offset-background">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback>
                      {getInitials(profile.username)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-semibold flex items-center">
                    <span className="bg-gradient-to-r from-violet-500 to-violet-700 bg-clip-text text-transparent mr-0.5">
                      @
                    </span>
                    {profile.username}
                  </span>
                </button>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <ModeToggle />
              <Button
                variant="secondary"
                onClick={() => setShowSignOutDialog(true)}
                className="text-sm hover:bg-violet-600 hover:text-white transition-colors"
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Chat content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-card text-card-foreground shadow rounded-lg p-6">
          <h1 className="text-2xl font-bold mb-4">Chat</h1>
          <p className="text-muted-foreground">In-Development bro...</p>
        </div>
      </main>

      <Dialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Sign Out Confirmation</DialogTitle>
            <DialogDescription>
              Are you sure you want to sign out? You will need to sign in again
              to access your account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex space-x-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowSignOutDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowSignOutDialog(false);
                handleSignOut();
              }}
            >
              Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
