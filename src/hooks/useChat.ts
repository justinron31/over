import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/services/supabase/supabase";
import { Message, Profile } from "@/types/chat";

// Add a type import for the Supabase RealtimeChannel options
import { RealtimeChannelOptions } from "@supabase/supabase-js";

interface UseChatProps {
  currentUserId: string | undefined;
  otherUserId: string | undefined;
}

// Update BroadcastPayload type to include edit and delete operations
interface BroadcastPayload {
  type: "broadcast";
  event: string;
  payload: {
    type:
      | "new_message"
      | "edit_message"
      | "delete_message"
      | "connection_test"
      | "heartbeat";
    message?: Message;
    messageId?: string;
    userId?: string;
    timestamp?: string;
    content?: string;
  };
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
  const allChannelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const cleanupSubscriptions = useCallback(() => {
    allChannelsRef.current.forEach((channel) => {
      try {
        supabase.removeChannel(channel);
      } catch (error) {
        console.error("Error removing channel:", error);
      }
    });

    allChannelsRef.current = [];

    messageChannelRef.current = null;
  }, []);

  const stableChannelDeps = useRef({
    currentUserId,
    otherUserId,
    otherUser,
    scrollToBottom,
    cleanupSubscriptions,
  });

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

  const createAndTrackChannel = useCallback(
    (channelName: string, options?: RealtimeChannelOptions) => {
      const channel = supabase.channel(channelName, options);
      allChannelsRef.current.push(channel);
      return channel;
    },
    []
  );

