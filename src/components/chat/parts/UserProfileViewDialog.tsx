import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ProfileAvatar } from "./ProfileAvatar";
import { Profile } from "@/types/chat";

interface UserProfileViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: Profile | null;
  isLoading: boolean;
  isUserOnline: (id: string) => boolean;
  getLastSeen: (id: string) => string | null;
  onStartChat: () => void;
}

export const UserProfileViewDialog = ({
  open,
  onOpenChange,
  user,
  isLoading,
  isUserOnline,
  getLastSeen,
  onStartChat,
}: UserProfileViewDialogProps) => {
  // Format the last seen time in 12-hour format with AM/PM
  const formatLastSeen = (lastSeenTime: string | null) => {
    if (!lastSeenTime) return "Offline";

    try {
      return `Last seen at ${format(new Date(lastSeenTime), "h:mm a")}`;
    } catch (error) {
      console.error("Error formatting last seen time:", error);
      return "Offline";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : user ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <ProfileAvatar
                avatarUrl={user.avatar_url}
                username={user.username}
                size="xl"
                showOnlineStatus
                isOnline={isUserOnline(user.id)}
                className="ring-2 ring-violet-500 ring-offset-2 ring-offset-background"
              />
              <div className="space-y-1">
                <h2 className="text-2xl font-bold">{user.username}</h2>
                <p className="text-sm text-muted-foreground">
                  {isUserOnline(user.id)
                    ? "Online"
                    : formatLastSeen(getLastSeen(user.id))}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Bio</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {user.bio || "No bio available"}
                </p>
              </div>
            </div>

            <div>
              <Button className="w-full" onClick={onStartChat}>
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
  );
};
