-- Drop existing triggers, functions, and policies to avoid conflicts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Drop existing policies from storage.objects
DROP POLICY IF EXISTS "Users can update their own avatar." ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload an avatar." ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible." ON storage.objects;

-- Try to drop policies on profiles if the table exists
DO $$
BEGIN
    -- Only attempt to drop policies if the table exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        EXECUTE 'DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles';
        EXECUTE 'DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles';
        EXECUTE 'DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles';
    END IF;
END $$;

-- Drop tables in correct order (respecting dependencies)
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.user_presence CASCADE;

-- Remove the storage bucket if it exists
DELETE FROM storage.buckets WHERE id = 'avatars';

-- Now create everything fresh
--* Enable necessary extensions*
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

--* Create profiles table*
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE,
    avatar_url TEXT,
    bio TEXT,
    last_username_update TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT username_length CHECK (char_length(username) >= 3 OR username IS NULL)
);

--* Create storage bucket for avatars*
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
    'avatars',
    'avatars',
    true,
    '5242880' -- 5MB in bytes
)
ON CONFLICT (id) DO UPDATE
SET
    public = true,
    file_size_limit = '5242880';

--* Set up Row Level Security (RLS)*
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

--* Create policies - NOW AFTER the table exists*
--* Policy for viewing profiles (anyone can view)*
CREATE POLICY "Public profiles are viewable by everyone"
    ON profiles FOR SELECT
    USING (true);

--* Policy for users to update their own profile*
CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

--* Policy for profile insertion (only during registration)*
CREATE POLICY "Users can insert their own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

--* Function to handle user profile creation on signup*
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, created_at)
    VALUES (new.id, NULL, NOW())
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error (you can see this in Supabase logs)
        RAISE LOG 'Error in handle_new_user: %', SQLERRM;
        RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--* Trigger to create profile after signup*
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

--* Storage policies for avatar uploads*
DROP POLICY IF EXISTS "Avatar images are publicly accessible." ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload an avatar." ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar." ON storage.objects;

-- Create more flexible policies for avatar storage
CREATE POLICY "Avatar images are publicly accessible."
    ON storage.objects FOR SELECT
    USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload avatars."
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'avatars' AND auth.uid() = (storage.foldername(name))[1]::uuid);

CREATE POLICY "Users can update their own avatars."
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'avatars' AND auth.uid() = (storage.foldername(name))[1]::uuid);

CREATE POLICY "Users can delete their own avatars."
    ON storage.objects FOR DELETE
    USING (bucket_id = 'avatars' AND auth.uid() = (storage.foldername(name))[1]::uuid);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    sender_id UUID REFERENCES profiles(id) NOT NULL,
    receiver_id UUID REFERENCES profiles(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES profiles(id),
    edited_at TIMESTAMP WITH TIME ZONE,
    original_content TEXT,
    CONSTRAINT messages_content_length CHECK (char_length(content) > 0)
);

-- Enable RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Create indexes for message performance optimization
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_reverse ON messages(receiver_id, sender_id, created_at DESC);

-- Policies for messages
CREATE POLICY "Users can view their own messages"
    ON messages FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can insert messages"
    ON messages FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update their own messages"
    ON messages FOR UPDATE
    USING (auth.uid() = sender_id);

CREATE POLICY "Users can delete their own messages"
    ON messages FOR DELETE
    USING (auth.uid() = sender_id);

-- Special policy for real-time changes to ensure instant delivery
CREATE POLICY "Realtime message updates"
    ON messages FOR SELECT
    USING (true);

