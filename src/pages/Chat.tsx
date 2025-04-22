import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UserAuth } from "@/contexts/AuthContext";
import { ModeToggle } from "@/components/theme/themeToggle";
import { toast } from "sonner";

export default function Chat() {
  const navigate = useNavigate();
  const { session, signOut } = UserAuth();

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header with user info and sign out */}
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">
                  Signed in as:
                </span>
                <span className="text-sm font-medium text-foreground">
                  {session?.user?.email}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <ModeToggle />
              <Button
                variant="outline"
                onClick={handleSignOut}
                className="text-sm"
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
          {/* Add your chat implementation here */}
          <p className="text-muted-foreground">Chat content will go here...</p>
        </div>
      </main>
    </div>
  );
}
