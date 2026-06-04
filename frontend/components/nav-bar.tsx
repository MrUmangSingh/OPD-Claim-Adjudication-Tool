"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";

const links = [
  { href: "/", label: "Claims" },
  { href: "/claims/new", label: "Submit Claim" },
  { href: "/admin/eval", label: "Evaluation" },
  { href: "/admin/policy", label: "Policy" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="bg-white border-b shadow-sm">
      <div className="max-w-7xl mx-auto px-4 flex items-center h-14 gap-8">
        <Link href="/" className="flex items-center gap-2 font-semibold text-blue-700">
          <Activity className="h-5 w-5" />
          <span>ClaimIQ</span>
        </Link>
        <div className="flex gap-1">
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
      </div>
    </nav>
  );
}
