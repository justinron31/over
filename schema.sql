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
DROP TABLE IF EXISTS public.typing_status CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Remove the storage bucket if it exists
DELETE FROM storage.buckets WHERE id = 'avatars';

-- Now create everything fresh
--* Enable necessary extensions*
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

--* Create profiles table*
CREATE TABLE public.profiles (
    id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    username text UNIQUE,
    avatar_url text,
    bio text DEFAULT '',
    last_username_update timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT username_length CHECK (char_length(username) >= 3 OR username IS NULL)
);

--* Create storage bucket for avatars*
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

--* Set up Row Level Security (RLS)*
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--* Create policies - NOW AFTER the table exists*
--* Policy for viewing profiles (anyone can view)*
CREATE POLICY "Profiles are viewable by everyone"
    ON public.profiles FOR SELECT
    USING (true);

--* Policy for users to update their own profile*
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

--* Policy for profile insertion (only during registration)*
CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

--* Function to handle user profile creation on signup*
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id)
    VALUES (new.id)
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
CREATE POLICY "Avatar images are publicly accessible."
    ON storage.objects FOR SELECT
    USING (bucket_id = 'avatars');

CREATE POLICY "Anyone can upload an avatar."
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'avatars');

-- Fixed policy with explicit type casting for owner column
CREATE POLICY "Users can update their own avatar."
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'avatars' AND (owner)::uuid = auth.uid());

-- Create messages table
CREATE TABLE public.messages (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    sender_id uuid REFERENCES public.profiles(id) NOT NULL,
    receiver_id uuid REFERENCES public.profiles(id) NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    read_at timestamp with time zone,
    deleted_at timestamp with time zone DEFAULT NULL,
    deleted_by uuid REFERENCES public.profiles(id),
    edited_at timestamp with time zone DEFAULT NULL,
    original_content text,
    CONSTRAINT messages_content_length CHECK (char_length(content) > 0)
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Policies for messages
CREATE POLICY "Users can view their own messages"
    ON public.messages FOR SELECT
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can insert their own messages"
    ON public.messages FOR INSERT
    WITH CHECK (auth.uid() = sender_id);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Create typing_status table
CREATE TABLE public.typing_status (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id uuid REFERENCES public.profiles(id) NOT NULL,
    chat_with uuid REFERENCES public.profiles(id) NOT NULL,
    is_typing boolean DEFAULT false,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, chat_with)
);

-- Enable RLS for typing_status
ALTER TABLE public.typing_status ENABLE ROW LEVEL SECURITY;

-- Policies for typing_status
CREATE POLICY "Users can update their own typing status"
    ON public.typing_status FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view typing status of their chats"
    ON public.typing_status FOR SELECT
    USING (auth.uid() IN (user_id, chat_with));

-- Enable realtime for typing_status
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_status;

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

-- Drop the existing function first
DROP FUNCTION IF EXISTS delete_user_data(UUID);

-- Create or replace the delete_user_data function
CREATE OR REPLACE FUNCTION delete_user_data(input_user_id UUID)
RETURNS jsonb AS $$
DECLARE
    result jsonb;
BEGIN
    -- Delete from typing_status
    DELETE FROM public.typing_status
    WHERE typing_status.user_id = input_user_id
    OR typing_status.chat_with = input_user_id;

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

-- Drop the old functions and triggers
DROP TRIGGER IF EXISTS deleteUserTrigger ON public.profiles;
DROP FUNCTION IF EXISTS deleteUser() CASCADE;
DROP FUNCTION IF EXISTS delete_user(UUID);