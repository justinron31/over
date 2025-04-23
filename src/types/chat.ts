export interface Message {
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

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio?: string;
}

export interface RecentChat {
  profile: Profile;
  last_message: {
    content: string;
    created_at: string;
    is_read: boolean;
    is_sender: boolean;
    deleted: boolean;
  };
  unread_count: number;
}

export interface RecentChatData {
  other_user_id: string;
  content: string | null;
  last_message_time: string;
  read_at: string | null;
  deleted_at: string | null;
  is_sender: boolean;
  unread_count: number;
}

// Define types for broadcast message payloads
export interface BroadcastMessagePayload {
  message_id: string;
  content: string;
  sender_id: string;
  receiver_id: string;
  created_at: string;
}

export interface BroadcastUpdatePayload {
  message_id: string;
  content: string;
  sender_id: string;
  created_at: string;
}

export interface BroadcastDeletePayload {
  message_id: string;
  sender_id: string;
  created_at: string;
}

export interface BroadcastReadPayload {
  message_id: string;
  sender_id: string;
  created_at: string;
}

export interface BroadcastPayload {
  type: "broadcast";
  event: string;
  payload:
    | BroadcastMessagePayload
    | BroadcastUpdatePayload
    | BroadcastDeletePayload
    | BroadcastReadPayload;
}
