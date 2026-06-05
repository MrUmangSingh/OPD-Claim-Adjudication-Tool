import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export const statusColors: Record<string, string> = {
  submitted: "bg-gray-100 text-gray-700",
  processing: "bg-blue-100 text-blue-700",
  decided: "bg-green-100 text-green-700",
  manual_review: "bg-orange-100 text-orange-700",
  decided_by_human: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
};

export const decisionColors: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-800 border-green-200",
  PARTIAL: "bg-yellow-100 text-yellow-800 border-yellow-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  MANUAL_REVIEW: "bg-orange-100 text-orange-800 border-orange-200",
  DECIDED_BY_HUMAN: "bg-purple-100 text-purple-800 border-purple-200",
};