  // First define the handlers
  const handleNewMessage = useCallback((payload: RealtimePayload) => {
    const newMessage = payload.new as unknown as Message;

    if (!newMessage || !newMessage.id) {
      console.error("Invalid message received in real-time event:", newMessage);
      return;
    }

    setMessages((prev) => {
      if (prev.some((msg) => msg.id === newMessage.id)) {
        return prev;
      }

      const { currentUserId, otherUser } = stableChannelDeps.current;

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

      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });

      return updatedMessages;
    });
  }, []);

  // Handle updating an existing message
  const handleMessageUpdate = useCallback(
    (payload: RealtimePayload) => {
      // Check if we're currently editing this message
      const updatedMessage = payload.new as unknown as Message;
      console.log("Processing message update:", updatedMessage);

      setMessages((prev) => {
        // Find the message in the current state
        const messageIndex = prev.findIndex(
          (msg) => msg.id === updatedMessage.id
        );

        // If message doesn't exist, don't update
        if (messageIndex === -1) return prev;

        // Create a new array with the updated message
        const updatedMessages = [...prev];
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

      // Handle editing state if this message is being edited
      if (
        editingMessage?.id === updatedMessage.id &&
        updatedMessage.sender_id !== stableChannelDeps.current.currentUserId
      ) {
        setEditingMessage(null);
        setEditContent("");
        toast.info("This message was edited by the sender");
      }
    },
    [editingMessage?.id]
  );

  // Handle message deletion
  const handleMessageDelete = useCallback(
    (payload: RealtimePayload) => {
      // Get the ID from payload.old safely
      if (!payload.old || !payload.old.id) {
        console.error("Message deleted payload missing ID");
        return;
      }

      const deletedMessageId = payload.old.id;
      console.log("Processing message deletion:", deletedMessageId);

      setMessages((prev) => {
        // Check if message exists in our state
        const messageIndex = prev.findIndex(
          (msg) => msg.id === deletedMessageId
        );

        // If message doesn't exist, don't update
        if (messageIndex === -1) return prev;

        // For hard deletes, remove the message
        // For soft deletes, this will be handled by update events
        return prev.filter((msg) => msg.id !== deletedMessageId);
      });

      // Clean up editing state if this message was being edited
      if (editingMessage?.id === deletedMessageId) {
        setEditingMessage(null);
        setEditContent("");
        toast.info("This message was deleted");
      }
    },
    [editingMessage?.id]
  );

  // Then define setupRealtimeSubscriptions using the handlers
  const setupRealtimeSubscriptions = useCallback(() => {
    const { currentUserId, otherUserId } = stableChannelDeps.current;

    if (!currentUserId || !otherUserId) return;

    cleanupSubscriptions();

    try {
      const channelName = `chat:${[currentUserId, otherUserId]
        .sort()
        .join(":")}`;

      const messageChannel = createAndTrackChannel(channelName, {
        config: {
          broadcast: {
            self: true,
            ack: true,
          },
          presence: {
            key: currentUserId,
          },
        },
      });

      messageChannel
        .on("broadcast", { event: "message" }, (payload: BroadcastPayload) => {
          if (
            payload.payload?.type === "new_message" &&
            payload.payload.message
          ) {
            const realtimePayload: RealtimePayload = {
              new: payload.payload.message as unknown as Record<
                string,
                unknown
              >,
              eventType: "INSERT",
              schema: "public",
              table: "messages",
              commit_timestamp: payload.payload.message.created_at,
            };
            handleNewMessage(realtimePayload);
          } else if (
            payload.payload?.type === "edit_message" &&
            payload.payload.message
          ) {
            const realtimePayload: RealtimePayload = {
              new: payload.payload.message as unknown as Record<
                string,
                unknown
              >,
              eventType: "UPDATE",
              schema: "public",
              table: "messages",
              commit_timestamp:
                payload.payload.message.edited_at || new Date().toISOString(),
            };
            handleMessageUpdate(realtimePayload);
          } else if (
            payload.payload?.type === "delete_message" &&
            payload.payload.message
          ) {
            const realtimePayload: RealtimePayload = {
              new: payload.payload.message as unknown as Record<
                string,
                unknown
              >,
              old: { id: payload.payload.message.id },
              eventType: "DELETE",
              schema: "public",
              table: "messages",
              commit_timestamp:
                payload.payload.message.deleted_at || new Date().toISOString(),
            };
            handleMessageDelete(realtimePayload);
          }
        })
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "messages",
            filter: `(sender_id=eq.${currentUserId} AND receiver_id=eq.${otherUserId}) OR (sender_id=eq.${otherUserId} AND receiver_id=eq.${currentUserId})`,
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              handleNewMessage(payload);
            } else if (payload.eventType === "UPDATE") {
              handleMessageUpdate(payload);
            } else if (payload.eventType === "DELETE") {
              handleMessageDelete(payload);
            }
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            messageChannel.send({
              type: "broadcast",
              event: "message",
              payload: {
                type: "connection_test",
                userId: currentUserId,
                timestamp: new Date().toISOString(),
              },
            });
          }
        });

      messageChannelRef.current = messageChannel;

      messageChannel.track({
        user_id: currentUserId,
        online_at: new Date().toISOString(),
      });

      const heartbeatInterval = setInterval(() => {
        if (messageChannel) {
          messageChannel.send({
            type: "broadcast",
            event: "heartbeat",
            payload: {
              userId: currentUserId,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }, 30000);

      return () => {
        clearInterval(heartbeatInterval);
      };
    } catch (error) {
      console.error("Error setting up real-time subscriptions:", error);
    }
  }, [
    cleanupSubscriptions,
    createAndTrackChannel,
    handleNewMessage,
    handleMessageUpdate,
    handleMessageDelete,
  ]);

  const fetchInitialData = useCallback(async () => {
    const { currentUserId, otherUserId, scrollToBottom } =
      stableChannelDeps.current;

    if (!currentUserId || !otherUserId) {
      setIsLoading(false);
      return;
    }

    const isRefetch = messages.length > 0;

    if (!isRefetch) {
      isDataFetchingRef.current = true;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    abortControllerRef.current = new AbortController();

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        let messagesData: Message[] | null = null;
        let messagesError: Error | { message?: string } | null = null;
        let retryCount = 0;
        const maxRetries = 3;
        const initialMessageLimit = 50;

        try {
          const response = await supabase
            .from("profiles")
            .select("id, username, avatar_url, bio")
            .eq("id", otherUserId)
            .single();

          if (response.error) throw response.error;
          if (!response.data) throw new Error("User not found");

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
            const response = await supabase
              .from("messages")
              .select("*")
              .or(
                `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
              )
              .order("created_at", { ascending: false })
              .limit(initialMessageLimit);

            messagesData = (response.data?.reverse() ||
              []) as unknown as Message[];
            messagesError = response.error;

            if (!messagesError) break;

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

          retryCount++;
          if (retryCount < maxRetries) {
            const delay = Math.pow(2, retryCount) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }

        if (messagesError) throw messagesError;

        if (messagesData) {
          if (Array.isArray(messagesData)) {
            setMessages(messagesData as unknown as Message[]);
          } else {
            console.error("Received invalid message data format");
            setMessages([]);
          }
        } else {
          setMessages([]);
        }

        if (!isInitialSetupDone.current) {
          setupRealtimeSubscriptions();
          isInitialSetupDone.current = true;
        }

        setTimeout(scrollToBottom, 50);
      } catch (error) {
        console.error("Error fetching chat data:", error);
        toast.error("Failed to load chat. Please try again later.");
      } finally {
        setIsLoading(false);
        isDataFetchingRef.current = false;
        debounceTimerRef.current = null;
      }
    }, 100);
  }, [setupRealtimeSubscriptions, messages.length]);

  useEffect(() => {
    if (currentUserId && otherUserId) {
      fetchInitialData();
    }
  }, [currentUserId, otherUserId, fetchInitialData]);

  interface RealtimePayload {
    new: Record<string, unknown>;
    old?: Record<string, unknown>;
    eventType: "INSERT" | "UPDATE" | "DELETE";
    schema: string;
    table: string;
    commit_timestamp: string;
  }

  useEffect(() => {
    isInitialSetupDone.current = false;

    if (currentUserId && otherUserId) {
      cleanupSubscriptions();

      setupRealtimeSubscriptions();
      isInitialSetupDone.current = true;
    }

    return () => {
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

      cleanupSubscriptions();

      isInitialSetupDone.current = false;
      reconnectAttemptsRef.current = 0;
    };
  }, [
    currentUserId,
    otherUserId,
    setupRealtimeSubscriptions,
    cleanupSubscriptions,
  ]);

  const fetchDeps = useRef({
    currentUserId,
    otherUserId,
    scrollToBottom,
    setupRealtimeSubscriptions,
  });

  useEffect(() => {
    fetchDeps.current = {
      currentUserId,
      otherUserId,
      scrollToBottom,
      setupRealtimeSubscriptions,
    };
  }, [currentUserId, otherUserId, scrollToBottom, setupRealtimeSubscriptions]);

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
      const oldestMessage = messages[0];

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
        )
        .lt("created_at", oldestMessage.created_at)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      if (data && data.length > 0) {
        setMessages((prevMessages) => [
          ...(data.reverse() as unknown as Message[]),
          ...prevMessages,
        ]);
        return data.length;
      }

      return 0;
    } catch (error) {
      console.error("Error loading more messages:", error);
      toast.error("Failed to load more messages");
      return 0;
    } finally {
      isDataFetchingRef.current = false;
    }
  }, [messages]);

  const markMessagesDeps = useRef({
    currentUserId,
    otherUserId,
    messages,
  });

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

        const { error } = await supabase
          .from("messages")
          .update({ read_at: timestamp })
          .in(
            "id",
            unreadMessages.map((msg) => msg.id)
          );

        if (error) throw error;
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    }
  }, []);

  const cleanupDeps = useRef({
    cleanupSubscriptions,
  });

  useEffect(() => {
    cleanupDeps.current = {
      cleanupSubscriptions,
    };
  }, [cleanupSubscriptions]);

  const cleanupChat = useCallback(() => {
    const { cleanupSubscriptions } = cleanupDeps.current;

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

    isDataFetchingRef.current = false;
    reconnectAttemptsRef.current = 0;
    lastEventTime.current = null;
    isInitialSetupDone.current = false;

    cleanupSubscriptions();

    setMessages([]);
    setOtherUser(null);
    setNewMessage("");
    setEditingMessage(null);
    setEditContent("");
    setIsLoading(false);
  }, []);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentUserId || !otherUserId) return;

    const messageContent = newMessage.trim();
    setNewMessage("");

    const messageId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const messageData = {
      id: messageId,
      content: messageContent,
      sender_id: currentUserId,
      receiver_id: otherUserId,
      created_at: timestamp,
      read_at: null,
      deleted_at: null,
      edited_at: null,
      original_content: null,
      deleted_by: null,
    };

    try {
      if (messageChannelRef.current) {
        messageChannelRef.current.send({
          type: "broadcast",
          event: "message",
          payload: {
            type: "new_message",
            message: messageData,
          },
        });
      }

      setMessages((prev) => [...prev, messageData]);

      const { error: insertError } = await supabase
        .from("messages")
        .insert(messageData);

      if (insertError) {
        const { error: upsertError } = await supabase
          .from("messages")
          .upsert(messageData);

        if (upsertError) {
          throw upsertError;
        }
      }

      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");

      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      setNewMessage(messageContent);
    }
  };

  const editMessage = async (messageId: string) => {
    if (!editContent.trim() || !currentUserId || !editingMessage) return;

    const newContent = editContent.trim();
    const originalContent = editingMessage.content;
    const timestamp = new Date().toISOString();

    const updatedMessage = {
      ...editingMessage,
      content: newContent,
      edited_at: timestamp,
      original_content: originalContent,
    };

    // Optimistically update the UI
    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? updatedMessage : msg))
    );

    // Clear edit state
    setEditingMessage(null);
    setEditContent("");

    try {
      // Broadcast the edit for immediate update
      if (messageChannelRef.current) {
        messageChannelRef.current.send({
          type: "broadcast",
          event: "message",
          payload: {
            type: "edit_message",
            message: updatedMessage,
          },
        });
      }

      // Update in database
      const { error } = await supabase
        .from("messages")
        .update({
          content: newContent,
          edited_at: timestamp,
          original_content: originalContent,
        })
        .eq("id", messageId)
        .eq("sender_id", currentUserId);

      if (error) throw error;
    } catch (error) {
      console.error("Error editing message:", error);
      toast.error("Failed to edit message");

      // Revert the optimistic update
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? editingMessage : msg))
      );
      setEditingMessage(editingMessage);
      setEditContent(newContent);
    }
  };

  const deleteMessage = async (messageId: string, createdAt: string) => {
    if (!currentUserId) return;

    try {
      const messageDate = new Date(createdAt);
      const now = new Date();
      const isRecent = now.getTime() - messageDate.getTime() < 3600000;

      if (!isRecent) {
        console.log("Message is too old to delete");
        toast.error("Only recent messages can be deleted");
        return;
      }

      const messageToDelete = messages.find((msg) => msg.id === messageId);
      if (!messageToDelete) return;

      const timestamp = new Date().toISOString();
      const updatedMessage = {
        ...messageToDelete,
        deleted_at: timestamp,
        deleted_by: currentUserId,
      };

      // Optimistically update UI
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? updatedMessage : msg))
      );

      // Broadcast the delete for immediate update
      if (messageChannelRef.current) {
        messageChannelRef.current.send({
          type: "broadcast",
          event: "message",
          payload: {
            type: "delete_message",
            message: updatedMessage,
          },
        });
      }

      // Update in database
      const { error } = await supabase
        .from("messages")
        .update({
          deleted_at: timestamp,
          deleted_by: currentUserId,
        })
        .eq("id", messageId)
        .eq("sender_id", currentUserId);

      if (error) throw error;
    } catch (error) {
      console.error("Error deleting message:", error);
      toast.error("Failed to delete message");

      // Revert the optimistic update
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? messages.find((m) => m.id === messageId)! : msg
        )
      );
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

  // Add a heartbeat mechanism to ensure real-time is working
  useEffect(() => {
    if (!currentUserId || !otherUserId || !isInitialSetupDone.current) return;

    // Create a heartbeat interval to verify the real-time connection
    const heartbeatInterval = setInterval(() => {
      // Check if the messageChannel is still active
      if (!messageChannelRef.current) {
        console.log("No active real-time channel found, reconnecting...");
        setupRealtimeSubscriptions();
        return;
      }

      try {
        // Use a safer method to check channel status
        const channel = messageChannelRef.current;
        console.log("Checking real-time channel health...");

        // Send a presence update to keep the connection active
        channel.track({
          user_id: currentUserId,
          online_at: new Date().toISOString(),
        });

        // Check subscription status
        channel.subscribe((status) => {
          console.log(`Channel health check status: ${status}`);
          if (status !== "SUBSCRIBED") {
            console.warn(
              `Channel not properly subscribed (status: ${status}). Reconnecting...`
            );
            cleanupSubscriptions();
            setupRealtimeSubscriptions();
          }
        });
      } catch (error) {
        console.error("Error checking channel health, reconnecting:", error);
        cleanupSubscriptions();
        setupRealtimeSubscriptions();
      }
    }, 15000); // Check every 15 seconds

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [
    currentUserId,
    otherUserId,
    setupRealtimeSubscriptions,
    cleanupSubscriptions,
    fetchInitialData,
  ]);

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
