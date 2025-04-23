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
        // Check if there's already a chat with this user
        const existingChatIndex = prevChats.findIndex(
          (chat) => chat.profile.id === otherUserId
        );

        // Create a new message object
        const newLastMessage = {
          content: messageData.content,
          created_at: messageData.created_at,
          is_read: isFromCurrentUser, // Current user's messages are considered read
          is_sender: isFromCurrentUser,
          deleted: !!messageData.deleted_at,
        };

        // If there's an existing chat, update it
        if (existingChatIndex !== -1) {
          const updatedChats = [...prevChats];
          const chatToUpdate = { ...updatedChats[existingChatIndex] };

          // Update the last message
          chatToUpdate.last_message = newLastMessage;

          // If this is a message FROM someone else TO the current user, increment unread count
          if (!isFromCurrentUser) {
            chatToUpdate.unread_count = (chatToUpdate.unread_count || 0) + 1;

            // Show a toast notification for new incoming messages
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

          // Move this chat to the top
          const [chatToMove] = updatedChats.splice(existingChatIndex, 1);
          return [chatToMove, ...updatedChats];
        }

        // If we don't have the profile info for this user yet, we'll do a full refetch
        // This ensures we have all the data needed for a new chat entry
        debouncedFetchChats();
        return prevChats;
      });
    },
    [debouncedFetchChats]
  );

  // Function to update chat list with an edited message
  const updateChatListWithEditedMessage = useCallback(
    (messageData: MessagePayload, isFromCurrentUser: boolean) => {
      const otherUserId = isFromCurrentUser
        ? messageData.receiver_id
        : messageData.sender_id;

      setRecentChats((prevChats) => {
        // Check if there's already a chat with this user
        const existingChatIndex = prevChats.findIndex(
          (chat) => chat.profile.id === otherUserId
        );

        // If we don't have a chat with this user, ignore the update
        if (existingChatIndex === -1) return prevChats;

        // Check if this edited message is the most recent one in the chat
        const chat = prevChats[existingChatIndex];

        // Only update if timestamps match (meaning this is the last message)
        // Convert to Date objects for comparison to handle slight format differences
        const editedMessageDate = new Date(messageData.created_at).getTime();
        const lastMessageDate = new Date(
          chat.last_message.created_at
        ).getTime();

        // If the difference is less than 1 second, consider it the same message
        // This handles slight timestamp differences between DB and client
        if (Math.abs(editedMessageDate - lastMessageDate) > 1000) {
          return prevChats;
        }

        // Update the last message with edited content
        const updatedChats = [...prevChats];
        updatedChats[existingChatIndex] = {
          ...chat,
          last_message: {
            ...chat.last_message,
            content: messageData.content,
            deleted: !!messageData.deleted_at,
          },
        };

        return updatedChats;
      });
    },
    []
  );

  // Function to update chat list with a deleted message
  const updateChatListWithDeletedMessage = useCallback(
    (messageData: MessagePayload, isFromCurrentUser: boolean) => {
      const otherUserId = isFromCurrentUser
        ? messageData.receiver_id
        : messageData.sender_id;

      setRecentChats((prevChats) => {
        // Check if there's already a chat with this user
        const existingChatIndex = prevChats.findIndex(
          (chat) => chat.profile.id === otherUserId
        );

        // If we don't have a chat with this user, ignore the update
        if (existingChatIndex === -1) return prevChats;

        // Check if this deleted message is the most recent one in the chat
        const chat = prevChats[existingChatIndex];

        // Only update if timestamps match (meaning this is the last message)
        // Convert to Date objects for comparison to handle slight format differences
        const deletedMessageDate = new Date(messageData.created_at).getTime();
        const lastMessageDate = new Date(
          chat.last_message.created_at
        ).getTime();

        // If the difference is less than 1 second, consider it the same message
        if (Math.abs(deletedMessageDate - lastMessageDate) > 1000) {
          return prevChats;
        }

        // Update the last message to show it's deleted
        const updatedChats = [...prevChats];
        updatedChats[existingChatIndex] = {
          ...chat,
          last_message: {
            ...chat.last_message,
            deleted: true,
            content: "(Message deleted)",
          },
        };

        return updatedChats;
      });
    },
    []
  );

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    fetchRecentChats();

    // Clean up any existing subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Clean up any pending debounced fetch
    if (updateDebounceRef.current) {
      clearTimeout(updateDebounceRef.current);
      updateDebounceRef.current = null;
    }

    // Create a channel for all message-related events
    const channel = supabase.channel(`chat_list_${userId}`, {
      config: {
        broadcast: { ack: true, self: true }, // Enable self-broadcast
      },
    });
    channelRef.current = channel;

    // Set up subscription for new messages
    channel
      // Listen for messages sent by the current user
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${userId}`,
        },
        (payload) => {
          console.log("New sent message detected:", payload);
          // Update chat list optimistically with the new message
          updateChatListWithMessage(payload.new as MessagePayload, true);
        }
      )
      // Listen for messages received by the current user
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          console.log("New received message detected:", payload);
          // Update chat list optimistically with the new message
          updateChatListWithMessage(payload.new as MessagePayload, false);
        }
      )
      // Listen for updates to messages sent by the current user
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${userId}`,
        },
        (payload) => {
          console.log("Sent message update detected:", payload);

          // Check if this is an edit or a soft delete
          const updatedMessage = payload.new as MessagePayload;

          if (updatedMessage.deleted_at) {
            // Handle soft delete
            updateChatListWithDeletedMessage(updatedMessage, true);
          } else if (updatedMessage.edited_at) {
            // Handle edit
            updateChatListWithEditedMessage(updatedMessage, true);
          } else {
            // Other updates (like read status) - use standard update
            debouncedFetchChats();
          }
        }
      )
      // Listen for updates to messages received by the current user
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          console.log("Received message update detected:", payload);

          // Check if this is an edit or a soft delete
          const updatedMessage = payload.new as MessagePayload;

          if (updatedMessage.deleted_at) {
            // Handle soft delete
            updateChatListWithDeletedMessage(updatedMessage, false);
          } else if (updatedMessage.edited_at) {
            // Handle edit
            updateChatListWithEditedMessage(updatedMessage, false);
          } else {
            // Show a notification if a message was marked as read
            if (
              payload.new &&
              payload.new.read_at &&
              !payload.old.read_at &&
              payload.new.sender_id === userId
            ) {
              // Optional: You could show a subtle toast here that message was read
              // toast.info("Message read", { duration: 1000 });
            }
            debouncedFetchChats();
          }
        }
      )
      // Listen for deletion of messages sent by the current user
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `sender_id=eq.${userId}`,
        },
        (payload) => {
          console.log("Sent message deletion detected:", payload);
          // Handle hard delete (though we're using soft deletes)
          updateChatListWithDeletedMessage(payload.old as MessagePayload, true);
        }
      )
      // Listen for deletion of messages received by the current user
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          console.log("Received message deletion detected:", payload);
          // Handle hard delete (though we're using soft deletes)
          updateChatListWithDeletedMessage(
            payload.old as MessagePayload,
            false
          );
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("Successfully subscribed to chat list updates");
        } else if (status === "CHANNEL_ERROR") {
          console.error("Failed to subscribe to chat list updates");
          // Try to reconnect after a delay
          setTimeout(() => {
            if (channelRef.current === channel) {
              channel.subscribe();
            }
          }, 3000);
        }
      });

    return () => {
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
  }, [
    userId,
    fetchRecentChats,
    debouncedFetchChats,
    updateChatListWithMessage,
    updateChatListWithEditedMessage,
    updateChatListWithDeletedMessage,
  ]);

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
  };
}
