import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { UserAuth } from "@/contexts/AuthContext";
import { supabase } from "@/services/supabase/supabase";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Pencil, Eye, EyeOff, Check, X, Camera } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { registerSchema } from "@/lib/validations/auth";

interface Profile {
  username: string | null;
  avatar_url: string | null;
  last_username_update: string | null;
  bio: string | null;
}

export default function Profile() {
  const navigate = useNavigate();
  const { session, deleteAccount } = UserAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newBio, setNewBio] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Password change states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordValidationErrors, setPasswordValidationErrors] = useState<
    Record<string, string>
  >({});
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const passwordRequirements = [
    { label: "At least 8 characters", test: () => newPassword.length >= 8 },
    {
      label: "At least one uppercase letter",
      test: () => /[A-Z]/.test(newPassword),
    },
    {
      label: "At least one lowercase letter",
      test: () => /[a-z]/.test(newPassword),
    },
    { label: "At least one number", test: () => /[0-9]/.test(newPassword) },
    {
      label: "At least one special character",
      test: () => /[^A-Za-z0-9]/.test(newPassword),
    },
    {
      label: "Passwords match",
      test: () => newPassword === confirmPassword && newPassword !== "",
    },
  ];

  useEffect(() => {
    const fetchProfile = async () => {
      if (!session?.user) {
        navigate("/login");
        return;
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("username, avatar_url, last_username_update, bio")
          .eq("id", session.user.id)
          .single();

        if (error) throw error;

        setProfile(data as unknown as Profile);
        setNewUsername((data as unknown as Profile).username || "");
        setNewBio((data as unknown as Profile).bio || "");
      } catch (error) {
        console.error("Error fetching profile:", error);
        toast.error("Failed to load profile");
      }
    };

    fetchProfile();
  }, [session, navigate]);

  const getInitials = (username: string | null) => {
    if (!username) return "U";

    return username
      .split(/[-_\s]/)
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const canUpdateUsername = () => {
    if (!profile?.last_username_update) return true;
    const lastUpdate = new Date(profile.last_username_update);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return lastUpdate < thirtyDaysAgo;
  };

  const handleUsernameUpdate = async () => {
    if (!canUpdateUsername()) {
      toast.error("You can only update your username once every 30 days");
      return;
    }

    if (newUsername.length < 3) {
      toast.error("Username must be at least 3 characters long");
      return;
    }

    if (newUsername === profile?.username) {
      setIsEditing(false);
      return;
    }

    setLoading(true);
    try {
      // Check if username already exists
      const { data: existingUser, error: checkError } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", newUsername)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingUser) {
        toast.error("Username is already taken");
        setLoading(false);
        return;
      }

      // Update the username
      const { error } = await supabase
        .from("profiles")
        .update({
          username: newUsername,
          last_username_update: new Date().toISOString(),
        })
        .eq("id", session?.user?.id || "");

      if (error) throw error;

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              username: newUsername,
              last_username_update: new Date().toISOString(),
            }
          : null
      );
      setIsEditing(false);
      toast.success("Username updated successfully");
    } catch (error) {
      console.error("Error updating username:", error);
      toast.error("Failed to update username");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate new password
      registerSchema.parse({
        email: "dummy@email.com", // Not used but required by schema
        password: newPassword,
        confirmPassword,
      });

      setLoading(true);

      // First verify current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: session?.user?.email || "",
        password: currentPassword,
      });

      if (signInError) {
        toast.error("Current password is incorrect");
        return;
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      toast.success("Password updated successfully");

      // Reset form and close dialog
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordValidationErrors({});
      setShowPasswordDialog(false);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          const path = err.path[0];
          if (path && !errors[path.toString()]) {
            errors[path.toString()] = err.message;
          }
        });
        setPasswordValidationErrors(errors);
      } else {
        console.error("Error updating password:", error);
        toast.error("Failed to update password");
      }
    } finally {
      setLoading(false);
    }
  };

  const getTimeUntilNextUpdate = () => {
    if (!profile?.last_username_update) return null;
    const lastUpdate = new Date(profile.last_username_update);
    const nextUpdate = new Date(lastUpdate);
    nextUpdate.setDate(nextUpdate.getDate() + 30);
    const now = new Date();
    const daysLeft = Math.ceil(
      (nextUpdate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysLeft > 0 ? daysLeft : 0;
  };

  // Handle avatar file selection
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Image size should be less than 2MB");
        return;
      }

      try {
        setLoading(true);

        // Upload the new avatar
        const fileExt = file.name.split(".").pop();
        const fileName = `${session?.user?.id}-${Math.random()}.${fileExt}`;

        const { error: uploadError, data } = await supabase.storage
          .from("avatars")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        if (data) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("avatars").getPublicUrl(data.path);

          // Update profile with new avatar URL
          const { error: updateError } = await supabase
            .from("profiles")
            .update({
              avatar_url: publicUrl,
            })
            .eq("id", session?.user?.id || "");

          if (updateError) throw updateError;

          // Update local state
          setProfile((prev) =>
            prev ? { ...prev, avatar_url: publicUrl } : null
          );
          toast.success("Profile picture updated successfully!");
        }
      } catch (error) {
        console.error("Error updating avatar:", error);
        toast.error("Failed to update profile picture");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBioUpdate = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ bio: newBio })
        .eq("id", session?.user?.id || "");

      if (error) throw error;

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              bio: newBio,
            }
          : null
      );
      setIsEditingBio(false);
      toast.success("Bio updated successfully");
    } catch (error) {
      console.error("Error updating bio:", error);
      toast.error("Failed to update bio");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      const { success, error } = await deleteAccount();
      if (success) {
        toast.success("Account deleted successfully");
        navigate("/login");
      } else {
        throw new Error(error);
      }
    } catch (error) {
      console.error("Error deleting account:", error);
      toast.error("Failed to delete account");
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <Button
          type="button"
          variant="default"
          className="mb-6 flex items-center gap-2 bg-violet-600 hover:bg-violet-700"
          onClick={() => navigate("/chat")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Chat
        </Button>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Profile Settings</CardTitle>
          </CardHeader>
          <CardContent>
            {profile && (
              <div className="flex flex-col items-center space-y-6">
                <div className="relative">
                  <Avatar className="h-24 w-24 ring-2 ring-violet-500 ring-offset-2 ring-offset-background">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback className="text-lg">
                      {getInitials(profile.username)}
                    </AvatarFallback>
                  </Avatar>
                  <label
                    htmlFor="avatar-upload"
                    className="absolute bottom-0 right-0 cursor-pointer rounded-full bg-primary p-2 text-primary-foreground hover:bg-primary/90"
                  >
                    <Camera className="h-4 w-4" />
                    <input
                      type="file"
                      id="avatar-upload"
                      className="hidden"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      disabled={loading}
                    />
                  </label>
                </div>

                <div className="w-full max-w-sm space-y-4">
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <div className="flex w-full gap-2">
                          <Input
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            placeholder="Enter new username"
                            className="flex-1"
                          />
                          <Button
                            onClick={handleUsernameUpdate}
                            disabled={loading || !canUpdateUsername()}
                          >
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsEditing(false);
                              setNewUsername(profile.username || "");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex w-full items-center justify-between">
                          <span className="text-xl font-semibold">
                            {profile.username || "Set username"}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setIsEditing(true)}
                            disabled={!canUpdateUsername()}
                            title={
                              !canUpdateUsername()
                                ? `You can update your username in ${getTimeUntilNextUpdate()} days`
                                : "Edit username"
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    {!profile.username && (
                      <p className="text-sm text-amber-500">
                        Please set a username to complete your profile
                      </p>
                    )}
                    {!canUpdateUsername() && (
                      <p className="text-sm text-muted-foreground">
                        You can update your username again in{" "}
                        {getTimeUntilNextUpdate()} days
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label>Email</Label>
                    <p className="text-sm text-muted-foreground">
                      {session?.user?.email}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Bio</Label>
                    <div className="flex items-start gap-2">
                      {isEditingBio ? (
                        <div className="flex w-full flex-col gap-2">
                          <textarea
                            value={newBio}
                            onChange={(e) => setNewBio(e.target.value)}
                            placeholder="Tell us about yourself..."
                            className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            maxLength={500}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              onClick={handleBioUpdate}
                              disabled={loading}
                            >
                              Save
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setIsEditingBio(false);
                                setNewBio(profile.bio || "");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {500 - newBio.length} characters remaining
                          </p>
                        </div>
                      ) : (
                        <div className="flex justify-center w-full flex-col ">
                          <div className="flex items-start justify-between">
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {profile.bio ||
                                "No bio yet. Click edit to add one!"}
                            </p>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => setIsEditingBio(true)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <Button
                    onClick={() => setShowPasswordDialog(true)}
                    variant="outline"
                    className="w-full mt-5"
                  >
                    Change Password
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg border border-destructive p-4">
                <h3 className="text-lg font-semibold text-destructive">
                  Delete Account
                </h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Once you delete your account, there is no going back. Please
                  be certain.
                </p>
                <Button
                  variant="destructive"
                  className="mt-4"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  Delete Account
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
              <DialogDescription>
                Enter your current password and choose a new password that meets
                all requirements.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handlePasswordChange} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onFocus={() => setFocusedInput("newPassword")}
                    onBlur={() => setFocusedInput(null)}
                    placeholder="Enter new password"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onFocus={() => setFocusedInput("confirmPassword")}
                    onBlur={() => setFocusedInput(null)}
                    placeholder="Confirm new password"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {(focusedInput === "newPassword" ||
                focusedInput === "confirmPassword") && (
                <div className="mt-2 space-y-2 text-sm">
                  {passwordRequirements.map((requirement, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      {requirement.test() ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <X className="h-4 w-4 text-red-500" />
                      )}
                      <span
                        className={
                          requirement.test() ? "text-green-500" : "text-red-500"
                        }
                      >
                        {requirement.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {Object.keys(passwordValidationErrors).length > 0 && (
                <div className="text-sm text-red-500">
                  {Object.values(passwordValidationErrors).map(
                    (error, index) => (
                      <p key={index}>{error}</p>
                    )
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowPasswordDialog(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmPassword("");
                    setPasswordValidationErrors({});
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    loading || !passwordRequirements.every((req) => req.test())
                  }
                >
                  {loading ? "Updating Password..." : "Update Password"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Account Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-destructive">
                Delete Account
              </DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will permanently delete your
                account and remove your data from our servers.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <p className="text-sm font-medium">
                The following data will be deleted:
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2">
                <li>Your profile information</li>
                <li>All your messages</li>
                <li>Your chat history</li>
                <li>Your account credentials</li>
              </ul>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
              >
                {deleteLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent"></div>
                    Deleting...
                  </div>
                ) : (
                  "Delete Account"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
