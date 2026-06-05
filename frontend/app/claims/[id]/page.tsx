"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api, Claim } from "@/lib/api";
import { ClaimDetailView } from "@/components/claim-detail-view";
import { AuthGate } from "@/components/auth-gate";

function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchClaim = useCallback(async () => {
    try {
      const data = await api.getClaim(Number(id));
      setClaim(data);
    } catch {
      toast.error("Failed to load claim");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchClaim();
    const timer = setInterval(async () => {
      const data = await api.getClaim(Number(id)).catch(() => null);
      if (data) {
        setClaim(data);
        if (!["submitted", "processing"].includes(data.status)) {
          clearInterval(timer);
        }
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [id, fetchClaim]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
    </div>
  );

  if (!claim) return (
    <div className="text-center py-20 text-gray-400">Claim not found</div>
  );

  return <ClaimDetailView claim={claim} />;
}

export default function Page() {
  return (
    <AuthGate>
      <ClaimDetailPage />
    </AuthGate>
  );
}