-- Create user_presence table for tracking last seen
CREATE TABLE IF NOT EXISTS user_presence (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS for user_presence
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can update their own presence" ON user_presence;
DROP POLICY IF EXISTS "Users can insert their own presence" ON user_presence;
DROP POLICY IF EXISTS "Everyone can view user presence" ON user_presence;
DROP POLICY IF EXISTS "Users can delete their own presence" ON user_presence;
DROP POLICY IF EXISTS "Users can upsert their own presence" ON user_presence;

-- Create updated policies for user_presence
CREATE POLICY "Everyone can view user presence"
    ON public.user_presence
    FOR SELECT
    USING (true);

CREATE POLICY "Users can upsert their own presence"
    ON public.user_presence
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence"
    ON public.user_presence
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Add this new policy to allow users to insert or update their presence records
CREATE POLICY "Users can upsert their own presence data"
    ON public.user_presence
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Enable realtime for user_presence
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;

-- Create function to check if message can be deleted
CREATE OR REPLACE FUNCTION can_delete_message(message_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM messages
    WHERE id = message_id
    AND created_at >= NOW() - INTERVAL '1 minute'
  );
END;
$$ LANGUAGE plpgsql;

-- Update messages policy to include deletion check
CREATE POLICY "Users can only delete recent messages"
    ON public.messages FOR UPDATE
    USING (
        auth.uid() = sender_id AND
        (
            (deleted_at IS NULL AND can_delete_message(id)) OR
            deleted_at IS NULL
        )
    );

-- Create or replace the delete_user_data function
CREATE OR REPLACE FUNCTION delete_user_data(input_user_id UUID)
RETURNS jsonb AS $$
DECLARE
    result jsonb;
BEGIN
    -- Delete from user_presence
    DELETE FROM public.user_presence
    WHERE user_presence.user_id = input_user_id;

    -- Delete from messages
    DELETE FROM public.messages
    WHERE messages.sender_id = input_user_id
    OR messages.receiver_id = input_user_id;

    -- Delete from profiles (this should cascade to other tables)
    DELETE FROM public.profiles
    WHERE profiles.id = input_user_id;

    result := jsonb_build_object(
        'success', true,
        'message', 'User data deleted successfully'
    );

    RETURN result;

EXCEPTION WHEN OTHERS THEN
    result := jsonb_build_object(
        'success', false,
        'message', SQLERRM,
        'error_detail', SQLSTATE
    );
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_user_data(UUID) TO authenticated;

-- Function to get recent chats with the latest message for each conversation
CREATE OR REPLACE FUNCTION get_recent_chats(user_id UUID)
RETURNS TABLE (
  other_user_id UUID,
  content TEXT,
  last_message_time TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  is_sender BOOLEAN,
  unread_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_messages AS (
    SELECT DISTINCT ON (other_id)
      CASE
        WHEN msg.sender_id = user_id THEN msg.receiver_id
        ELSE msg.sender_id
      END AS other_id,
      msg.content,
      msg.created_at AS last_message_time,
      msg.read_at,
      msg.deleted_at,
      msg.sender_id = user_id AS is_sender,
      (
        SELECT MAX(last_read.read_at)
        FROM messages last_read
        WHERE
          last_read.receiver_id = user_id
          AND last_read.sender_id = CASE
            WHEN msg.sender_id = user_id THEN msg.receiver_id
            ELSE msg.sender_id
          END
      ) as latest_read_at
    FROM messages msg
    WHERE msg.sender_id = user_id OR msg.receiver_id = user_id
    ORDER BY
      other_id,
      msg.created_at DESC
  ),
  unread_counts AS (
    SELECT
      unread.sender_id AS other_user_id,
      COUNT(*) AS unread_count
    FROM messages unread
    LEFT JOIN latest_messages lm ON unread.sender_id = lm.other_id
    WHERE
      unread.receiver_id = user_id
      AND unread.read_at IS NULL
      AND unread.deleted_at IS NULL
      AND (
        lm.latest_read_at IS NULL
        OR unread.created_at > lm.latest_read_at
      )
    GROUP BY unread.sender_id
  )
  SELECT
    lm.other_id AS other_user_id,
    lm.content,
    lm.last_message_time,
    lm.read_at,
    lm.deleted_at,
    lm.is_sender,
    COALESCE(uc.unread_count, 0) AS unread_count
  FROM latest_messages lm
  LEFT JOIN unread_counts uc ON lm.other_id = uc.other_user_id
  ORDER BY lm.last_message_time DESC;
END;
$$ LANGUAGE plpgsql;

-- Enable realtime for tables
BEGIN;
  -- Create or replace the supabase_realtime publication
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE profiles, messages, user_presence;
COMMIT;