"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Activity, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO_CREDENTIALS = [
  { label: "User", email: "ramesh.k@test", password: "password123" },
  { label: "Admin", email: "admin@test", password: "admin123" },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const resetForm = () => { setName(""); setEmail(""); setPassword(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(name.trim(), email.trim(), password);
      }
      router.replace("/");
    } catch (err) {
      toast.error(String(err).replace("Error: ", ""));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    resetForm();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Activity className="h-7 w-7 text-blue-600" />
            <span className="text-2xl font-bold text-blue-700">ClaimIQ</span>
          </div>
          <p className="text-sm text-gray-500">
            {mode === "login" ? "Sign in to manage your OPD claims" : "Create an account to get started"}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex rounded-md border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
                  mode === "login"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
                  mode === "signup"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                Sign Up
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus={mode === "login"}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />{mode === "login" ? "Signing in…" : "Creating account…"}</>
                ) : (
                  mode === "login" ? "Sign In" : "Create Account"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {mode === "login" && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 space-y-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Demo credentials</p>
            <div className="space-y-1.5">
              {DEMO_CREDENTIALS.map((cred) => (
                <button
                  key={cred.label}
                  type="button"
                  onClick={() => { setEmail(cred.email); setPassword(cred.password); }}
                  className="w-full text-left rounded-md px-3 py-2 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 border border-transparent transition-colors group"
                >
                  <span className="text-xs font-semibold text-gray-500 group-hover:text-blue-600 mr-2">{cred.label}</span>
                  <span className="text-xs text-gray-400 font-mono">{cred.email}</span>
                  <span className="text-xs text-gray-300 mx-1">/</span>
                  <span className="text-xs text-gray-400 font-mono">{cred.password}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400">Click a row to fill the form.</p>
          </div>
        )}
      </div>
    </div>
  );
}
