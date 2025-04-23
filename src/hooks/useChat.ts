import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/services/supabase/supabase";
import { Message, Profile } from "@/types/chat";

interface UseChatProps {
  currentUserId: string | undefined;
  otherUserId: string | undefined;
}

export function useChat({ currentUserId, otherUserId }: UseChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUser, setOtherUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const isInitialSetupDone = useRef(false);
  const lastEventTime = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isDataFetchingRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectCooldownRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestMessageTimeRef = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const cleanupSubscriptions = useCallback(() => {
    if (messageChannelRef.current) {
      supabase.removeChannel(messageChannelRef.current);
      messageChannelRef.current = null;
    }
  }, []);

  // Create stable reference to channel setup function dependencies
  const stableChannelDeps = useRef({
    currentUserId,
    otherUserId,
    otherUser,
    scrollToBottom,
    cleanupSubscriptions,
  });

  // Update stable channel dependencies only when they change significantly
  useEffect(() => {
    stableChannelDeps.current = {
      currentUserId,
      otherUserId,
      otherUser,
      scrollToBottom,
      cleanupSubscriptions,
    };
  }, [
    currentUserId,
    otherUserId,
    otherUser,
    scrollToBottom,
    cleanupSubscriptions,
  ]);

  // Define setupRealtimeSubscriptions with stable deps
  const setupRealtimeSubscriptions = useCallback(() => {
    const {
      currentUserId,
      otherUserId,
      otherUser,
      scrollToBottom,
      cleanupSubscriptions,
    } = stableChannelDeps.current;

    if (!currentUserId || !otherUserId) return;

    // Clean up any existing subscriptions first
    cleanupSubscriptions();

    // Create a channel for message updates using Postgres Changes with better config
    const messageChannel = supabase
      .channel(`messages-${currentUserId}-${otherUserId}`, {
        config: {
          broadcast: { ack: true, self: true }, // Enable self-broadcast for more consistent updates
        },
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `(sender_id=eq.${currentUserId} AND receiver_id=eq.${otherUserId}) OR (sender_id=eq.${otherUserId} AND receiver_id=eq.${currentUserId})`,
        },
        (payload) => {
          console.log("New message received:", payload);

          // First cast to unknown, then to Message
          const newMessage = payload.new as unknown as Message;

          // Only add if not already in the list - handle immediately without delay
          setMessages((prev) => {
            if (prev.some((msg) => msg.id === newMessage.id)) {
              return prev;
            }

            // Show notification if window is not focused and message is from other user
            if (
              newMessage.sender_id !== currentUserId &&
              document.hidden &&
              otherUser
            ) {
              toast(`New message from ${otherUser.username}`, {
                description: newMessage.content,
              });
            }

            const updatedMessages = [...prev, newMessage];
            // Scroll to bottom immediately for new messages with minimal delay
            requestAnimationFrame(scrollToBottom);
            return updatedMessages;
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `(sender_id=eq.${currentUserId} AND receiver_id=eq.${otherUserId}) OR (sender_id=eq.${otherUserId} AND receiver_id=eq.${currentUserId})`,
        },
        (payload) => {
          console.log("Message updated:", payload);

          // First cast to unknown, then to Message
          const updatedMessage = payload.new as unknown as Message;

          setMessages((prev) => {
            // Check if the message exists and actually needs updating
            const messageIndex = prev.findIndex(
              (msg) => msg.id === updatedMessage.id
            );
            if (messageIndex === -1) return prev;

            // Create a new array with the updated message
            const updatedMessages = [...prev];
            updatedMessages[messageIndex] = {
              ...updatedMessages[messageIndex],
              ...updatedMessage,
            };

            return updatedMessages;
          });

          // If currently editing this message and it was updated by someone else, cancel editing
          if (
            editingMessage?.id === updatedMessage.id &&
            updatedMessage.sender_id !== currentUserId
          ) {
            setEditingMessage(null);
            setEditContent("");
            toast.info("This message was edited by the sender");
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `(sender_id=eq.${currentUserId} AND receiver_id=eq.${otherUserId}) OR (sender_id=eq.${otherUserId} AND receiver_id=eq.${currentUserId})`,
        },
        (payload) => {
          console.log("Message deleted:", payload);

          // Get the ID from payload.old safely
          const deletedMessageId = payload.old.id;

          setMessages((prev) => {
            // Only filter if the message exists
            if (!prev.some((msg) => msg.id === deletedMessageId)) return prev;

            // Create a new array without the deleted message
            const filteredMessages = prev.filter(
              (msg) => msg.id !== deletedMessageId
            );
            return filteredMessages;
          });

          // If currently editing the deleted message, cancel editing
          if (editingMessage?.id === deletedMessageId) {
            setEditingMessage(null);
            setEditContent("");
            toast.info("This message was deleted");
          }
        }
      )
      .subscribe((status) => {
        console.log(`Message channel status: ${status}`);
        if (status === "CHANNEL_ERROR") {
          console.error("Failed to subscribe to message updates");
          // Try to reconnect after a delay
          setTimeout(() => {
            if (messageChannelRef.current === messageChannel) {
              messageChannel.subscribe();
            }
          }, 3000);
        }
      });

    // Store channels for cleanup
    messageChannelRef.current = messageChannel;
  }, [editingMessage?.id, setEditingMessage, setEditContent, setMessages]);

  // One central useEffect to handle initialization and cleanup
  useEffect(() => {
    // Reset flags on userId/otherId changes
    isInitialSetupDone.current = false;

    // Set up real-time subscription whenever the user IDs change
    if (currentUserId && otherUserId) {
      // Wait a short time to ensure any previous cleanup is done
      setTimeout(() => {
        if (!isInitialSetupDone.current) {
          setupRealtimeSubscriptions();
          isInitialSetupDone.current = true;
        }
      }, 100);
    }

    // Clean up function for component unmount or ID changes
    return () => {
      // Cleanup all resources
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      if (reconnectCooldownRef.current) {
        clearTimeout(reconnectCooldownRef.current);
        reconnectCooldownRef.current = null;
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      if (messageChannelRef.current) {
        supabase.removeChannel(messageChannelRef.current);
        messageChannelRef.current = null;
      }

      // Reset all refs
      isDataFetchingRef.current = false;
      reconnectAttemptsRef.current = 0;
      lastEventTime.current = null;
      isInitialSetupDone.current = false;
    };
  }, [currentUserId, otherUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create stable reference for fetchInitialData dependencies
  const fetchDeps = useRef({
    currentUserId,
    otherUserId,
    scrollToBottom,
    setupRealtimeSubscriptions,
  });

  // Update stable dependencies
  useEffect(() => {
    fetchDeps.current = {
      currentUserId,
      otherUserId,
      scrollToBottom,
      setupRealtimeSubscriptions,
    };
  }, [currentUserId, otherUserId, scrollToBottom, setupRealtimeSubscriptions]);

  const fetchInitialData = useCallback(async () => {
    const { currentUserId, otherUserId, scrollToBottom } =
      stableChannelDeps.current;

    if (!currentUserId || !otherUserId) {
      setIsLoading(false);
      return;
    }

    // If this is a re-fetch rather than initial fetch, we want to preserve scroll position
    const isRefetch = messages.length > 0;

    // If it's just a re-fetch during polling, don't set loading state
    if (!isRefetch) {
      isDataFetchingRef.current = true;
    }

    // Cancel any existing fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Create a new AbortController for this fetch
    abortControllerRef.current = new AbortController();

    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Use a short debounce to prevent rapid consecutive fetches
    debounceTimerRef.current = setTimeout(async () => {
      try {
        let messagesData: Message[] | null = null;
        let messagesError: Error | { message?: string } | null = null;
        let retryCount = 0;
        const maxRetries = 3;
        const initialMessageLimit = 50; // Load only the most recent 50 messages initially

        // Fetch other user's profile only once
        try {
          const response = await supabase
            .from("profiles")
            .select("id, username, avatar_url, bio")
            .eq("id", otherUserId)
            .single();

          if (response.error) throw response.error;
          if (!response.data) throw new Error("User not found");

          // Validate required fields are present
          if (!response.data.id || typeof response.data.username !== "string") {
            throw new Error("Invalid user data");
          }

          setOtherUser(response.data as Profile);
        } catch (error) {
          console.error("Error fetching user profile:", error);
          if (error instanceof Error) {
            if (error.message === "User not found") {
              setOtherUser(null);
            }
          }
          setIsLoading(false);
          isDataFetchingRef.current = false;
          debounceTimerRef.current = null;
          return;
        }

        while (retryCount < maxRetries) {
          try {
            // Optimize query with an efficient index hint and limit
            const response = await supabase
              .from("messages")
              .select("*")
              .or(
                `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
              )
              .order("created_at", { ascending: false }) // Newest first for pagination
              .limit(initialMessageLimit); // Limit initial load

            // Reverse to get chronological order
            messagesData = (response.data?.reverse() ||
              []) as unknown as Message[];
            messagesError = response.error;

            // If successful, break the retry loop
            if (!messagesError) break;

            // If we got an error that's not related to resources, throw it immediately
            if (
              messagesError &&
              !messagesError.message?.includes("Failed to fetch") &&
              !messagesError.message?.includes("ERR_INSUFFICIENT_RESOURCES")
            ) {
              throw messagesError;
            }
          } catch (error) {
            messagesError = error as Error | { message?: string };
          }

          // Increment retry count and wait before retrying
          retryCount++;
          if (retryCount < maxRetries) {
            // Exponential backoff: wait longer between each retry
            const delay = Math.pow(2, retryCount) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        // If we still have an error after all retries, throw it
        if (messagesError) throw messagesError;

        // Set messages and validate data shape
        if (messagesData) {
          if (Array.isArray(messagesData)) {
            // First convert to unknown, then to Message[]
            setMessages(messagesData as unknown as Message[]);
          } else {
            console.error("Received invalid message data format");
            setMessages([]);
          }
        } else {
          setMessages([]);
        }

        // Set up realtime subscriptions only on initial load
        if (!isInitialSetupDone.current) {
          console.log(
            "Setting up real-time subscriptions from fetchInitialData"
          );
          setupRealtimeSubscriptions();
          isInitialSetupDone.current = true;
        } else {
          console.log("Real-time subscriptions already set up, skipping");
        }

        // Scroll to bottom with slight delay to ensure DOM is updated
        setTimeout(scrollToBottom, 50);
      } catch (error) {
        console.error("Error fetching chat data:", error);
        toast.error("Failed to load chat. Please try again later.");
      } finally {
        setIsLoading(false);
        isDataFetchingRef.current = false;
        debounceTimerRef.current = null;
      }
    }, 100); // Short debounce to prevent multiple rapid calls
  }, [setupRealtimeSubscriptions, messages.length]);

  // Add a function to load more messages when scrolling up
  const loadMoreMessages = useCallback(async () => {
    const { currentUserId, otherUserId } = stableChannelDeps.current;

    if (
      !currentUserId ||
      !otherUserId ||
      messages.length === 0 ||
      isDataFetchingRef.current
    ) {
      return 0;
    }

    isDataFetchingRef.current = true;

    try {
      // Get the oldest message timestamp we currently have
      const oldestMessage = messages[0];

      // Fetch older messages than what we have
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
        )
        .lt("created_at", oldestMessage.created_at) // Get messages older than our oldest
        .order("created_at", { ascending: false })
        .limit(20); // Load 20 more messages

      if (error) throw error;

      if (data && data.length > 0) {
        // Add older messages to the beginning of our list
        setMessages((prevMessages) => [
          ...(data.reverse() as unknown as Message[]),
          ...prevMessages,
        ]);
        return data.length; // Return count of messages loaded
      }

      return 0; // No messages loaded
    } catch (error) {
      console.error("Error loading more messages:", error);
      toast.error("Failed to load more messages");
      return 0;
    } finally {
      isDataFetchingRef.current = false;
    }
  }, [messages]);

  // Create stable reference for markMessagesAsRead dependencies
  const markMessagesDeps = useRef({
    currentUserId,
    otherUserId,
    messages,
  });

  // Update stable dependencies for markMessagesAsRead
  useEffect(() => {
    markMessagesDeps.current = {
      currentUserId,
      otherUserId,
      messages,
    };
  }, [currentUserId, otherUserId, messages]);

  const markMessagesAsRead = useCallback(async () => {
    const { currentUserId, otherUserId, messages } = markMessagesDeps.current;

    if (!currentUserId || !otherUserId) return;

    const unreadMessages = messages.filter(
      (msg) =>
        msg.receiver_id === currentUserId && !msg.read_at && !msg.deleted_at
    );

    if (unreadMessages.length > 0) {
      try {
        const timestamp = new Date().toISOString();

        // Update in database
        const { error } = await supabase
          .from("messages")
          .update({ read_at: timestamp })
          .in(
            "id",
            unreadMessages.map((msg) => msg.id)
          );

        if (error) throw error;

        // Local state will be updated automatically via the Postgres Changes subscription
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    }
  }, []); // Empty dependencies since we use refs

  // Create stable reference for cleanup functions
  const cleanupDeps = useRef({
    cleanupSubscriptions,
  });

  // Update stable cleanup dependencies
  useEffect(() => {
    cleanupDeps.current = {
      cleanupSubscriptions,
    };
  }, [cleanupSubscriptions]);

  const cleanupChat = useCallback(() => {
    // Get stable function reference
    const { cleanupSubscriptions } = cleanupDeps.current;

    // Abort any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Clear any reconnection timeouts
    if (reconnectCooldownRef.current) {
      clearTimeout(reconnectCooldownRef.current);
      reconnectCooldownRef.current = null;
    }

    // Clear debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Reset all state
    isDataFetchingRef.current = false;
    reconnectAttemptsRef.current = 0;
    lastEventTime.current = null;
    isInitialSetupDone.current = false;

    // Clean up realtime subscriptions
    cleanupSubscriptions();

    // Reset all component state
    setMessages([]);
    setOtherUser(null);
    setNewMessage("");
    setEditingMessage(null);
    setEditContent("");
    setIsLoading(false);
  }, []); // No dependencies needed since we use refs

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId || !otherUserId) return;

    const messageContent = newMessage.trim();
    setNewMessage("");

    // Generate a message ID
    const messageId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Create message object for optimistic UI update
    const newMessageObj: Message = {
      id: messageId,
      content: messageContent,
      sender_id: currentUserId,
      receiver_id: otherUserId,
      created_at: timestamp,
      // Add other required fields with default values
      read_at: null,
      deleted_at: null,
      edited_at: null,
      original_content: null,
      deleted_by: null,
    };

    // Optimistically add message to UI immediately
    setMessages((prev) => [...prev, newMessageObj]);

    // Scroll to bottom immediately using requestAnimationFrame for better performance
    requestAnimationFrame(scrollToBottom);

    try {
      // Use upsert with on_conflict to ensure message is added even if there are temporary issues
      const { error } = await supabase.from("messages").upsert(
        {
          id: messageId,
          content: messageContent,
          sender_id: currentUserId,
          receiver_id: otherUserId,
          created_at: timestamp,
        },
        { onConflict: "id" }
      );

      if (error) throw error;

      // The actual message will come through the real-time subscription
      // and will replace our optimistic version if needed
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");

      // Remove the optimistic message on failure
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));

      // Restore the message in the input if it failed
      setNewMessage(messageContent);
    }
  };

  const deleteMessage = async (messageId: string, createdAt: string) => {
    if (!currentUserId) return;

    try {
      // Check if the message is recent (created within the last hour)
      const messageDate = new Date(createdAt);
      const now = new Date();
      const isRecent = now.getTime() - messageDate.getTime() < 3600000; // 1 hour in milliseconds

      if (!isRecent) {
        console.log("Message is too old to delete");
        toast.error("Only recent messages can be deleted");
        return;
      }

      // Get the message being deleted for optimistic UI update
      const messageToDelete = messages.find((msg) => msg.id === messageId);
      if (!messageToDelete) return;

      // Optimistically update UI immediately
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                deleted_at: new Date().toISOString(),
                deleted_by: currentUserId,
              }
            : msg
        )
      );

      // For soft delete, use an UPDATE
      const { error } = await supabase
        .from("messages")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: currentUserId,
        })
        .eq("id", messageId)
        .eq("sender_id", currentUserId); // Only allow deleting own messages

      if (error) {
        // Revert optimistic update on error
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? messageToDelete : msg))
        );
        throw error;
      }

      console.log("Message marked as deleted, waiting for real-time update");
      // The message will be updated in state via the Postgres Changes subscription
    } catch (error) {
      console.error("Error deleting message:", error);
      toast.error("Failed to delete message");
    }
  };

  const editMessage = async (messageId: string) => {
    if (!editContent.trim() || !currentUserId || !editingMessage) return;

    const newContent = editContent.trim();
    const originalContent = editingMessage.content;

    // Store a reference to the original message for potential rollback
    const originalMessage = { ...editingMessage };

    // Optimistically update the UI
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              content: newContent,
              edited_at: new Date().toISOString(),
              original_content: originalContent,
            }
          : msg
      )
    );

    // Clear edit state
    setEditingMessage(null);
    setEditContent("");

    try {
      const { error } = await supabase
        .from("messages")
        .update({
          content: newContent,
          edited_at: new Date().toISOString(),
          original_content: originalContent,
        })
        .eq("id", messageId)
        .eq("sender_id", currentUserId); // Only allow editing own messages

      if (error) {
        // Revert optimistic update on error
        setMessages((prev) =>
          prev.map((msg) => (msg.id === messageId ? originalMessage : msg))
        );
        throw error;
      }

      // The message will be updated in state via the Postgres Changes subscription
    } catch (error) {
      console.error("Error editing message:", error);
      toast.error("Failed to edit message");
    }
  };

  // Clean up subscriptions and reset flag when component unmounts or IDs change
  useEffect(() => {
    return () => {
      cleanupSubscriptions();
      isInitialSetupDone.current = false;
    };
  }, [currentUserId, otherUserId, cleanupSubscriptions]);

  // Fix AbortSignal issues by removing it from queries in fetchLatestMessages
  const fetchLatestMessages = useCallback(async () => {
    if (!currentUserId || !otherUserId || messages.length === 0) return;

    try {
      // Get timestamp of newest message we already have - capture this at the start and don't reference messages again
      const currentMessages = messages;
      const newestMessageTime =
        currentMessages[currentMessages.length - 1].created_at;

      // If we've already fetched for this timestamp, don't fetch again
      if (latestMessageTimeRef.current === newestMessageTime) return;

      // Update the ref with latest timestamp
      latestMessageTimeRef.current = newestMessageTime;

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
        )
        .gt("created_at", newestMessageTime) // Only get newer messages
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Only update if we got new messages
      if (data && data.length > 0) {
        setMessages((prev) => {
          // Make sure we don't add duplicates
          const newMessagesMap = new Map();
          data.forEach((msg) => {
            newMessagesMap.set(msg.id, msg);
          });

          // Filter out duplicates from current messages
          const uniquePrevMessages = prev.filter(
            (msg) => !newMessagesMap.has(msg.id)
          );

          // Combine with new messages
          const updatedMessages = [
            ...uniquePrevMessages,
            ...(data as unknown as Message[]),
          ];

          // Update the latest message time ref after adding new messages
          if (updatedMessages.length > 0) {
            latestMessageTimeRef.current =
              updatedMessages[updatedMessages.length - 1].created_at;
          }

          // Scroll to bottom if new messages were added
          requestAnimationFrame(scrollToBottom);

          return updatedMessages;
        });
      }
    } catch (error) {
      console.error("Error fetching new messages:", error);
    }
  }, [currentUserId, otherUserId, messages, scrollToBottom]); // Keep messages in dependencies but use safely

  return {
    messages,
    otherUser,
    isLoading,
    editingMessage,
    setEditingMessage,
    editContent,
    setEditContent,
    newMessage,
    setNewMessage,
    messagesEndRef,
    fetchInitialData,
    fetchLatestMessages,
    markMessagesAsRead,
    sendMessage,
    deleteMessage,
    editMessage,
    cleanupChat,
    loadMoreMessages,
    setMessages,
  };
}
