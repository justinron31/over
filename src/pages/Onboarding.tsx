import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase/supabase";
import { UserAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const Onboarding = () => {
  const navigate = useNavigate();
  const { session } = UserAuth();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  useEffect(() => {
    // Check if user is already onboarded
    const checkProfile = async () => {
      if (!session?.user) {
        navigate("/login");
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", session.user.id)
          .single();

        if (error) {
          console.error("Error checking profile:", error);
          return;
        }

        // If username exists and is not null, user has completed onboarding
        if (profile && profile.username) {
          navigate("/chat");
        }
      } catch (err) {
        console.error("Error during profile check:", err);
      }
    };

    checkProfile();
  }, [navigate, session]);

  // Check if username exists
  const checkUsername = async (username: string) => {
    if (username.length < 3) return;
    setCheckingUsername(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", username)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 means no rows returned, which is what we want
        throw error;
      }

      if (data) {
        setError("Username is already taken");
      }
    } catch (err) {
      console.error("Error checking username:", err);
    } finally {
      setCheckingUsername(false);
    }
  };

  // Handle avatar file selection
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Image size should be less than 2MB");
        return;
      }
      setAvatar(file);
      const preview = URL.createObjectURL(file);
      setAvatarPreview(preview);
    }
  };

  // Remove selected avatar
  const handleRemoveAvatar = () => {
    setAvatar(null);
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (error) return;
    setLoading(true);
    setError(null);

    try {
      if (!session?.user) throw new Error("No user found");

      let avatarUrl = null;

      // Upload avatar if selected
      if (avatar) {
        try {
          const fileExt = avatar.name.split(".").pop();
          const fileName = `${session.user.id}-${Math.random()}.${fileExt}`;

          // Read the file as an ArrayBuffer
          const fileBuffer = await new Promise<ArrayBuffer>(
            (resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as ArrayBuffer);
              reader.onerror = reject;
              reader.readAsArrayBuffer(avatar);
            }
          );

          // Upload the file as binary data
          const { error: uploadError, data } = await supabase.storage
            .from("avatars")
            .upload(`${session.user.id}/${fileName}`, fileBuffer, {
              contentType: avatar.type,
              upsert: false,
            });

          if (uploadError) {
            console.error("Upload error:", uploadError);
            throw uploadError;
          }

          if (data) {
            // Get the public URL
            const {
              data: { publicUrl },
            } = supabase.storage
              .from("avatars")
              .getPublicUrl(`${session.user.id}/${fileName}`);

            avatarUrl = publicUrl;
          }
        } catch (error) {
          console.error("Avatar upload error:", error);
          throw new Error("Failed to upload avatar");
        }
      }

      // Update profile with username and avatar URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          username,
          updated_at: new Date().toISOString(),
          ...(avatarUrl && { avatar_url: avatarUrl }),
        })
        .eq("id", session.user.id);

      if (updateError) {
        console.error("Profile update error:", updateError);
        throw new Error("Failed to update profile. Please try again.");
      }

      toast.success("Profile setup complete!");
      navigate("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      toast.error("Failed to set up profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Card className="w-[350px]">
        <CardHeader>
          <CardTitle>Set Up Your Profile</CardTitle>
          <CardDescription>
            Choose a username to get started with chat
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <div className="grid w-full items-center gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  required
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    checkUsername(e.target.value);
                  }}
                  minLength={3}
                  pattern="[a-zA-Z0-9_-]+"
                  title="Username can only contain letters, numbers, underscores, and hyphens"
                />
              </div>

              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="avatar">Profile Picture (optional)</Label>
                <div className="flex items-center gap-4">
                  {avatarPreview ? (
                    <div className="relative">
                      <img
                        src={avatarPreview}
                        alt="Avatar preview"
                        className="h-16 w-16 rounded-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground hover:bg-destructive/90"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <label
                        htmlFor="avatar"
                        className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent"
                      >
                        <Upload className="h-4 w-4" />
                        <span>Upload</span>
                        <input
                          type="file"
                          id="avatar"
                          className="hidden"
                          accept="image/*"
                          onChange={handleAvatarChange}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full mt-4"
              type="submit"
              disabled={loading || checkingUsername || !!error}
            >
              {loading ? "Setting up..." : "Continue to Chat"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Onboarding;
