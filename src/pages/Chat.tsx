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
import { Input } from "@/components/ui/input";
import { supabase } from "@/services/supabase/supabase";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio?: string;
}

interface PresenceState {
  [key: string]: boolean;
}

export default function Chat() {
  const navigate = useNavigate();
  const { session, signOut } = UserAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<PresenceState>({});
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!session?.user) return;

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
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

  useEffect(() => {
    if (!session?.user?.id) return;

    // Initialize presence channel
    const channel = supabase.channel("online-users", {
      config: {
        presence: {
          key: session.user.id,
        },
      },
    });

    // Handle presence state changes
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const presenceState: PresenceState = {};

      // Convert presence state to a simple online/offline map
      Object.keys(state).forEach((userId) => {
        presenceState[userId] = true;
      });

      setOnlineUsers(presenceState);
    });

    // Subscribe to the channel and track presence
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ online_at: new Date().toISOString() });
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [session?.user?.id]);

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

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length === 0) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .ilike("username", `%${query}%`)
        .neq("id", session?.user?.id) // Exclude current user
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error("Error searching users:", error);
      toast.error("Failed to search users");
    } finally {
      setIsSearching(false);
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

  const isUserOnline = (userId: string) => {
    return !!onlineUsers[userId];
  };

  const fetchUserProfile = async (userId: string) => {
    setIsLoadingProfile(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, bio")
        .eq("id", userId)
        .single();

      if (error) throw error;

      setSelectedUser(data);
      setShowUserProfile(true);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      toast.error("Failed to load user profile");
    } finally {
      setIsLoadingProfile(false);
    }
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
                  <span className="text-lg font-semibold flex items-center">
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
        <div className="bg-card text-card-foreground shadow rounded-lg p-6 h-[80vh] relative">
          <div className="flex flex-col h-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6 mb-6">
              <h1 className="text-2xl font-bold">Chat</h1>
              <div className="w-full sm:w-1/2 lg:w-1/3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search messages..."
                    className="w-full px-4 py-2 rounded-md border border-input bg-background text-sm focus-visible:ring-1 focus-visible:ring-violet-500 transition-shadow"
                  />
                  <svg
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-muted-foreground text-lg">No messages yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Start a conversation to see messages here
                </p>
              </div>
            </div>
            <Button
              size="icon"
              className="h-12 w-12 rounded-full absolute bottom-6 right-6 shadow-lg hover:shadow-xl transition-all bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => setShowSearchDialog(true)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
            </Button>
          </div>
        </div>
      </main>

      {/* Search Users Dialog */}
      <Dialog open={showSearchDialog} onOpenChange={setShowSearchDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Search Users</DialogTitle>
            <DialogDescription>
              Search for users by their username to start a conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <div className="relative">
              <Input
                placeholder="Search by username..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="max-h-[300px] space-y-2 overflow-y-auto">
              {searchResults.length > 0 ? (
                searchResults.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors cursor-pointer"
                    onClick={() => fetchUserProfile(user.id)}
                  >
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>
                          {getInitials(user.username)}
                        </AvatarFallback>
                      </Avatar>
                      <span
                        className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background ${
                          isUserOnline(user.id) ? "bg-green-500" : "bg-gray-400"
                        }`}
                      />
                    </div>
                    <div className="flex flex-col">
                      <p className="font-medium">{user.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {isUserOnline(user.id) ? "Online" : "Offline"}
                      </p>
                    </div>
                  </div>
                ))
              ) : searchQuery.trim() !== "" && !isSearching ? (
                <p className="text-center text-sm text-muted-foreground py-4">
                  No users found
                </p>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Profile Dialog */}
      <Dialog open={showUserProfile} onOpenChange={setShowUserProfile}>
        <DialogContent className="sm:max-w-[425px]">
          {isLoadingProfile ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : selectedUser ? (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative">
                  <Avatar className="h-24 w-24 ring-2 ring-violet-500 ring-offset-2 ring-offset-background">
                    <AvatarImage src={selectedUser.avatar_url || undefined} />
                    <AvatarFallback>
                      {getInitials(selectedUser.username)}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className={`absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-background ${
                      isUserOnline(selectedUser.id)
                        ? "bg-green-500"
                        : "bg-gray-400"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold">
                    {selectedUser.username}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isUserOnline(selectedUser.id) ? "Online" : "Offline"}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Bio</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {selectedUser.bio || "No bio available"}
                  </p>
                </div>
              </div>

              <div>
                <Button
                  className="w-full"
                  onClick={() => {
                    navigate(`/chat/${selectedUser.id}`);
                    setShowUserProfile(false);
                    setShowSearchDialog(false);
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4 mr-2"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Start Chat
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

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
