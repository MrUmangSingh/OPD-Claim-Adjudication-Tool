"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Activity, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

const employeeLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/claims/new", label: "Submit Claim" },
];

const adminLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/admin/eval", label: "Evaluation" },
  { href: "/admin/policy", label: "Policy" },
];

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  if (pathname === "/login" || !user) return null;

  const links = user.role === "admin" ? adminLinks : employeeLinks;

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <nav className="bg-white border-b shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-8">
        <Link href="/" className="flex items-center gap-2 font-semibold text-blue-700">
          <Activity className="h-5 w-5" />
          <span>ClaimIQ</span>
        </Link>
        <div className="flex gap-1 flex-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-800">{user.name}</p>
            <p className="text-xs text-gray-400 capitalize">{user.role === "admin" ? "HR Admin" : "Employee"}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-500 hover:text-red-600">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
