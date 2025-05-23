import { memo, useCallback } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { ProfileAvatar } from "./ProfileAvatar";
import { RecentChat } from "@/types/chat";
import { UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatListItemProps {
  chat: RecentChat;
  isUserOnline: (id: string) => boolean;
  onClick: () => void;
  onProfileClick?: () => void;
}

const ChatListItemComponent = ({
  chat,
  isUserOnline,
  onClick,
  onProfileClick,
}: ChatListItemProps) => {
  // Format message timestamp - memoize to avoid recalculation
  const formatMessageTime = useCallback((timestamp: string) => {
    const date = new Date(timestamp);
    if (isToday(date)) {
      return format(date, "h:mm a");
    } else if (isYesterday(date)) {
      return "Yesterday";
    } else {
      return format(date, "MM/dd/yyyy");
    }
  }, []);

  const handleProfileClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering the parent onClick
      if (onProfileClick) {
        onProfileClick();
      }
    },
    [onProfileClick]
  );

  // Determine if user is online once, not on every render
  const isOnline = isUserOnline(chat.profile.id);

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
        chat.unread_count > 0
          ? "bg-violet-50 dark:bg-violet-900/20"
          : "hover:bg-accent"
      }`}
    >
      <div className="flex items-center space-x-3 flex-1 min-w-0">
        <ProfileAvatar
          avatarUrl={chat.profile.avatar_url}
          username={chat.profile.username}
          showOnlineStatus
          isOnline={isOnline}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="font-semibold truncate">{chat.profile.username}</p>
            <p className="text-xs text-muted-foreground ml-2">
              {formatMessageTime(chat.last_message.created_at)}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
              {chat.last_message.deleted
                ? "Message deleted"
                : `${chat.last_message.is_sender ? "You: " : ""}${
                    chat.last_message.content
                  }`}
            </p>
            {chat.unread_count > 0 && (
              <span className="ml-2 bg-violet-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {chat.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>

      {onProfileClick && (
        <Button
          variant="ghost"
          size="icon"
          className="ml-2"
          onClick={handleProfileClick}
          title="View profile"
        >
          <UserCircle className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

// Use memo to prevent unnecessary rerenders, but ensure it's responsive to real-time updates
export const ChatListItem = memo(
  ChatListItemComponent,
  (prevProps, nextProps) => {
    // Check if any essential properties have changed
    return (
      prevProps.chat.profile.id === nextProps.chat.profile.id &&
      prevProps.chat.last_message.created_at ===
        nextProps.chat.last_message.created_at &&
      prevProps.chat.last_message.content ===
        nextProps.chat.last_message.content &&
      prevProps.chat.unread_count === nextProps.chat.unread_count
    );
  }
);
