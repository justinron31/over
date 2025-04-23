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

-- Drop existing tables (if they exist)
DROP TABLE IF EXISTS public.profiles;

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