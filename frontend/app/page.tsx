"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, Claim, Benefits } from "@/lib/api";
import { formatCurrency, formatDate, statusColors, decisionColors } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw, FileText, CheckCircle, XCircle, Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { AuthGate } from "@/components/auth-gate";

const POLL_INTERVAL = 3000;

function DecisionBadge({ claim }: { claim: Claim }) {
  const outcome = claim.effective_decision || claim.decision?.decision || "";
  const icons: Record<string, React.ReactNode> = {
    APPROVED: <CheckCircle className="h-3 w-3" />,
    PARTIAL: <CheckCircle className="h-3 w-3" />,
    REJECTED: <XCircle className="h-3 w-3" />,
    MANUAL_REVIEW: <AlertTriangle className="h-3 w-3" />,
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${decisionColors[outcome] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
        {icons[outcome]}
        {outcome.replace(/_/g, " ")}
      </span>
      {claim.decision && (
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${claim.decided_by_human ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
          {claim.decided_by_human ? "HR" : "AI"}
        </span>
      )}
    </div>
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

function ClaimsTable({ claims, linkPrefix = "/claims" }: { claims: Claim[]; linkPrefix?: string }) {
  return (
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
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[claim.status] || statusColors["decided"] || "bg-gray-100 text-gray-600"}`}>
                  {(claim.status === "decided_by_human" ? "decided" : claim.status).replace(/_/g, " ")}
                </span>
              </td>
              <td className="py-3">
                {claim.decision && <DecisionBadge claim={claim} />}
                {!claim.decision && claim.status === "processing" && (
                  <span className="text-xs text-blue-500 animate-pulse">Processing…</span>
                )}
              </td>
              <td className="py-3 font-medium text-green-700">
                {claim.decision ? formatCurrency(claim.decision.approved_amount) : "—"}
              </td>
              <td className="py-3">
                <Link href={`${linkPrefix}/${claim.id}`}>
                  <Button variant="ghost" size="sm" className="h-7 text-xs">View</Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Employee dashboard ──────────────────────────────────────────────────────

function BenefitsCard() {
  const [benefits, setBenefits] = useState<Benefits | null>(null);

  useEffect(() => {
    api.getMyBenefits().then(setBenefits).catch(() => {});
  }, []);

  if (!benefits) return null;

  const usedPct = benefits.annual_limit > 0 ? Math.min(100, (benefits.used_ytd / benefits.annual_limit) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-600" />
          <CardTitle className="text-base">My Benefits — {benefits.year}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Annual limit used</span>
            <span className="font-semibold">{formatCurrency(benefits.used_ytd)} / {formatCurrency(benefits.annual_limit)}</span>
          </div>
          <Progress value={usedPct} className="h-2" />
          <p className="text-xs text-gray-500">{formatCurrency(benefits.remaining)} remaining • Resets Jan 1</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {benefits.by_category.filter(c => c.limit > 0).map((cat) => {
            const pct = cat.limit > 0 ? Math.min(100, (cat.used / cat.limit) * 100) : 0;
            return (
              <div key={cat.category} className="p-2.5 bg-gray-50 rounded-lg text-xs space-y-1.5">
                <p className="font-medium text-gray-700">{cat.label}</p>
                <Progress value={pct} className="h-1.5" />
                <p className="text-gray-500">{formatCurrency(cat.used)} / {formatCurrency(cat.limit)}</p>
              </div>
            );
          })}
        </div>

        {benefits.network_hospitals.length > 0 && (
          <p className="text-xs text-green-700 bg-green-50 rounded-md px-3 py-2">
            Network hospitals (20% discount): {benefits.network_hospitals.join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EmployeeDashboard() {
  const { user } = useAuth();
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
    approved: claims.filter((c) => c.effective_decision === "APPROVED" || c.effective_decision === "PARTIAL").length,
    rejected: claims.filter((c) => c.effective_decision === "REJECTED").length,
    pending: claims.filter((c) => ["submitted", "processing", "manual_review"].includes(c.status)).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Claims</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back, {user?.name}</p>
        </div>
        <Link href="/claims/new">
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-1" /> Submit Claim
          </Button>
        </Link>
      </div>

      <BenefitsCard />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Total Claims" value={stats.total} icon={<FileText className="h-6 w-6" />} />
        <StatsCard label="Approved" value={stats.approved} icon={<CheckCircle className="h-6 w-6 text-green-500" />} />
        <StatsCard label="Rejected" value={stats.rejected} icon={<XCircle className="h-6 w-6 text-red-500" />} />
        <StatsCard label="Pending" value={stats.pending} icon={<Clock className="h-6 w-6 text-orange-500" />} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Claim History</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchClaims}>
                <RefreshCw className="h-4 w-4" />
              </Button>
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
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : claims.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">No claims yet</p>
              <Link href="/claims/new">
                <Button size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700">Submit your first claim</Button>
              </Link>
            </div>
          ) : (
            <ClaimsTable claims={claims} linkPrefix="/claims" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Admin dashboard ─────────────────────────────────────────────────────────

function AdminDashboard() {
  const [allClaims, setAllClaims] = useState<Claim[]>([]);
  const [reviewClaims, setReviewClaims] = useState<Claim[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [decidedByFilter, setDecidedByFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [all, review] = await Promise.all([
        api.getClaims(),
        api.getClaims("manual_review"),
      ]);
      setAllClaims(all);
      setReviewClaims(review);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const filtered = allClaims.filter((c) => {
    if (statusFilter !== "all") {
      const decidedStatuses = ["decided", "decided_by_human"];
      if (statusFilter === "decided" && !decidedStatuses.includes(c.status)) return false;
      if (statusFilter !== "decided" && c.status !== statusFilter) return false;
    }
    if (decidedByFilter === "ai" && c.decided_by_human) return false;
    if (decidedByFilter === "hr" && !c.decided_by_human) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.member_name?.toLowerCase().includes(q) ||
      c.member_id.toLowerCase().includes(q) ||
      c.claim_ref.toLowerCase().includes(q)
    );
  });

  const stats = {
    total: allClaims.length,
    review: reviewClaims.length,
    approved: allClaims.filter((c) => c.effective_decision === "APPROVED" || c.effective_decision === "PARTIAL").length,
    rejected: allClaims.filter((c) => c.effective_decision === "REJECTED").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Claims Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Plum OPD Advantage — Admin View</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Total Claims" value={stats.total} icon={<FileText className="h-6 w-6" />} />
        <StatsCard label="Needs Review" value={stats.review} icon={<AlertTriangle className="h-6 w-6 text-orange-500" />} />
        <StatsCard label="Approved" value={stats.approved} icon={<CheckCircle className="h-6 w-6 text-green-500" />} />
        <StatsCard label="Rejected" value={stats.rejected} icon={<XCircle className="h-6 w-6 text-red-500" />} />
      </div>

      {reviewClaims.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-orange-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Manual Review Queue ({reviewClaims.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ClaimsTable claims={reviewClaims} linkPrefix="/admin/claims" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">All Claims</CardTitle>
            <div className="flex gap-2">
              <Input
                placeholder="Search member or ref…"
                className="h-8 text-sm w-48"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={decidedByFilter} onValueChange={(v) => v && setDecidedByFilter(v)}>
                <SelectTrigger className="w-32 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="ai">AI only</SelectItem>
                  <SelectItem value="hr">HR only</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
                <SelectTrigger className="w-36 h-8 text-sm">
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
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No claims found</p>
          ) : (
            <ClaimsTable claims={filtered} linkPrefix="/admin/claims" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <AuthGate>
      {user?.role === "admin" ? <AdminDashboard /> : <EmployeeDashboard />}
    </AuthGate>
  );
}
