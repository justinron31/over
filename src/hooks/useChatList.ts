import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/services/supabase/supabase";
import { Profile, RecentChat, RecentChatData } from "@/types/chat";

interface UseChatListProps {
  userId: string | undefined;
}

// Define a payload interface for the message data received from Supabase
interface MessagePayload {
  id?: string;
  content: string;
  sender_id: string;
  receiver_id: string;
  created_at: string;
  read_at?: string | null;
  deleted_at?: string | null;
  edited_at?: string | null;
  [key: string]: unknown; // Use unknown instead of any for additional fields
}

export function useChatList({ userId }: UseChatListProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [filterText, setFilterText] = useState("");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const updateDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingUnreadRef = useRef<boolean>(false);
  const processedChatsRef = useRef<Set<string>>(new Set());

  const fetchProfile = useCallback(async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .eq("id", userId)
        .single();

      if (error) throw error;

      // Properly type assert the data
      if (data) {
        setProfile({
          id: data.id as string,
          username: data.username as string,
          avatar_url: data.avatar_url as string | null,
        });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  }, [userId]);

  const fetchRecentChats = useCallback(async () => {
    if (!userId) return;

    setIsLoadingChats(true);
    try {
      const { data: messagesData, error: messagesError } = await supabase.rpc(
        "get_recent_chats",
        { user_id: userId }
      );

      if (messagesError) throw messagesError;

      if (
        messagesData &&
        Array.isArray(messagesData) &&
        messagesData.length > 0
      ) {
        const userIds = messagesData.map(
          (msg: RecentChatData) => msg.other_user_id
        );
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", userIds);

        if (profilesError) throw profilesError;

        // Ensure profilesData is an array before mapping
        const profiles = Array.isArray(profilesData) ? profilesData : [];

        const chats: RecentChat[] = messagesData.map((msg: RecentChatData) => {
          const userProfile = profiles.find((p) => p.id === msg.other_user_id);

          // Create a properly typed profile object
          const typedProfile: Profile = {
            id: (userProfile?.id as string) || "",
            username: (userProfile?.username as string) || "Unknown User",
            avatar_url: userProfile?.avatar_url as string | null,
            // Only add bio if it exists in profile data
          };

          return {
            profile: typedProfile,
            last_message: {
              content: msg.content || "(Media content)",
              created_at: msg.last_message_time,
              is_read: msg.is_sender ? true : !!msg.read_at,
              is_sender: msg.is_sender,
              deleted: !!msg.deleted_at,
            },
            unread_count: msg.unread_count || 0,
          };
        });

        setRecentChats(chats);
      } else {
        setRecentChats([]);
      }
    } catch (error) {
      console.error("Error fetching recent chats:", error);
      toast.error("Failed to load recent conversations");
    } finally {
      setIsLoadingChats(false);
    }
  }, [userId]);

  const fetchUserProfile = useCallback(async (profileId: string) => {
    setIsLoadingProfile(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, bio")
        .eq("id", profileId)
        .single();

      if (error) throw error;

      // Properly type the profile data
      if (data) {
        setSelectedUser({
          id: data.id as string,
          username: data.username as string,
          avatar_url: data.avatar_url as string | null,
          bio: data.bio as string | undefined,
        });
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
      toast.error("Failed to load user profile");
    } finally {
      setIsLoadingProfile(false);
    }
  }, []);

  // Debounced version of fetchRecentChats to avoid multiple quick refreshes
  const debouncedFetchChats = useCallback(() => {
    // If it's been less than 200ms since the last update, debounce the update
    const now = Date.now();
    if (now - lastUpdateTimeRef.current < 200) {
      if (updateDebounceRef.current) {
        clearTimeout(updateDebounceRef.current);
      }

      updateDebounceRef.current = setTimeout(() => {
        lastUpdateTimeRef.current = Date.now();
        fetchRecentChats();
        updateDebounceRef.current = null;
      }, 200);
    } else {
      lastUpdateTimeRef.current = now;
      fetchRecentChats();
    }
  }, [fetchRecentChats]);

  // Function to update chat list with a new message without refetching all data
  const updateChatListWithMessage = useCallback(
    (messageData: MessagePayload, isFromCurrentUser: boolean) => {
      const otherUserId = isFromCurrentUser
        ? messageData.receiver_id
        : messageData.sender_id;

      setRecentChats((prevChats) => {
        const existingChatIndex = prevChats.findIndex(
          (chat) => chat.profile.id === otherUserId
        );

        const newLastMessage = {
          content: messageData.content,
          created_at: messageData.created_at,
          is_read: isFromCurrentUser,
          is_sender: isFromCurrentUser,
          deleted: !!messageData.deleted_at,
        };

        if (existingChatIndex !== -1) {
          const updatedChats = [...prevChats];
          const chatToUpdate = { ...updatedChats[existingChatIndex] };

          chatToUpdate.last_message = newLastMessage;

          if (!isFromCurrentUser) {
            chatToUpdate.unread_count = (chatToUpdate.unread_count || 0) + 1;

            if (
              document.visibilityState !== "visible" &&
              chatToUpdate.profile.username
            ) {
              toast(`New message from ${chatToUpdate.profile.username}`, {
                description:
                  messageData.content.length > 30
                    ? messageData.content.substring(0, 30) + "..."
                    : messageData.content,
              });
            }
          }

          updatedChats[existingChatIndex] = chatToUpdate;

          const [chatToMove] = updatedChats.splice(existingChatIndex, 1);
          return [chatToMove, ...updatedChats];
        }

        setTimeout(() => {
          fetchRecentChats();
        }, 0);

        return prevChats;
      });
    },
    [fetchRecentChats]
  );

  // Function to mark a chat as read
  const markChatAsRead = useCallback(
    async (profileId: string) => {
      if (!userId || !profileId) return;

      const chatToUpdate = recentChats.find(
        (chat) => chat.profile.id === profileId
      );

      if (!chatToUpdate) {
        return;
      }

      if (!chatToUpdate.unread_count) {
        return;
      }

      try {
        setRecentChats((prevChats) =>
          prevChats.map((chat) =>
            chat.profile.id === profileId ? { ...chat, unread_count: 0 } : chat
          )
        );

        const { error } = await supabase
          .from("messages")
          .update({ read_at: new Date().toISOString() })
          .eq("receiver_id", userId)
          .eq("sender_id", profileId)
          .is("read_at", null);

        if (error) throw error;
      } catch (error) {
        console.error("Error marking chat as read:", error);
        toast.error("Failed to mark messages as read");
      }
    },
    [userId, recentChats]
  );

  // Function to check and update all chats with unread messages
  const checkAndResetUnreadCounts = useCallback(() => {
    if (!userId || isProcessingUnreadRef.current) return;

    // Get chats with unread messages that we haven't processed yet
    const unreadChats = recentChats.filter(
      (chat) =>
        chat.unread_count > 0 && !processedChatsRef.current.has(chat.profile.id)
    );

    if (unreadChats.length === 0) {
      return;
    }

    isProcessingUnreadRef.current = true;

    // Update all chats in one database operation
    const markAllAsRead = async () => {
      try {
        const timestamp = new Date().toISOString();
        const senderIds = unreadChats.map((chat) => chat.profile.id);

        // Track these chats as processed
        senderIds.forEach((id) => processedChatsRef.current.add(id));

        // Mark all unread messages as read in a single query
        const { error } = await supabase
          .from("messages")
          .update({ read_at: timestamp })
          .eq("receiver_id", userId)
          .is("read_at", null)
          .is("deleted_at", null)
          .in("sender_id", senderIds);

        if (error) {
          throw error;
        }

        // Update local state
        setRecentChats((prevChats) => {
          return prevChats.map((chat) => {
            if (chat.unread_count > 0 && senderIds.includes(chat.profile.id)) {
              return {
                ...chat,
                unread_count: 0,
                last_message: {
                  ...chat.last_message,
                  is_read: true,
                },
              };
            }
            return chat;
          });
        });

        isProcessingUnreadRef.current = false;
      } catch (error) {
        console.error("Error in bulk update:", error);
        // Fall back to individual updates through markChatAsRead
        isProcessingUnreadRef.current = false;
        // Remove from processed set on error
        unreadChats.forEach((chat) =>
          processedChatsRef.current.delete(chat.profile.id)
        );
      }
    };

    markAllAsRead();
  }, [userId, recentChats]);

  // Reset the processed chats when we receive new chat data
  useEffect(() => {
    processedChatsRef.current = new Set();
  }, [recentChats.length]);

  // Function to set up the real-time channel
  const setupRealtimeSubscription = useCallback(() => {
    if (!userId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    try {
      const channel = supabase
        .channel(`chat_list_${userId}_${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `sender_id=eq.${userId}`,
          },
          (payload) => {
            updateChatListWithMessage(payload.new as MessagePayload, true);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `receiver_id=eq.${userId}`,
          },
          (payload) => {
            updateChatListWithMessage(payload.new as MessagePayload, false);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
            filter: `sender_id=eq.${userId}`,
          },
          (payload) => {
            const updatedMessage = payload.new as MessagePayload;
            if (updatedMessage.deleted_at || updatedMessage.edited_at) {
              debouncedFetchChats();
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "messages",
            filter: `receiver_id=eq.${userId}`,
          },
          (payload) => {
            const updatedMessage = payload.new as MessagePayload;
            if (updatedMessage.deleted_at || updatedMessage.edited_at) {
              debouncedFetchChats();
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "messages",
            filter: `sender_id=eq.${userId}`,
          },
          () => {
            debouncedFetchChats();
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "messages",
            filter: `receiver_id=eq.${userId}`,
          },
          () => {
            debouncedFetchChats();
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            channel.track({
              user_id: userId,
              online_at: new Date().toISOString(),
            });
          } else if (status === "CHANNEL_ERROR") {
            setTimeout(() => {
              if (channelRef.current === channel) {
                channel.subscribe();
              }
            }, 5000);
          }
        });

      channelRef.current = channel;
    } catch (error) {
      console.error("Error setting up chat list subscription:", error);
    }
  }, [userId, updateChatListWithMessage, debouncedFetchChats]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    fetchRecentChats();

    // Set up the real-time channel
    setupRealtimeSubscription();

    // Add a heartbeat interval to keep the connection alive
    const heartbeatInterval = setInterval(() => {
      if (channelRef.current) {
        try {
          // Send a presence update to keep the connection active
          channelRef.current.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        } catch (error) {
          console.error("Error in chat list heartbeat, reconnecting:", error);

          // Clean up and create a new channel
          if (channelRef.current) {
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
          }

          // Fetch the latest data and reconnect
          fetchRecentChats();
          setupRealtimeSubscription();
        }
      }
    }, 25000); // Check every 25 seconds

    return () => {
      // Clear heartbeat interval
      clearInterval(heartbeatInterval);

      // Clean up subscription
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      // Clean up any pending debounced fetch
      if (updateDebounceRef.current) {
        clearTimeout(updateDebounceRef.current);
        updateDebounceRef.current = null;
      }
    };
  }, [userId, fetchRecentChats, setupRealtimeSubscription]);

  // Add periodic background refresh to ensure chat list stays in sync
  useEffect(() => {
    if (!userId) return;

    // Set up a timer to periodically refresh the chat list
    const refreshTimer = setInterval(() => {
      console.log("Performing background refresh of chat list");
      fetchRecentChats();
    }, 60000); // Every 60 seconds

    return () => {
      clearInterval(refreshTimer);
    };
  }, [userId, fetchRecentChats]);

  // Filter chats based on search text
  const filteredChats = recentChats.filter((chat) =>
    chat.profile.username.toLowerCase().includes(filterText.toLowerCase())
  );

  return {
    profile,
    recentChats: filteredChats,
    isLoadingChats,
    selectedUser,
    setSelectedUser,
    isLoadingProfile,
    fetchUserProfile,
    filterText,
    setFilterText,
    markChatAsRead,
    checkAndResetUnreadCounts,
  };
}
