import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAuth } from "@/contexts/AuthContext";
import { ModeToggle } from "@/components/theme/themeToggle";
import { supabase } from "@/services/supabase/supabase";
import { toast } from "sonner";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const { signInUser } = UserAuth();

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);

      const result = await signInUser(email, password);
      if (!result.success) {
        setError(result.error || "Login failed");
        return;
      }

      // If successful, navigate to chat
      navigate("/chat");
    } catch (error) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      toast.error("Please enter your email address");
      return;
    }

    try {
      setResetLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast.success("Password reset email sent! Please check your inbox.");
      setShowResetModal(false);
      setResetEmail("");
    } catch (error) {
      console.error("Error sending reset password email:", error);
      toast.error("Failed to send reset password email. Please try again.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
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
              <CardTitle>Login</CardTitle>
              <CardDescription>
                Enter your credentials to access your account
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleLogin}>
              <CardContent>
                <div className="grid w-full items-center gap-4">
                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setEmail(e.target.value)
                      }
                      required
                    />
                  </div>
                  <div className="flex flex-col space-y-1.5">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="password">Password</Label>
                      <Button
                        variant="link"
                        className="text-xs px-0 h-auto font-normal"
                        onClick={() => setShowResetModal(true)}
                        type="button"
                      >
                        Forgot Password?
                      </Button>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setPassword(e.target.value)
                        }
                        required
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
                  {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button
                  className="w-full mt-5"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? "Logging in..." : "Login"}
                </Button>
                <p className="text-sm text-center">
                  Don't have an account?{" "}
                  <Button
                    variant="link"
                    className="p-0"
                    onClick={() => navigate("/register")}
                  >
                    Register
                  </Button>
                </p>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>

      <Dialog open={showResetModal} onOpenChange={setShowResetModal}>
        <DialogContent>
          <form onSubmit={handleResetPassword}>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Enter your registered email address. We'll send you a link to
                reset your password.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="Enter your email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowResetModal(false)}
                disabled={resetLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={resetLoading}>
                {resetLoading ? "Sending..." : "Send Reset Link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
