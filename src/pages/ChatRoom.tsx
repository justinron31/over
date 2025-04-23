import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { UserAuth } from "@/contexts/AuthContext";
import { supabase } from "@/services/supabase/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Send, Trash2, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PostgrestError } from "@supabase/supabase-js";

interface Message {
  id: string;
  content: string;
  sender_id: string;
  receiver_id: string;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  edited_at: string | null;
  original_content: string | null;
}

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio?: string;
}

interface TypingStatus {
  user_id: string;
  chat_with: string;
  is_typing: boolean;
}

let typingTimeout: NodeJS.Timeout;

export default function ChatRoom() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { session } = UserAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState("");

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Mark messages as read when they're viewed
  useEffect(() => {
    if (!session?.user || !messages.length) return;

    const unreadMessages = messages.filter(
      (msg) =>
        msg.receiver_id === session.user.id && !msg.read_at && !msg.deleted_at
    );

    if (unreadMessages.length > 0) {
      unreadMessages.forEach(async (msg) => {
        await supabase
          .from("messages")
          .update({ read_at: new Date().toISOString() })
          .eq("id", msg.id);
      });
    }
  }, [messages, session?.user]);

  useEffect(() => {
    if (!session?.user || !userId) {
      navigate("/chat");
      return;
    }

    // Fetch other user's profile
    const fetchOtherUser = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username, avatar_url, bio")
          .eq("id", userId)
          .single();

        if (error) throw error;
        setOtherUser(data);
      } catch (error) {
        console.error("Error fetching user:", error);
        toast.error("Failed to load user");
        navigate("/chat");
      }
    };

    // Fetch existing messages
    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .or(
            `and(sender_id.eq.${session.user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${session.user.id})`
          )
          .order("created_at", { ascending: true });

        if (error) throw error;
        setMessages(data || []);
      } catch (error) {
        console.error("Error fetching messages:", error);
        toast.error("Failed to load messages");
      } finally {
        setIsLoading(false);
      }
    };

    fetchOtherUser();
    fetchMessages();

    // Subscribe to new messages and updates
    const channel = supabase
      .channel("chat_room")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `or(and(sender_id.eq.${session.user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${session.user.id}))`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMessages((current) => [...current, payload.new as Message]);
          } else if (payload.eventType === "UPDATE") {
            setMessages((current) =>
              current.map((msg) =>
                msg.id === payload.new.id ? (payload.new as Message) : msg
              )
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "typing_status",
          filter: `user_id.eq.${userId}`,
        },
        (payload: { new: TypingStatus }) => {
          setOtherUserTyping(payload.new.is_typing);
        }
      )
      .subscribe();

    // Initialize typing status
    const initTypingStatus = async () => {
      await supabase.from("typing_status").upsert({
        user_id: session.user.id,
        chat_with: userId,
        is_typing: false,
      });
    };

    initTypingStatus();

    return () => {
      channel.unsubscribe();
    };
  }, [session?.user, userId, navigate]);

  const updateTypingStatus = async (isTyping: boolean) => {
    if (!session?.user || !userId) return;

    await supabase.from("typing_status").upsert({
      user_id: session.user.id,
      chat_with: userId,
      is_typing: isTyping,
    });
  };

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      updateTypingStatus(true);
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      setIsTyping(false);
      updateTypingStatus(false);
    }, 2000);
  };

  const deleteMessage = async (messageId: string, createdAt: string) => {
    try {
      // Check if message is older than 1 minute
      const messageDate = new Date(createdAt);
      const now = new Date();
      const diffInSeconds = (now.getTime() - messageDate.getTime()) / 1000;

      if (diffInSeconds > 60) {
        toast.error("Messages can only be deleted within 1 minute of sending");
        return;
      }

      const { error } = await supabase
        .from("messages")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: session?.user?.id,
        })
        .eq("id", messageId);

      if (error) throw error;
      toast.success("Message deleted");
    } catch (error) {
      if (error instanceof PostgrestError) {
        console.error("Error deleting message:", error.message);
      } else {
        console.error("Error deleting message:", error);
      }
      toast.error("Failed to delete message");
    }
  };

  const editMessage = async (messageId: string) => {
    if (!editContent.trim()) {
      setEditingMessage(null);
      return;
    }

    try {
      const { error } = await supabase
        .from("messages")
        .update({
          content: editContent.trim(),
          edited_at: new Date().toISOString(),
          original_content: editingMessage?.content,
        })
        .eq("id", messageId);

      if (error) throw error;
      setEditingMessage(null);
      setEditContent("");
      toast.success("Message edited");
    } catch (error: unknown) {
      if (error instanceof PostgrestError) {
        console.error("Error editing message:", error.message);
      } else if (error instanceof Error) {
        console.error("Error editing message:", error.message);
      } else {
        console.error("Error editing message:", error);
      }
      toast.error("Failed to edit message");
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !session?.user || !otherUser) return;

    try {
      const { error } = await supabase.from("messages").insert({
        content: newMessage.trim(),
        sender_id: session.user.id,
        receiver_id: otherUser.id,
      });

      if (error) throw error;
      setNewMessage("");
      updateTypingStatus(false);
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
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

  if (!otherUser || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/chat")}
              className="mr-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <button
              onClick={() => setShowProfile(true)}
              className="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-accent transition-colors"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={otherUser.avatar_url || undefined} />
                <AvatarFallback>
                  {getInitials(otherUser.username)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-semibold text-left">
                  {otherUser.username}
                </h2>
                {otherUserTyping && (
                  <p className="text-xs text-muted-foreground">typing...</p>
                )}
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-4xl space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.sender_id === session?.user?.id
                  ? "justify-end"
                  : "justify-start"
              }`}
            >
              <div
                className={`group relative max-w-[70%] rounded-lg px-4 py-2 ${
                  message.sender_id === session?.user?.id
                    ? "bg-violet-500 text-white"
                    : "bg-accent"
                } ${message.deleted_at ? "opacity-50" : ""}`}
              >
                {message.deleted_at ? (
                  <p className="italic text-sm">Message deleted</p>
                ) : editingMessage?.id === message.id ? (
                  <div className="flex flex-col gap-2">
                    <Input
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="bg-background/50 border-0"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingMessage(null)}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => editMessage(message.id)}>
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
                          message.sender_id === session?.user?.id
                            ? "text-violet-100"
                            : "text-muted-foreground"
                        }`}
                      >
                        {format(new Date(message.created_at), "hh:mm a")}
                      </p>
                      {message.sender_id === session?.user?.id && (
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
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditingMessage(message);
                                  setEditContent(message.content);
                                }}
                              >
                                Edit Message
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  deleteMessage(message.id, message.created_at)
                                }
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
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Message Input */}
      <div className="border-t bg-background p-4">
        <form
          onSubmit={sendMessage}
          className="mx-auto flex max-w-4xl items-center gap-4"
        >
          <Input
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button type="submit" disabled={!newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {/* Profile Dialog */}
      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-4 pt-4">
            <Avatar className="h-24 w-24">
              <AvatarImage src={otherUser.avatar_url || undefined} />
              <AvatarFallback>{getInitials(otherUser.username)}</AvatarFallback>
            </Avatar>
            <h2 className="text-2xl font-bold">{otherUser.username}</h2>
            <div className="w-full space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Bio</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {otherUser.bio || "No bio available"}
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
