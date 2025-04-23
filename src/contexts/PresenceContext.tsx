import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/services/supabase/supabase";
import { UserAuth } from "@/contexts/AuthContext";
import {
  PresenceContext,
  PresenceState,
  LastSeenState,
} from "./presenceContextHelpers";

export const PresenceProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { session } = UserAuth();
  const [onlineUsers, setOnlineUsers] = useState<PresenceState>({});
  const [lastSeen, setLastSeen] = useState<LastSeenState>({});
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceSubscriptionRef = useRef<ReturnType<
    typeof supabase.channel
  > | null>(null);

  // Memoize the update function to prevent it from changing on every render
  const updateUserPresence = useCallback(async (userId: string) => {
    if (!userId) return;

    try {
      const timestamp = new Date().toISOString();
      await supabase.from("user_presence").upsert(
        {
          user_id: userId,
          last_seen: timestamp,
        },
        {
          onConflict: "user_id",
          ignoreDuplicates: false,
        }
      );

      // Update local state immediately for faster UI response
      setLastSeen((prev) => ({
        ...prev,
        [userId]: timestamp,
      }));
    } catch (error) {
      console.error("Error updating last seen:", error);
    }
  }, []);

  // Fetch last seen data
  const fetchLastSeen = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const { data, error } = await supabase
        .from("user_presence")
        .select("user_id, last_seen");

      if (error) {
        console.error("Error fetching last seen data:", error);
        return;
      }

      const lastSeenData: LastSeenState = {};

      // Add proper type assertion for data
      if (data && Array.isArray(data)) {
        data.forEach((item: { [key: string]: unknown }) => {
          // Type assertion for each item
          const userId = item.user_id as string;
          const lastSeenTime = item.last_seen as string;

          if (userId) {
            lastSeenData[userId] = lastSeenTime;
          }
        });
      }

      setLastSeen(lastSeenData);
    } catch (error) {
      console.error("Error in fetchLastSeen:", error);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;

    // Clean up any existing channels
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }

    if (presenceSubscriptionRef.current) {
      presenceSubscriptionRef.current.unsubscribe();
      presenceSubscriptionRef.current = null;
    }

    // Initialize presence channel with fast presence refresh
    const channel = supabase.channel("online-users", {
      config: {
        presence: {
          key: session.user.id,
        },
      },
    });

    channelRef.current = channel;

    // Initial data fetch
    fetchLastSeen();

    // Handle presence state changes - sync quickly updates UI
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const newPresenceState: PresenceState = {};

      // Convert presence state to a simple online/offline map
      Object.keys(state).forEach((userId) => {
        newPresenceState[userId] = true;
      });

      setOnlineUsers(newPresenceState);
    });

    // Handle when users leave - update database and local state immediately
    channel.on("presence", { event: "leave" }, async ({ leftPresences }) => {
      for (const presence of leftPresences) {
        const userId = presence.user_id as string;
        if (userId) {
          // Update immediately in database and local state
          await updateUserPresence(userId);
        }
      }
    });

    // Subscribe to the channel and track presence
    channel.subscribe(async (status: string) => {
      if (status === "SUBSCRIBED") {
        // Track the current user's presence
        await channel.track({
          user_id: session.user.id,
          online_at: new Date().toISOString(),
        });

        // Update last seen for current user
        await updateUserPresence(session.user.id);
      }
    });

    // Set up realtime subscription for user_presence table with config for faster updates
    const presenceSubscription = supabase
      .channel("user_presence_changes", {
        config: {
          broadcast: { ack: true, self: true },
        },
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_presence",
        },
        (payload) => {
          if (payload.new && typeof payload.new === "object") {
            // Improved type safety with explicit type casting
            const payloadNew = payload.new as { [key: string]: unknown };
            const userId = payloadNew.user_id as string;
            const lastSeenTime = payloadNew.last_seen as string;

            if (userId && lastSeenTime) {
              setLastSeen((prev) => ({
                ...prev,
                [userId]: lastSeenTime,
              }));
            }
          }
        }
      )
      .subscribe();

    presenceSubscriptionRef.current = presenceSubscription;

    // Set up interval to ping the server while the user is active
    const presencePingInterval = setInterval(() => {
      if (document.visibilityState === "visible" && session?.user?.id) {
        // Refresh user presence every 30 seconds while tab is visible
        channel.track({
          user_id: session.user.id,
          online_at: new Date().toISOString(),
        });
      }
    }, 30000); // 30 seconds

    // Set up visibility change handler for more accurate presence
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && session?.user?.id) {
        // User returned to the tab, mark as online immediately
        channel.track({
          user_id: session.user.id,
          online_at: new Date().toISOString(),
        });
      } else if (document.visibilityState === "hidden" && session?.user?.id) {
        // User left the tab, update last seen immediately
        updateUserPresence(session.user.id);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Set up beforeunload event to properly handle page closes
    const handleBeforeUnload = () => {
      // Update last seen before unloading
      if (session?.user?.id) {
        // Just update local state and untrack for immediate offline status
        const timestamp = new Date().toISOString();

        // Update local state first for immediate UI response
        setLastSeen((prev) => ({
          ...prev,
          [session.user.id]: timestamp,
        }));

        // Untrack the presence immediately to mark user as offline
        channel.untrack();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(presencePingInterval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (presenceSubscriptionRef.current) {
        presenceSubscriptionRef.current.unsubscribe();
      }

      if (channelRef.current) {
        channelRef.current.untrack();
        channelRef.current.unsubscribe();
      }
    };
  }, [session?.user?.id, updateUserPresence, fetchLastSeen]);

  const isUserOnline = (userId: string | undefined) => {
    if (!userId) return false;
    return !!onlineUsers[userId];
  };

  const getLastSeen = (userId: string | undefined) => {
    if (!userId) return null;
    return lastSeen[userId] || null;
  };

  return (
    <PresenceContext.Provider
      value={{ onlineUsers, lastSeen, isUserOnline, getLastSeen }}
    >
      {children}
    </PresenceContext.Provider>
  );
};
