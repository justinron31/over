import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ProfileAvatarProps {
  avatarUrl: string | null | undefined;
  username: string;
  size?: "sm" | "md" | "lg" | "xl";
  showOnlineStatus?: boolean;
  isOnline?: boolean;
  className?: string;
}

export const ProfileAvatar = ({
  avatarUrl,
  username,
  size = "md",
  showOnlineStatus = false,
  isOnline = false,
  className = "",
}: ProfileAvatarProps) => {
  // Get initials from username for avatar fallback
  const getInitials = (username: string) => {
    return username
      .split(/[-_\s]/)
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-16 w-16",
    xl: "h-24 w-24",
  };

  const statusSize = {
    sm: "h-2 w-2",
    md: "h-3 w-3",
    lg: "h-3.5 w-3.5",
    xl: "h-4 w-4",
  };

  return (
    <div className="relative">
      <Avatar className={`${sizeClasses[size]} ${className}`}>
        <AvatarImage src={avatarUrl || undefined} />
        <AvatarFallback>{getInitials(username)}</AvatarFallback>
      </Avatar>
      {showOnlineStatus && (
        <span
          className={`absolute bottom-0 right-0 ${
            statusSize[size]
          } rounded-full border-2 border-background ${
            isOnline ? "bg-green-500" : "bg-gray-400"
          }`}
        />
      )}
    </div>
  );
};
