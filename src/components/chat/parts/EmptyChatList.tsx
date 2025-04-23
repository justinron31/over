import { MessageSquare } from "lucide-react";

export const EmptyChatList = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <MessageSquare className="w-16 h-16 text-muted-foreground mb-4" />
      <p className="text-muted-foreground text-lg">No conversations yet</p>
      <p className="text-sm text-muted-foreground mt-2">
        Start a conversation by searching for users
      </p>
    </div>
  );
};
