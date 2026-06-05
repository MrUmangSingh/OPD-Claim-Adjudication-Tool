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
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      toast.error(String(err).replace("Error: ", ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Activity className="h-7 w-7 text-blue-600" />
            <span className="text-2xl font-bold text-blue-700">ClaimIQ</span>
          </div>
          <p className="text-sm text-gray-500">Sign in to manage your OPD claims</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sign In</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@test"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
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
                {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Signing in…</> : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

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

      </div>
    </div>
  );
}
