import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UserAuth, usePresence } from "@/contexts";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useChatList } from "@/hooks/useChatList";
import { ChatListHeader } from "@/components/chat/parts/ChatListHeader";
import { ChatListItem } from "@/components/chat/parts/ChatListItem";
import { EmptyChatList } from "@/components/chat/parts/EmptyChatList";
import { UserSearchDialog } from "@/components/chat/parts/UserSearchDialog";
import { UserProfileViewDialog } from "@/components/chat/parts/UserProfileViewDialog";
import { SignOutDialog } from "@/components/chat/parts/SignOutDialog";
import { Profile } from "@/types/chat";

export default function Chat() {
  const navigate = useNavigate();
  const { session, signOut } = UserAuth();
  const { isUserOnline, getLastSeen } = usePresence();
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showUserProfile, setShowUserProfile] = useState(false);

  const {
    profile,
    recentChats,
    isLoadingChats,
    selectedUser,
    isLoadingProfile,
    fetchUserProfile,
    filterText,
    setFilterText,
  } = useChatList({ userId: session?.user?.id });

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

  const handleUserSelect = (user: Profile) => {
    if (!user || !user.id) {
      toast.error("Invalid user selected");
      return;
    }

    // Direct navigation to chat room instead of showing profile first
    navigate(`/chat/${user.id}`);
    setShowSearchDialog(false);
  };

  const handleStartChat = () => {
    if (selectedUser) {
      navigate(`/chat/${selectedUser.id}`);
      setShowUserProfile(false);
      setShowSearchDialog(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <ChatListHeader
        profile={profile}
        onSignOutClick={() => setShowSignOutDialog(true)}
      />

      {/* Chat content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-card text-card-foreground shadow rounded-lg p-6 h-[80vh] relative">
          <div className="flex flex-col h-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6 mb-6">
              <h1 className="text-2xl font-bold">Messages</h1>
              <div className="w-full sm:w-1/2 lg:w-1/3">
                <div className="relative">
                  <Input
                    type="text"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="Filter conversations..."
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

            {/* Recent Chats List */}
            <div className="flex-1 overflow-y-auto">
              {isLoadingChats ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                </div>
              ) : recentChats.length > 0 ? (
                <div className="space-y-2">
                  {recentChats.map((chat) => (
                    <ChatListItem
                      key={chat.profile.id}
                      chat={chat}
                      isUserOnline={isUserOnline}
                      onClick={() => navigate(`/chat/${chat.profile.id}`)}
                      onProfileClick={() => {
                        fetchUserProfile(chat.profile.id);
                        setShowUserProfile(true);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <EmptyChatList />
              )}
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

      {/* Dialogs */}
      <UserSearchDialog
        open={showSearchDialog}
        onOpenChange={setShowSearchDialog}
        currentUserId={session?.user?.id || ""}
        isUserOnline={isUserOnline}
        getLastSeen={getLastSeen}
        onUserSelect={handleUserSelect}
      />

      <UserProfileViewDialog
        open={showUserProfile}
        onOpenChange={setShowUserProfile}
        user={selectedUser}
        isLoading={isLoadingProfile}
        isUserOnline={isUserOnline}
        getLastSeen={getLastSeen}
        onStartChat={handleStartChat}
      />

      <SignOutDialog
        open={showSignOutDialog}
        onOpenChange={setShowSignOutDialog}
        onConfirm={handleSignOut}
      />
    </div>
  );
}
