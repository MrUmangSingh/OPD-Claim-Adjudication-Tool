const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export interface DecisionLineItem {
  id: number;
  name: string;
  category: string;
  claimed_amount: number;
  approved_amount: number;
  status: "approved" | "rejected" | "partial";
  reason?: string;
}

export interface ReasoningStep {
  step: number;
  name: string;
  passed: boolean;
  reasons: string[];
  notes: string;
}

export interface Decision {
  id: number;
  decision: "APPROVED" | "REJECTED" | "PARTIAL" | "MANUAL_REVIEW" | "DECIDED_BY_HUMAN";
  approved_amount: number;
  total_copay: number;
  total_discount: number;
  rejection_reasons: string[];
  flags: string[];
  confidence_score: number;
  notes?: string;
  next_steps?: string;
  reasoning_steps: ReasoningStep[];
  line_items: DecisionLineItem[];
  created_at: string;
}

export interface Claim {
  id: number;
  claim_ref: string;
  member_id: string;
  member_name?: string;
  hospital?: string;
  treatment_date: string;
  submission_date: string;
  claim_amount: number;
  status: string;
  cashless_request: boolean;
  created_at: string;
  decision?: Decision;
}

export interface Member {
  member_id: string;
  name: string;
  join_date: string;
}

export interface EvalCaseResult {
  case_id: string;
  case_name: string;
  expected_decision: string;
  actual_decision: string;
  expected_amount?: number;
  actual_amount: number;
  expected_confidence?: number;
  actual_confidence: number;
  decision_match: boolean;
  amount_match: boolean;
  latency_ms: number;
  rejection_reasons: string[];
  notes: string;
}

export interface EvalResult {
  total_cases: number;
  decision_accuracy: number;
  amount_accuracy: number;
  avg_latency_ms: number;
  cases: EvalCaseResult[];
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  getClaims: (status?: string) =>
    request<Claim[]>(`/claims${status ? `?status=${status}` : ""}`),

  getClaim: (id: number) => request<Claim>(`/claims/${id}`),

  getMembers: () => request<Member[]>("/members"),

  getPolicy: () => request<Record<string, unknown>>("/policy"),

  updatePolicy: (payload: Record<string, unknown>) =>
    request<Record<string, unknown>>("/policy", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  submitClaim: (formData: FormData) =>
    fetch(`${API_URL}/claims`, { method: "POST", body: formData }).then((r) => {
      if (!r.ok) throw new Error(`Submission failed: ${r.status}`);
      return r.json() as Promise<Claim>;
    }),

  submitReview: (claimId: number, body: {
    action: string;
    override_decision: string;
    override_amount?: number;
    reviewer_notes: string;
  }) =>
    request(`/claims/${claimId}/review`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  runEval: () =>
    fetch(`${API_URL}/eval/adjudication`, { method: "POST" }).then((r) => r.json() as Promise<EvalResult>),
};
