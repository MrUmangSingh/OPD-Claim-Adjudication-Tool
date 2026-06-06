const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

const TOKEN_KEY = "opd_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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
  decided_by_human: boolean;
  effective_decision?: string;
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

export interface CategoryBenefit {
  category: string;
  label: string;
  limit: number;
  used: number;
  remaining: number | null;
}

export interface Benefits {
  annual_limit: number;
  per_claim_limit: number;
  used_ytd: number;
  remaining: number;
  year: number;
  by_category: CategoryBenefit[];
  network_hospitals: string[];
  covered_tests: string[];
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...options?.headers },
  });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: { member_id: string; name: string; email: string; role: string };
}

export const api = {
  signup: (name: string, email: string, password: string) =>
    fetch(`${API_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    }).then(async (r) => {
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`API error ${r.status}: ${text}`);
      }
      return r.json() as Promise<AuthResponse>;
    }),


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
    fetch(`${API_URL}/claims`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    }).then((r) => {
      if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); window.location.href = "/login"; throw new Error("Unauthorized"); }
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
    fetch(`${API_URL}/eval/adjudication`, {
      method: "POST",
      headers: authHeaders(),
    }).then((r) => {
      if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); window.location.href = "/login"; throw new Error("Unauthorized"); }
      return r.json() as Promise<EvalResult>;
    }),

  getMyBenefits: () => request<Benefits>("/me/benefits"),
};
