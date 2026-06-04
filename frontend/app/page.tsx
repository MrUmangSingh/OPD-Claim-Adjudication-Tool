"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, Claim } from "@/lib/api";
import { formatCurrency, formatDate, statusColors, decisionColors } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, RefreshCw, FileText, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";

const POLL_INTERVAL = 3000;

function DecisionBadge({ decision }: { decision: string }) {
  const icons: Record<string, React.ReactNode> = {
    APPROVED: <CheckCircle className="h-3 w-3" />,
    PARTIAL: <CheckCircle className="h-3 w-3" />,
    REJECTED: <XCircle className="h-3 w-3" />,
    MANUAL_REVIEW: <AlertTriangle className="h-3 w-3" />,
    DECIDED_BY_HUMAN: <CheckCircle className="h-3 w-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${decisionColors[decision] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
      {icons[decision]}
      {decision.replace("_", " ")}
    </span>
  );
}

function StatsCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className="text-gray-400">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClaimsDashboard() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const fetchClaims = useCallback(async () => {
    try {
      const data = await api.getClaims(statusFilter === "all" ? undefined : statusFilter);
      setClaims(data);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchClaims();
    const timer = setInterval(fetchClaims, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchClaims]);

  const stats = {
    total: claims.length,
    approved: claims.filter((c) => c.decision?.decision === "APPROVED" || c.decision?.decision === "DECIDED_BY_HUMAN").length,
    rejected: claims.filter((c) => c.decision?.decision === "REJECTED").length,
    pending: claims.filter((c) => ["submitted", "processing", "manual_review"].includes(c.status)).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Claims Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Plum OPD Advantage — TechCorp Solutions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchClaims}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Link href="/claims/new">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-1" /> Submit Claim
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Total Claims" value={stats.total} icon={<FileText className="h-6 w-6" />} />
        <StatsCard label="Approved" value={stats.approved} icon={<CheckCircle className="h-6 w-6 text-green-500" />} />
        <StatsCard label="Rejected" value={stats.rejected} icon={<XCircle className="h-6 w-6 text-red-500" />} />
        <StatsCard label="Pending Review" value={stats.pending} icon={<Clock className="h-6 w-6 text-orange-500" />} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All Claims</CardTitle>
            <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="decided">Decided</SelectItem>
                <SelectItem value="manual_review">Manual Review</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
          ) : claims.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">No claims yet</p>
              <Link href="/claims/new">
                <Button size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700">Submit your first claim</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-3 font-medium">Ref</th>
                    <th className="pb-3 font-medium">Member</th>
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Amount</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Decision</th>
                    <th className="pb-3 font-medium">Approved</th>
                    <th className="pb-3 font-medium">Confidence</th>
                    <th className="pb-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((claim) => (
                    <tr key={claim.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 font-mono text-xs text-gray-500">{claim.claim_ref}</td>
                      <td className="py-3 font-medium">{claim.member_name || claim.member_id}</td>
                      <td className="py-3 text-gray-600">{formatDate(claim.treatment_date)}</td>
                      <td className="py-3 font-medium">{formatCurrency(claim.claim_amount)}</td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[claim.status] || "bg-gray-100 text-gray-600"}`}>
                          {claim.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-3">
                        {claim.decision && <DecisionBadge decision={claim.decision.decision} />}
                        {!claim.decision && claim.status === "processing" && (
                          <span className="text-xs text-blue-500 animate-pulse">Processing…</span>
                        )}
                      </td>
                      <td className="py-3 font-medium text-green-700">
                        {claim.decision ? formatCurrency(claim.decision.approved_amount) : "—"}
                      </td>
                      <td className="py-3">
                        {claim.decision && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${claim.decision.confidence_score * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">
                              {Math.round(claim.decision.confidence_score * 100)}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3">
                        <Link href={`/claims/${claim.id}`}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs">View</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
