import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Check, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/services/supabase/supabase";
import { toast } from "sonner";
import { ModeToggle } from "@/components/theme/themeToggle";
import { registerSchema } from "@/lib/validations/auth";
import { z } from "zod";

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});

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
  ];

  useEffect(() => {
    // Check if we have a recovery token in the URL
    const fragment = new URLSearchParams(location.hash.substring(1));
    const error = fragment.get("error");
    const error_description = fragment.get("error_description");

    if (error) {
      console.error("Error in URL:", error, error_description);
      toast.error(error_description || "Invalid reset password link");
      navigate("/login");
      return;
    }

    const searchParams = new URLSearchParams(location.search);
    const type = searchParams.get("type");
    const tokenHash = searchParams.get("token_hash");

    if (!type || !tokenHash) {
      toast.error("Invalid reset password link");
      navigate("/login");
    }
  }, [navigate, location]);

  useEffect(() => {
    const validateForm = () => {
      try {
        registerSchema.parse({
          email: "dummy@email.com",
          password: newPassword,
          confirmPassword,
        });
        setValidationErrors({});
      } catch (error) {
        if (error instanceof z.ZodError) {
          const errors: Record<string, string> = {};
          error.errors.forEach((err) => {
            const path = err.path[0];
            if (path && !errors[path.toString()]) {
              errors[path.toString()] = err.message;
            }
          });
          setValidationErrors(errors);
        }
      }
    };

    validateForm();
  }, [newPassword, confirmPassword]);

  const handlePasswordReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      // Validate form using schema
      registerSchema.parse({
        email: "dummy@email.com",
        password: newPassword,
        confirmPassword,
      });

      setLoading(true);

      // Get the hash from the URL
      const searchParams = new URLSearchParams(location.search);
      const tokenHash = searchParams.get("token_hash");

      if (!tokenHash) {
        throw new Error("Invalid reset password link");
      }

      // First verify the token hash is valid
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      });

      if (verifyError) {
        throw verifyError;
      }

      // Now update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      toast.success("Password updated successfully!");
      navigate("/login");
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          const path = err.path[0];
          if (path && !errors[path.toString()]) {
            errors[path.toString()] = err.message;
          }
        });
        setValidationErrors(errors);
      } else {
        console.error("Error updating password:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update password. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="fixed top-4 right-4">
        <ModeToggle />
      </div>
      <div className="flex flex-col items-center">
        <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-primary to-primary/50 bg-clip-text text-transparent">
          OVER
        </h1>
        <Card className="w-[350px]">
          <CardHeader>
            <CardTitle>Reset Password</CardTitle>
            <CardDescription>Enter your new password</CardDescription>
          </CardHeader>
          <form onSubmit={handlePasswordReset}>
            <CardContent>
              <div className="grid w-full items-center gap-4">
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your new password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      onFocus={() => setFocusedInput("newPassword")}
                      onBlur={() => setFocusedInput(null)}
                      required
                      minLength={8}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm your new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onFocus={() => setFocusedInput("confirmPassword")}
                      onBlur={() => setFocusedInput(null)}
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
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
                            requirement.test()
                              ? "text-green-500"
                              : "text-red-500"
                          }
                        >
                          {requirement.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {Object.keys(validationErrors).length > 0 && (
                  <div className="text-sm text-red-500">
                    {Object.values(validationErrors).map((error, index) => (
                      <p key={index}>{error}</p>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full mt-4"
                type="submit"
                disabled={
                  loading ||
                  !passwordRequirements.every((req) => req.test()) ||
                  newPassword !== confirmPassword
                }
              >
                {loading ? "Updating Password..." : "Reset Password"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
