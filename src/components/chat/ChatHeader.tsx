import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Profile } from "@/types/chat";

interface ChatHeaderProps {
  otherUser: Profile;
  userId: string;
  isUserOnline: (id: string) => boolean;
  getLastSeen: (id: string) => string | null;
  onBack: () => void;
  onProfileClick: () => void;
}

export const ChatHeader = ({
  otherUser,
  userId,
  isUserOnline,
  getLastSeen,
  onBack,
  onProfileClick,
}: ChatHeaderProps) => {
  const formatLastSeen = (lastSeenTime: string | null) => {
    if (!lastSeenTime) return "Offline";
    try {
      return `Last seen at ${format(new Date(lastSeenTime), "h:mm a")}`;
    } catch {
      return "Offline";
    }
  };

  const getInitials = (username: string) => {
    return username
      .split(/[-_\s]/)
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="border-b">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="mr-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <button
            onClick={onProfileClick}
            className="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-accent transition-colors"
          >
            <div className="relative">
              <Avatar className="h-10 w-10">
                <AvatarImage src={otherUser?.avatar_url || undefined} />
                <AvatarFallback>
                  {getInitials(otherUser.username)}
                </AvatarFallback>
              </Avatar>
              <span
                className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background ${
                  isUserOnline(userId) ? "bg-green-500" : "bg-gray-400"
                }`}
              />
            </div>
            <div>
              <h2 className="font-semibold text-left">{otherUser.username}</h2>
              <p className="text-xs text-muted-foreground">
                {isUserOnline(userId)
                  ? "Online"
                  : formatLastSeen(getLastSeen(userId))}
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
