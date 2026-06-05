"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Claim } from "@/lib/api";
import { formatCurrency, formatDate, statusColors, decisionColors } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, ChevronLeft, Loader2,
  ShieldCheck, FileWarning,
} from "lucide-react";

function StepIcon({ passed, pending }: { passed: boolean; pending?: boolean }) {
  if (pending) return <Clock className="h-4 w-4 text-gray-400" />;
  return passed
    ? <CheckCircle2 className="h-4 w-4 text-green-500" />
    : <XCircle className="h-4 w-4 text-red-500" />;
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">AI Confidence</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const MARKDOWN_CLASSES =
  "text-xs text-gray-500 mt-0.5 " +
  "[&_p]:my-1 [&_strong]:font-semibold [&_strong]:text-gray-700 " +
  "[&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-1 " +
  "[&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-1 " +
  "[&_li]:my-0.5 " +
  "[&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-gray-700 [&_h1]:mt-2 " +
  "[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-gray-700 [&_h2]:mt-2 " +
  "[&_h3]:font-semibold [&_h3]:text-gray-700 [&_h3]:mt-1 " +
  "[&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded";

export const REASON_LABELS: Record<string, string> = {
  POLICY_INACTIVE: "Policy not active",
  WAITING_PERIOD: "Treatment during waiting period",
  MEMBER_NOT_COVERED: "Member not covered",
  MISSING_DOCUMENTS: "Missing required documents",
  ILLEGIBLE_DOCUMENTS: "Documents not readable",
  INVALID_PRESCRIPTION: "Invalid prescription",
  DOCTOR_REG_INVALID: "Doctor registration invalid",
  DATE_MISMATCH: "Document date mismatch",
  PATIENT_MISMATCH: "Patient details mismatch",
  SERVICE_NOT_COVERED: "Service not covered",
  EXCLUDED_CONDITION: "Excluded condition",
  PRE_AUTH_MISSING: "Pre-authorization missing",
  ANNUAL_LIMIT_EXCEEDED: "Annual limit exceeded",
  SUB_LIMIT_EXCEEDED: "Category sub-limit exceeded",
  PER_CLAIM_EXCEEDED: "Exceeds per-claim limit (₹5,000)",
  NOT_MEDICALLY_NECESSARY: "Not medically necessary",
  EXPERIMENTAL_TREATMENT: "Experimental treatment",
  COSMETIC_PROCEDURE: "Cosmetic procedure",
  LATE_SUBMISSION: "Submitted after 30-day deadline",
  DUPLICATE_CLAIM: "Duplicate claim",
  BELOW_MIN_AMOUNT: "Below minimum claim amount (₹500)",
};

interface ClaimDetailViewProps {
  claim: Claim;
  /** Optional admin-only slot rendered below the line items (e.g. Manual Review Override card). */
  adminPanel?: ReactNode;
  /** Where the "Back" button should go. Defaults to "/". */
  backHref?: string;
}

export function ClaimDetailView({ claim, adminPanel, backHref = "/" }: ClaimDetailViewProps) {
  const router = useRouter();
  const decision = claim.decision;
  const isProcessing = ["submitted", "processing"].includes(claim.status);
  const isUnderReview = claim.status === "manual_review";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{claim.claim_ref}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[claim.status]}`}>
              {claim.status.replaceAll("_", " ")}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {claim.member_name} • Treatment: {formatDate(claim.treatment_date)} • Claimed: {formatCurrency(claim.claim_amount)}
          </p>
        </div>
      </div>

      {isProcessing && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            <div>
              <p className="font-medium text-blue-800">Processing claim…</p>
              <p className="text-sm text-blue-600">AI is extracting documents and running adjudication. This takes ~1 minute.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {decision && (
            <Card className={`border-2 ${decisionColors[decision.decision].replace("bg-", "border-").replace("text-", "").replace(/\s.*/, "")}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold border ${decisionColors[decision.decision]}`}>
                      {decision.decision === "APPROVED" || decision.decision === "DECIDED_BY_HUMAN" ? <ShieldCheck className="h-4 w-4" /> :
                        decision.decision === "REJECTED" ? <XCircle className="h-4 w-4" /> :
                          decision.decision === "MANUAL_REVIEW" ? <AlertTriangle className="h-4 w-4" /> :
                            <CheckCircle2 className="h-4 w-4" />}
                      {decision.decision.replaceAll("_", " ")}
                    </div>
                    <div className="mt-3 space-y-0.5">
                      <p className="text-3xl font-bold text-gray-900">{formatCurrency(decision.approved_amount)}</p>
                      <p className="text-sm text-gray-500">Approved amount</p>
                    </div>
                  </div>
                  <ConfidenceBar score={decision.confidence_score} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {(decision.total_copay > 0 || decision.total_discount > 0) && (
                  <div className="flex gap-4 text-sm">
                    {decision.total_copay > 0 && (
                      <span className="text-gray-600">Co-pay deducted: <strong>{formatCurrency(decision.total_copay)}</strong></span>
                    )}
                    {decision.total_discount > 0 && (
                      <span className="text-green-700">Network discount: <strong>{formatCurrency(decision.total_discount)}</strong></span>
                    )}
                  </div>
                )}

                {decision.rejection_reasons.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-gray-700">Rejection reasons</p>
                    <div className="flex flex-wrap gap-1.5">
                      {decision.rejection_reasons.map((r) => (
                        <span key={r} className="px-2 py-1 bg-red-50 text-red-700 text-xs rounded-md border border-red-100">
                          {REASON_LABELS[r] || r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {decision.flags.length > 0 && adminPanel && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-orange-700 flex items-center gap-1">
                      <FileWarning className="h-4 w-4" /> Fraud Indicators
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {decision.flags.map((f, i) => (
                        <span key={i} className="px-2 py-1 bg-orange-50 text-orange-700 text-xs rounded-md border border-orange-100">{f}</span>
                      ))}
                    </div>
                  </div>
                )}

                {decision.notes && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-md p-3 whitespace-pre-line">{decision.notes}</p>
                )}

                {decision.next_steps && (
                  <p className="text-sm text-blue-700 bg-blue-50 rounded-md p-3 border border-blue-100">
                    <strong>Next steps:</strong> {decision.next_steps}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {isUnderReview && !adminPanel && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-orange-900">Your claim is under review</p>
                  <p className="text-sm text-orange-800">
                    A claims officer will contact you within 2 working days. No further action is needed from your side.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {decision?.line_items && decision.line_items.length > 0 && decision.decision !== "REJECTED" && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Line Items</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b text-xs">
                      <th className="pb-2 font-medium">Item</th>
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 font-medium text-right">Claimed</th>
                      <th className="pb-2 font-medium text-right">Approved</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decision.line_items.map((li) => (
                      <tr key={li.id} className="border-b last:border-0">
                        <td className="py-2">{li.name}</td>
                        <td className="py-2 text-gray-500 capitalize">{li.category}</td>
                        <td className="py-2 text-right">{formatCurrency(li.claimed_amount)}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(li.approved_amount)}</td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${li.status === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {li.status}
                          </span>
                          {li.reason && <span className="ml-1 text-xs text-gray-400">— {REASON_LABELS[li.reason] || li.reason}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {adminPanel}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Adjudication Steps</CardTitle></CardHeader>
            <CardContent>
              {!decision && isProcessing && (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-300" />
                      <span className="text-sm text-gray-300">Step {i}</span>
                    </div>
                  ))}
                </div>
              )}
              {decision && (
                <div className="space-y-3">
                  {decision.reasoning_steps.map((step, idx) => (
                    <div key={idx}>
                      <div className="flex items-start gap-2">
                        <StepIcon passed={step.passed} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">{step.name}</p>
                          {step.reasons.length > 0 && (
                            <p className="text-xs text-red-600 mt-0.5">
                              {step.reasons.map((r) => REASON_LABELS[r] || r).join(", ")}
                            </p>
                          )}
                          {step.notes && (
                            <div className={MARKDOWN_CLASSES}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{step.notes}</ReactMarkdown>
                            </div>
                          )}
                        </div>
                      </div>
                      {idx < decision.reasoning_steps.length - 1 && (
                        <div className="ml-2 mt-1 mb-1 w-px h-3 bg-gray-200" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Claim Info</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              {[
                ["Member", claim.member_name || claim.member_id],
                ["Hospital", claim.hospital || "Not specified"],
                ["Treatment Date", formatDate(claim.treatment_date)],
                ["Submitted", formatDate(claim.submission_date)],
                ["Claim Amount", formatCurrency(claim.claim_amount)],
                ["Cashless", claim.cashless_request ? "Yes" : "No"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-medium text-right">{v}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
