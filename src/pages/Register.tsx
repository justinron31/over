import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X, Eye, EyeOff } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserAuth } from "@/contexts/AuthContext";
import { useAuthStore } from "@/store/useAuthStore";
import { registerSchema } from "@/lib/validations/auth";
import { ModeToggle } from "@/components/theme/themeToggle";

export default function Register() {
  const navigate = useNavigate();
  const {
    email,
    password,
    confirmPassword,
    setEmail,
    setPassword,
    setConfirmPassword,
    reset,
  } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [isValid, setIsValid] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const { signUpNewUser } = UserAuth();

  const passwordRequirements = [
    { label: "At least 8 characters", test: () => password.length >= 8 },
    {
      label: "At least one uppercase letter",
      test: () => /[A-Z]/.test(password),
    },
    {
      label: "At least one lowercase letter",
      test: () => /[a-z]/.test(password),
    },
    { label: "At least one number", test: () => /[0-9]/.test(password) },
    {
      label: "At least one special character",
      test: () => /[^A-Za-z0-9]/.test(password),
    },
  ];

  useEffect(() => {
    const validateForm = () => {
      try {
        registerSchema.parse({ email, password, confirmPassword });
        setValidationErrors({});
        setIsValid(true);
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
          setIsValid(false);
        }
      }
    };

    validateForm();
  }, [email, password, confirmPassword]);

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setLoading(true);
      const result = await signUpNewUser(email, password);

      if (!result.success) {
        toast.error(result.error?.message || "Registration failed");
        return;
      }

      toast.success(
        "Account created successfully! Please check your email to verify your account.",
        {
          duration: 5000,
        }
      );
      reset();
      navigate("/login");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="fixed top-4 right-4">
        <ModeToggle />
      </div>
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle>Register</CardTitle>
          <CardDescription>Create a new account</CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent>
            <div className="grid w-full items-center gap-4">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedInput("email")}
                  onBlur={() => {
                    setFocusedInput(null);
                    setEmailTouched(true);
                    // Only validate email on blur if there's a value
                    if (email) {
                      try {
                        z.string().email().parse(email);
                        const emailErrors = { ...validationErrors };
                        delete emailErrors.email;
                        setValidationErrors(emailErrors);
                      } catch (error) {
                        if (error instanceof z.ZodError) {
                          setValidationErrors((prev) => ({
                            ...prev,
                            email: "Please enter a valid email address",
                          }));
                        }
                      }
                    }
                  }}
                  required
                />
                {emailTouched && email && validationErrors.email && (
                  <p className="text-sm text-red-500">
                    {validationErrors.email}
                  </p>
                )}
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedInput("password")}
                    onBlur={() => setFocusedInput(null)}
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
                {(focusedInput === "password" ||
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
              </div>
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your password"
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
                {focusedInput === "confirmPassword" &&
                  password !== confirmPassword &&
                  confirmPassword && (
                    <p className="text-sm text-red-500">
                      Passwords do not match
                    </p>
                  )}
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              className="w-full mt-5"
              type="submit"
              disabled={loading || !isValid}
            >
              {loading ? "Creating account..." : "Register"}
            </Button>
            <p className="text-sm text-center">
              Already have an account?{" "}
              <Button
                variant="link"
                className="p-0"
                onClick={() => navigate("/login")}
              >
                Login
              </Button>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
