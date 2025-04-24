import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/theme/themeToggle";
import { ProfileAvatar } from "./ProfileAvatar";
import { Profile } from "@/types/chat";

interface ChatListHeaderProps {
  profile: Profile | null;
  onSignOutClick: () => void;
}

export const ChatListHeader = ({
  profile,
  onSignOutClick,
}: ChatListHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            {profile && (
              <button
                onClick={() => navigate("/profile")}
                className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors duration-200"
              >
                <ProfileAvatar
                  avatarUrl={profile.avatar_url}
                  username={profile.username}
                  className="ring-2 ring-violet-500 ring-offset-2 ring-offset-background"
                />
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
              onClick={onSignOutClick}
              className="text-sm hover:bg-violet-600 hover:text-white transition-colors"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
