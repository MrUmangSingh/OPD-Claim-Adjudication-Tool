"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { api, Claim } from "@/lib/api";
import { ClaimDetailView } from "@/components/claim-detail-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function AdminClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [loading, setLoading] = useState(true);
  const [overrideDecision, setOverrideDecision] = useState("APPROVED");
  const [overrideAmount, setOverrideAmount] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

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

  const submitReview = async () => {
    if (!reviewNotes.trim()) { toast.error("Please add review notes"); return; }
    setSubmittingReview(true);
    try {
      await api.submitReview(Number(id), {
        action: "override_" + overrideDecision.toLowerCase(),
        override_decision: overrideDecision,
        override_amount: overrideAmount ? parseFloat(overrideAmount) : undefined,
        reviewer_notes: reviewNotes,
      });
      toast.success("Review submitted");
      fetchClaim();
    } catch (err) {
      toast.error("Review failed: " + String(err));
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
    </div>
  );

  if (!claim) return (
    <div className="text-center py-20 text-gray-400">Claim not found</div>
  );

  const showOverride =
    claim.status === "manual_review" || claim.status === "decided";

  const overridePanel = showOverride ? (
    <Card className="border-orange-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-orange-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Manual Review Override
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Override Decision</Label>
            <Select value={overrideDecision} onValueChange={(v) => v && setOverrideDecision(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVED">Approve</SelectItem>
                <SelectItem value="REJECTED">Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Override Amount (₹, optional)</Label>
            <Input type="number" placeholder="Leave blank to keep current"
              value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Reviewer Notes <span className="text-red-500">*</span></Label>
          <Textarea placeholder="Explain the override reason…"
            value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={3} />
        </div>
        <Button onClick={submitReview} disabled={submittingReview} className="bg-orange-600 hover:bg-orange-700">
          {submittingReview ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting…</> : "Submit Review Override"}
        </Button>
      </CardContent>
    </Card>
  ) : null;

  return <ClaimDetailView claim={claim} adminPanel={overridePanel} backHref="/" />;
}
