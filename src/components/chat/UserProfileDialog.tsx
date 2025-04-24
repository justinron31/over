import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Profile } from "@/types/chat";

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: Profile | null;
  userId: string;
  isUserOnline: (id: string) => boolean;
  getLastSeen: (id: string) => string | null;
}

export const UserProfileDialog = ({
  open,
  onOpenChange,
  user,
  userId,
  isUserOnline,
  getLastSeen,
}: UserProfileDialogProps) => {
  if (!user) return null;

  const getInitials = (username: string) => {
    return username
      .split(/[-_\s]/)
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const lastSeen = getLastSeen(userId);
  const formattedLastSeen = lastSeen
    ? format(new Date(lastSeen), "h:mm a 'on' MMM d, yyyy")
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>User Profile</DialogTitle>
          <DialogDescription>
            View profile information for {user?.username}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-4 pt-4">
          <Avatar className="h-24 w-24">
            <AvatarImage src={user?.avatar_url || undefined} />
            <AvatarFallback>{getInitials(user.username)}</AvatarFallback>
          </Avatar>
          <h2 className="text-2xl font-bold">{user?.username}</h2>
          <p className="text-sm text-muted-foreground">
            {isUserOnline(userId)
              ? "Online"
              : `Last seen at ${formattedLastSeen}`}
          </p>
          <div className="w-full space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Bio</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {user?.bio || "No bio available"}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
