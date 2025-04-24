import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/services/supabase/supabase";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProfileAvatar } from "./ProfileAvatar";
import { Profile } from "@/types/chat";

interface UserSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  isUserOnline: (id: string) => boolean;
  getLastSeen: (id: string) => string | null;
  onUserSelect: (user: Profile) => void;
}

export const UserSearchDialog = ({
  open,
  onOpenChange,
  currentUserId,
  isUserOnline,
  getLastSeen,
  onUserSelect,
}: UserSearchDialogProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [open]);

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
        .neq("id", currentUserId) // Exclude current user
        .limit(10);

      if (error) throw error;

      // Proper type casting for the search results
      if (data && Array.isArray(data)) {
        setSearchResults(data as unknown as Profile[]);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error("Error searching users:", error);
      toast.error("Failed to search users");
    } finally {
      setIsSearching(false);
    }
  };

  const handleUserClick = (user: Profile) => {
    onUserSelect(user);
    onOpenChange(false); // Close the dialog after selection
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                  onClick={() => handleUserClick(user)}
                >
                  <ProfileAvatar
                    avatarUrl={user.avatar_url}
                    username={user.username}
                    showOnlineStatus
                    isOnline={isUserOnline(user.id)}
                  />
                  <div className="flex flex-col">
                    <p className="font-medium">{user.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {isUserOnline(user.id)
                        ? "Online"
                        : formatLastSeen(getLastSeen(user.id))}
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
  );
};
