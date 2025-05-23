import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { UserAuth, usePresence } from "@/contexts";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { MessageItem } from "@/components/chat/MessageItem";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { UserProfileDialog } from "@/components/chat/UserProfileDialog";
import { useChat } from "@/hooks/useChat";
import { supabase } from "@/services/supabase/supabase";
import { Message } from "@/types/chat";

// Interface for message payload received from real-time events
interface MessagePayload {
  id: string;
  content: string;
  sender_id: string;
  receiver_id: string;
  created_at: string;
  read_at?: string | null;
  deleted_at?: string | null;
  edited_at?: string | null;
  original_content?: string | null;
  deleted_by?: string | null;
  [key: string]: unknown;
}

export default function ChatRoom() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { session } = UserAuth();
  const { isUserOnline, getLastSeen } = usePresence();
  const [showProfile, setShowProfile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadAttempted, setIsLoadAttempted] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const hasInitialized = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const directChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  // Track if we're currently editing for real-time conflict resolution
  const currentEditingMessageIdRef = useRef<string | null>(null);

  const {
    messages,
    setMessages,
    otherUser,
    isLoading,
    newMessage,
    setNewMessage,
    editingMessage,
    setEditingMessage,
    editContent,
    setEditContent,
    messagesEndRef,
    fetchInitialData,
    fetchLatestMessages,
    markMessagesAsRead,
    sendMessage: hookSendMessage,
    deleteMessage: hookDeleteMessage,
    editMessage: hookEditMessage,
    cleanupChat,
    loadMoreMessages,
  } = useChat({
    currentUserId: session?.user?.id,
    otherUserId: userId,
  });

  // Enhanced edit message handler
  const handleEditMessage = useCallback(
    (message: Message) => {
      // Store the message ID being edited for real-time conflict detection
      currentEditingMessageIdRef.current = message.id;

      // Set the editing message and populate the edit content with original text
      setEditingMessage(message);
      setEditContent(message.content);
    },
    [setEditingMessage, setEditContent]
  );

  // Enhanced save edit handler with toast
  const handleSaveEdit = useCallback(
    async (messageId: string) => {
      try {
        // Clear the editing reference before saving
        currentEditingMessageIdRef.current = null;

        await hookEditMessage(messageId);
        toast.success("Message edited successfully");
      } catch (error) {
        console.error("Error editing message:", error);
        toast.error("Failed to edit message");

        // Reset the editing reference to allow retrying
        currentEditingMessageIdRef.current = messageId;
      }
    },
    [hookEditMessage]
  );

  // Handle canceling edit
  const handleCancelEdit = useCallback(() => {
    // Clear the editing reference when canceling
    currentEditingMessageIdRef.current = null;
    setEditingMessage(null);
    setEditContent("");
  }, [setEditingMessage, setEditContent]);

  // Enhanced delete handler with toast
  const handleDeleteMessage = useCallback(
    async (messageId: string, createdAt: string) => {
      try {
        // If we're currently editing this message, cancel the edit
        if (currentEditingMessageIdRef.current === messageId) {
          currentEditingMessageIdRef.current = null;
          setEditingMessage(null);
          setEditContent("");
        }

        await hookDeleteMessage(messageId, createdAt);
        toast.success("Message deleted");
      } catch (error) {
        console.error("Error deleting message:", error);
        toast.error("Failed to delete message");
      }
    },
    [hookDeleteMessage, setEditingMessage, setEditContent]
  );

  // Enhanced send message with toast
  const handleSendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMessage.trim() || !session?.user?.id || !userId) return;

      const content = newMessage.trim();
      setNewMessage("");

      try {
        const messageId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        if (directChannelRef.current) {
          directChannelRef.current.send({
            type: "broadcast",
            event: "message",
            payload: {
              message_id: messageId,
              content: content,
              sender_id: session.user.id,
              receiver_id: userId,
              created_at: timestamp,
            },
          });
        }

        await hookSendMessage(e);
      } catch (error) {
        console.error("Error sending message:", error);
        toast.error("Failed to send message");
      }
    },
    [hookSendMessage, newMessage, session?.user?.id, userId, setNewMessage]
  );

  // Memoize navigation to avoid unnecessary rerenders
  const handleBack = useCallback(() => {
    navigate("/chat");
  }, [navigate]);

  // Memoize profile toggle to avoid unnecessary rerenders
  const toggleProfile = useCallback(() => {
    setShowProfile((prev) => !prev);
  }, []);

  // Handle scroll to load more messages
  const handleScroll = useCallback(async () => {
    const container = messagesContainerRef.current;
    if (!container || isLoadingMore) return;

    // If user scrolls near the top (100px threshold), load more messages
    if (container.scrollTop < 100) {
      setIsLoadingMore(true);

      // Save current scroll position and height before loading more
      prevScrollHeightRef.current = container.scrollHeight;

      // Load more messages
      const messagesLoaded = await loadMoreMessages();

      setIsLoadingMore(false);

      // If no messages were loaded, no need to adjust scroll
      if (messagesLoaded === 0) return;

      // After loading, restore scroll position
      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          const heightDifference =
            newScrollHeight - prevScrollHeightRef.current;
          container.scrollTop = heightDifference > 0 ? heightDifference : 0;
        }
      });
    }
  }, [isLoadingMore, loadMoreMessages]);

  // Handle adding new message to the state
  const handleNewMessage = useCallback(
    (newMessage: MessagePayload) => {
      // Convert to Message type
      const messageObj: Message = {
        id: newMessage.id,
        content: newMessage.content,
        sender_id: newMessage.sender_id,
        receiver_id: newMessage.receiver_id,
        created_at: newMessage.created_at,
        read_at: newMessage.read_at || null,
        deleted_at: newMessage.deleted_at || null,
        edited_at: newMessage.edited_at || null,
        original_content: newMessage.original_content || null,
        deleted_by: newMessage.deleted_by || null,
      };

      console.log("Adding new message to chat room state:", messageObj);

      // Add to message list if not already there
      setMessages((prevMessages: Message[]) => {
        // Check if message already exists
        if (prevMessages.some((msg: Message) => msg.id === messageObj.id)) {
          return prevMessages;
        }

        const updatedMessages = [...prevMessages, messageObj];

        // Scroll to bottom for new messages
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);

        return updatedMessages;
      });
    },
    [setMessages, messagesEndRef]
  );

  // Handle updating an existing message
  const handleMessageUpdate = useCallback(
    (updatedMessage: MessagePayload) => {
      // Check if we're currently editing this message
      if (currentEditingMessageIdRef.current === updatedMessage.id) {
        // If someone else deleted or edited this message while we're editing, show a notification
        if (updatedMessage.sender_id !== session?.user?.id) {
          if (updatedMessage.deleted_at) {
            toast.info("This message was deleted by the sender");
            setEditingMessage(null);
            setEditContent("");
            currentEditingMessageIdRef.current = null;
          } else if (updatedMessage.edited_at) {
            toast.info("This message was edited by the sender");
            // Update our edit content to match the new content
            setEditContent(updatedMessage.content);
          }
        }
      }

      console.log("Updating existing message in chat room:", updatedMessage);

      setMessages((prevMessages: Message[]) => {
        // Find the message in the current state
        const messageIndex = prevMessages.findIndex(
          (msg: Message) => msg.id === updatedMessage.id
        );

        // If message doesn't exist, don't update
        if (messageIndex === -1) return prevMessages;

        // Create a new array with the updated message
        const updatedMessages = [...prevMessages];
        updatedMessages[messageIndex] = {
          ...updatedMessages[messageIndex],
          content: updatedMessage.content,
          read_at:
            updatedMessage.read_at || updatedMessages[messageIndex].read_at,
          deleted_at:
            updatedMessage.deleted_at ||
            updatedMessages[messageIndex].deleted_at,
          edited_at:
            updatedMessage.edited_at || updatedMessages[messageIndex].edited_at,
          original_content:
            updatedMessage.original_content ||
            updatedMessages[messageIndex].original_content,
          deleted_by:
            updatedMessage.deleted_by ||
            updatedMessages[messageIndex].deleted_by,
        };

        return updatedMessages;
      });
    },
    [setMessages, session?.user?.id, setEditingMessage, setEditContent]
  );

  // Handle message deletion
  const handleMessageDelete = useCallback(
    (deletedMessageId: string) => {
      // If we're currently editing this message, cancel the edit
      if (currentEditingMessageIdRef.current === deletedMessageId) {
        setEditingMessage(null);
        setEditContent("");
        currentEditingMessageIdRef.current = null;
        toast.info("This message was deleted");
      }

      console.log("Deleting message from chat room:", deletedMessageId);

      setMessages((prevMessages: Message[]) => {
        // Check if message exists in our state
        const messageIndex = prevMessages.findIndex(
          (msg: Message) => msg.id === deletedMessageId
        );

        // If message doesn't exist, don't update
        if (messageIndex === -1) return prevMessages;

        // For hard deletes, remove the message
        // For soft deletes, this will be handled by update events
        return prevMessages.filter(
          (msg: Message) => msg.id !== deletedMessageId
        );
      });
    },
    [setMessages, setEditingMessage, setEditContent]
  );

  // Set up direct channel for faster real-time updates
  const setupDirectMessagesChannel = useCallback(() => {
    if (!session?.user?.id || !userId) return;

    if (directChannelRef.current) {
      supabase.removeChannel(directChannelRef.current);
      directChannelRef.current = null;
    }

    try {
      const directChannel = supabase
        .channel("global_messages_direct")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `(sender_id=eq.${session.user.id} AND receiver_id=eq.${userId}) OR (sender_id=eq.${userId} AND receiver_id=eq.${session.user.id})`,
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              handleNewMessage(payload.new as MessagePayload);
            } else if (payload.eventType === "UPDATE") {
              handleMessageUpdate(payload.new as MessagePayload);
            } else if (payload.eventType === "DELETE" && payload.old) {
              handleMessageDelete(payload.old.id as string);
            }
          }
        )
        .subscribe();

      directChannelRef.current = directChannel;
    } catch (error) {
      console.error("Error setting up direct messages channel:", error);
    }
  }, [
    session?.user?.id,
    userId,
    handleNewMessage,
    handleMessageUpdate,
    handleMessageDelete,
  ]);

  // Set up dedicated realtime channel for this chat room
  const setupChatRoomChannel = useCallback(() => {
    if (!session?.user?.id || !userId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channelName = `chat_room_${session.user.id}_${userId}_${Date.now()}`;

    try {
      const channel = supabase.channel(channelName, {
        config: {
          broadcast: { ack: true, self: true },
          presence: { key: session.user.id },
        },
      });

      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `(sender_id=eq.${session.user.id} AND receiver_id=eq.${userId}) OR (sender_id=eq.${userId} AND receiver_id=eq.${session.user.id})`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            handleNewMessage(payload.new as MessagePayload);
          } else if (payload.eventType === "UPDATE") {
            handleMessageUpdate(payload.new as MessagePayload);
          } else if (payload.eventType === "DELETE" && payload.old) {
            handleMessageDelete(payload.old.id as string);
          }
        }
      );

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.track({
            user_id: session.user.id,
            online_at: new Date().toISOString(),
          });
        } else if (status === "CHANNEL_ERROR") {
          const reconnectDelay = Math.min(3000 * (Math.random() + 1), 8000);
          setTimeout(() => {
            if (channelRef.current === channel) {
              channel.subscribe();
            }
          }, reconnectDelay);
        }
      });

      channelRef.current = channel;
    } catch (error) {
      console.error("Error setting up chat room channel:", error);
    }
  }, [
    session?.user?.id,
    userId,
    handleNewMessage,
    handleMessageUpdate,
    handleMessageDelete,
  ]);

  // Add a global real-time listener for instant updates
  const setupDirectBroadcastChannel = useCallback(() => {
    if (!session?.user?.id || !userId) return;

    if (directChannelRef.current) {
      supabase.removeChannel(directChannelRef.current);
      directChannelRef.current = null;
    }

    try {
      const directChannel = supabase
        .channel(`direct-broadcast-${Date.now()}`)
        .on("broadcast", { event: "message" }, (payload) => {
          if (
            (payload.sender_id === session.user.id &&
              payload.receiver_id === userId) ||
            (payload.sender_id === userId &&
              payload.receiver_id === session.user.id)
          ) {
            const messageObj: MessagePayload = {
              id: payload.message_id,
              content: payload.content,
              sender_id: payload.sender_id,
              receiver_id: payload.receiver_id,
              created_at: payload.created_at,
              read_at: null,
              deleted_at: null,
              edited_at: null,
              original_content: null,
              deleted_by: null,
            };

            handleNewMessage(messageObj);
          }
        })
        .subscribe();

      directChannelRef.current = directChannel;
    } catch (error) {
      console.error("Error setting up direct broadcast channel:", error);
    }
  }, [session?.user?.id, userId, handleNewMessage]);

  useEffect(() => {
    if (!session?.user || !userId) {
      navigate("/chat");
      return;
    }

    // Only fetch initial data when component mounts or userId changes
    const initChat = async () => {
      if (hasInitialized.current) return;
      try {
        setLoadError(null);
        await stableFunctions.current.fetchInitialData();
        hasInitialized.current = true;
      } catch (error) {
        console.error("Failed to initialize chat:", error);
        setLoadError("Error loading chat. Please try again later.");
      } finally {
        setIsLoadAttempted(true);
      }
    };

    // Reset state on userId change
    setIsLoadAttempted(false);
    setLoadError(null);
    hasInitialized.current = false;
    // Reset editing state when changing conversations
    currentEditingMessageIdRef.current = null;
    setEditingMessage(null);
    setEditContent("");

    initChat();

    // Set up chat room channel
    setupChatRoomChannel();

    // Set up direct messages channel for faster updates
    setupDirectMessagesChannel();

    // Set up direct broadcast channel for instant updates
    setupDirectBroadcastChannel();

    // Handle visibility change to mark messages as read when user returns to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        stableFunctions.current.markMessagesAsRead();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Clean up on unmount or when userId changes
    return () => {
      stableFunctions.current.cleanupChat();
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      // Clean up any polling interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      // Clean up realtime channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      // Clean up direct channel
      if (directChannelRef.current) {
        supabase.removeChannel(directChannelRef.current);
        directChannelRef.current = null;
      }

      // Reset editing state
      currentEditingMessageIdRef.current = null;
    };
  }, [
    session?.user,
    userId,
    navigate,
    setupChatRoomChannel,
    setupDirectMessagesChannel,
    setupDirectBroadcastChannel,
    setEditingMessage,
    setEditContent,
  ]);

  // Create stable function references using useRef
  const stableFunctions = useRef({
    fetchInitialData,
    fetchLatestMessages,
    markMessagesAsRead,
    cleanupChat,
  });

  // Update stable function references when they change
  useEffect(() => {
    stableFunctions.current = {
      fetchInitialData,
      fetchLatestMessages,
      markMessagesAsRead,
      cleanupChat,
    };
  }, [fetchInitialData, fetchLatestMessages, markMessagesAsRead, cleanupChat]);

  // Set up scroll event listener
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll]);

  // Create a ref to track if markAsRead has been called
  const markAsReadCalledRef = useRef(false);

  // Use an effect for marking messages as read separately from the main init effect
  useEffect(() => {
    if (
      document.visibilityState === "visible" &&
      !isLoading &&
      messages.length > 0 &&
      stableFunctions.current.markMessagesAsRead
    ) {
      const markAsRead = async () => {
        // Skip if already called for this batch of messages
        if (markAsReadCalledRef.current) return;

        try {
          markAsReadCalledRef.current = true;
          await stableFunctions.current.markMessagesAsRead();

          // Reset the flag after a short delay to allow for potential re-renders
          setTimeout(() => {
            markAsReadCalledRef.current = false;
          }, 100);
        } catch (error) {
          console.error("Error marking messages as read:", error);
          markAsReadCalledRef.current = false;
        }
      };

      markAsRead();
    }
  }, [isLoading, messages.length]);

  // Add a polling mechanism with reduced frequency to ensure messages stay in sync
  useEffect(() => {
    // Only set up polling if we have the necessary IDs and messages are loaded
    if (session?.user?.id && userId && !isLoading && otherUser) {
      // Clear any existing polling interval
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      // Set up a polling interval to fetch new messages as a fallback
      const interval = setInterval(() => {
        // Check if we should poll (only when not fetching data)
        if (!isLoadingMore && stableFunctions.current.fetchLatestMessages) {
          stableFunctions.current.fetchLatestMessages();
        }
      }, 5000); // Poll every 5 seconds (reduced from 2s since we have better real-time now)

      pollingIntervalRef.current = interval;

      // Clean up interval on unmount
      return () => {
        clearInterval(interval);
        pollingIntervalRef.current = null;
      };
    }

    // Return cleanup function even when not setting interval
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [session?.user?.id, userId, isLoading, otherUser, isLoadingMore]);

  // Add channel health check
  useEffect(() => {
    if (!session?.user?.id || !userId) return;

    const channelHealthCheck = setInterval(() => {
      if (!channelRef.current) {
        setupChatRoomChannel();
      }

      if (!directChannelRef.current) {
        setupDirectMessagesChannel();
      }

      try {
        if (channelRef.current) {
          channelRef.current.track({
            user_id: session.user.id,
            online_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error("Error updating presence, reconnecting channel:", error);
        setupChatRoomChannel();
      }
    }, 20000);

    return () => {
      clearInterval(channelHealthCheck);
    };
  }, [
    session?.user?.id,
    userId,
    setupChatRoomChannel,
    setupDirectMessagesChannel,
  ]);

  // Show loading state
  if (isLoading && !isLoadAttempted) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  // Show error state
  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-4">
        <div className="mb-4 text-red-500">{loadError}</div>
        <Button onClick={handleBack} variant="outline">
          Back to Conversations
        </Button>
      </div>
    );
  }

  // If otherUser is not loaded yet but we're still in the process of loading, show spinner
  if (!otherUser && isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  // Ensure otherUser is not null before rendering main UI
  if (!otherUser) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <ChatHeader
        otherUser={otherUser}
        userId={userId!}
        isUserOnline={isUserOnline}
        getLastSeen={getLastSeen}
        onBack={handleBack}
        onProfileClick={toggleProfile}
      />

      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 scroll-smooth"
      >
        <div className="mx-auto max-w-4xl space-y-4">
          {isLoadingMore && (
            <div className="flex justify-center py-2">
              <Spinner size="sm" />
            </div>
          )}

          {messages.map((message) => (
            <MessageItem
              key={`${message.id}-${message.edited_at || ""}-${
                message.deleted_at || ""
              }-${message.read_at || ""}`}
              message={message}
              currentUserId={session?.user?.id || ""}
              onEdit={handleEditMessage}
              onDelete={handleDeleteMessage}
              isEditing={editingMessage?.id === message.id}
              editContent={editContent}
              onEditChange={setEditContent}
              onEditSave={() => handleSaveEdit(message.id)}
              onEditCancel={handleCancelEdit}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t bg-background p-4">
        <form
          onSubmit={handleSendMessage}
          className="mx-auto flex max-w-4xl items-center gap-4"
        >
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button type="submit" disabled={!newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <UserProfileDialog
        open={showProfile}
        onOpenChange={setShowProfile}
        user={otherUser}
        userId={userId!}
        isUserOnline={isUserOnline}
        getLastSeen={getLastSeen}
      />
    </div>
  );
}
