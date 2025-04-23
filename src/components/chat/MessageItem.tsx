import { memo, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Check, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Message } from "@/types/chat";

interface MessageItemProps {
  message: Message;
  currentUserId: string;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string, createdAt: string) => void;
  isEditing: boolean;
  editContent: string;
  onEditChange: (content: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
}

const MessageItemComponent = ({
  message,
  currentUserId,
  onEdit,
  onDelete,
  isEditing,
  editContent,
  onEditChange,
  onEditSave,
  onEditCancel,
}: MessageItemProps) => {
  const isOwnMessage = message.sender_id === currentUserId;
  const prevReadAtRef = useRef<string | null>(message.read_at);
  const prevContentRef = useRef<string>(message.content);
  const prevDeletedAtRef = useRef<string | null>(message.deleted_at);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isJustEdited, setIsJustEdited] = useState(false);

  // Monitor status changes for visual feedback and logging
  useEffect(() => {
    // Check for message being marked as read
    if (
      isOwnMessage &&
      !prevReadAtRef.current &&
      message.read_at &&
      document.visibilityState === "visible"
    ) {
      console.log("Message marked as read:", {
        schema: "public",
        table: "messages",
        commit_timestamp: new Date().toISOString(),
        eventType: "UPDATE",
        new: { ...message },
        old: { ...message, read_at: null },
        errors: null,
      });
    }

    // Check for message being edited
    if (prevContentRef.current !== message.content && message.edited_at) {
      console.log("Message content updated:", {
        schema: "public",
        table: "messages",
        commit_timestamp: new Date().toISOString(),
        eventType: "UPDATE",
        new: { ...message },
        old: { ...message, content: prevContentRef.current, edited_at: null },
        errors: null,
      });

      // Highlight edited messages briefly
      if (!isJustEdited) {
        setIsJustEdited(true);
        setTimeout(() => setIsJustEdited(false), 2000);
      }
    }

    // Check for message being deleted
    if (!prevDeletedAtRef.current && message.deleted_at) {
      console.log("Message was deleted:", {
        schema: "public",
        table: "messages",
        commit_timestamp: new Date().toISOString(),
        eventType: "UPDATE",
        new: { ...message },
        old: { ...message, deleted_at: null },
        errors: null,
      });

      // Add fade-out animation effect for deleted messages
      setIsDeleting(true);
      setTimeout(() => setIsDeleting(false), 500);
    }

    // Update refs for next comparison
    prevReadAtRef.current = message.read_at;
    prevContentRef.current = message.content;
    prevDeletedAtRef.current = message.deleted_at;
  }, [message, isOwnMessage, isJustEdited]);

  // Apply dynamic classes for visual feedback
  const messageClasses = `group relative max-w-[70%] rounded-lg px-4 py-2
    ${isOwnMessage ? "bg-violet-500 text-white" : "bg-accent"}
    ${message.deleted_at ? "opacity-50" : ""}
    ${isDeleting ? "animate-fade-out" : ""}
    ${isJustEdited ? "animate-pulse" : ""}
    transition-all duration-200`;

  return (
    <div className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
      <div className={messageClasses}>
        {message.deleted_at ? (
          <p className="italic text-sm">Message deleted</p>
        ) : isEditing ? (
          <div className="flex flex-col gap-2">
            <Input
              value={editContent}
              onChange={(e) => onEditChange(e.target.value)}
              className="bg-background/50 border-0"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={onEditCancel}>
                Cancel
              </Button>
              <Button size="sm" onClick={onEditSave}>
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="break-words">{message.content}</p>
            {message.edited_at && (
              <p className="text-xs italic mt-1">(edited)</p>
            )}
            <div className="mt-1 flex items-center justify-end gap-2">
              <p
                className={`text-xs ${
                  isOwnMessage ? "text-violet-100" : "text-muted-foreground"
                }`}
              >
                {format(new Date(message.created_at), "hh:mm a")}
              </p>
              {isOwnMessage && (
                <>
                  {message.read_at ? (
                    <CheckCheck className="h-3 w-3 text-violet-100" />
                  ) : (
                    <Check className="h-3 w-3 text-violet-100" />
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(message)}>
                        Edit Message
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(message.id, message.created_at)}
                        className="text-destructive"
                      >
                        Delete Message
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Use memo to prevent unnecessary re-renders
// Only re-render when props actually change
export const MessageItem = memo(
  MessageItemComponent,
  (prevProps, nextProps) => {
    // Return true if we should NOT re-render (props are equal)
    // Always re-render deleted or edited messages to ensure animations work
    if (nextProps.message.deleted_at !== prevProps.message.deleted_at)
      return false;
    if (nextProps.message.edited_at !== prevProps.message.edited_at)
      return false;

    // Check other important fields
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.message.read_at !== nextProps.message.read_at) return false;
    if (prevProps.message.content !== nextProps.message.content) return false;
    if (prevProps.isEditing !== nextProps.isEditing) return false;
    if (prevProps.editContent !== nextProps.editContent) return false;
    if (prevProps.currentUserId !== nextProps.currentUserId) return false;

    // Additional checks to ensure proper re-rendering
    if (
      JSON.stringify(prevProps.message) !== JSON.stringify(nextProps.message)
    ) {
      return false;
    }

    return true;
  }
);
