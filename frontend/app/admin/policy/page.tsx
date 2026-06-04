"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { ShieldCheck, Loader2 } from "lucide-react";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-0 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

export default function PolicyPage() {
  const [policy, setPolicy] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.getPolicy().then(setPolicy).catch(() => {});
  }, []);

  if (!policy) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
    </div>
  );

  const cov = policy.coverage_details as Record<string, unknown>;
  const cons = cov.consultation_fees as Record<string, unknown>;
  const diag = cov.diagnostic_tests as Record<string, unknown>;
  const pharm = cov.pharmacy as Record<string, unknown>;
  const dental = cov.dental as Record<string, unknown>;
  const vision = cov.vision as Record<string, unknown>;
  const alt = cov.alternative_medicine as Record<string, unknown>;
  const wait = policy.waiting_periods as Record<string, unknown>;
  const spec = wait.specific_ailments as Record<string, unknown>;
  const excl = policy.exclusions as string[];
  const net = policy.network_hospitals as string[];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{policy.policy_name as string}</h1>
          <p className="text-sm text-gray-500">Policy ID: {policy.policy_id as string} • Effective: {policy.effective_date as string}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Coverage Limits</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Annual Limit" value={formatCurrency(cov.annual_limit as number)} />
            <InfoRow label="Per-Claim Limit" value={formatCurrency(cov.per_claim_limit as number)} />
            <InfoRow label="Family Floater Limit" value={formatCurrency(cov.family_floater_limit as number)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Consultation</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Sub-Limit" value={formatCurrency(cons.sub_limit as number)} />
            <InfoRow label="Co-pay" value={`${cons.copay_percentage}%`} />
            <InfoRow label="Network Discount" value={`${cons.network_discount}%`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Diagnostic Tests</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Sub-Limit" value={formatCurrency(diag.sub_limit as number)} />
            <InfoRow label="Covered Tests" value={
              <span className="text-xs text-gray-600 text-right">
                {(diag.covered_tests as string[]).join(", ")}
              </span>
            } />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Pharmacy</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Sub-Limit" value={formatCurrency(pharm.sub_limit as number)} />
            <InfoRow label="Generic Drugs Mandatory" value={(pharm.generic_drugs_mandatory as boolean) ? "Yes" : "No"} />
            <InfoRow label="Branded Drug Co-pay" value={`${pharm.branded_drugs_copay}%`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Dental</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Sub-Limit" value={formatCurrency(dental.sub_limit as number)} />
            <InfoRow label="Routine Checkup" value={formatCurrency(dental.routine_checkup_limit as number)} />
            <InfoRow label="Cosmetic" value="Not Covered" />
            <InfoRow label="Covered Procedures" value={
              <span className="text-xs">{(dental.procedures_covered as string[]).join(", ")}</span>
            } />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Vision</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Sub-Limit" value={formatCurrency(vision.sub_limit as number)} />
            <InfoRow label="Glasses/Contacts" value={(vision.glasses_contact_lenses as boolean) ? "Covered" : "Not Covered"} />
            <InfoRow label="LASIK Surgery" value="Not Covered" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Alternative Medicine</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Sub-Limit" value={formatCurrency(alt.sub_limit as number)} />
            <InfoRow label="Treatments" value={(alt.covered_treatments as string[]).join(", ")} />
            <InfoRow label="Sessions Limit" value={`${alt.therapy_sessions_limit} sessions`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Waiting Periods</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Initial Waiting" value={`${wait.initial_waiting} days`} />
            <InfoRow label="Pre-existing Diseases" value={`${wait.pre_existing_diseases} days`} />
            <InfoRow label="Maternity" value={`${wait.maternity} days`} />
            {Object.entries(spec).map(([k, v]) => (
              <InfoRow key={k} label={k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} value={`${v} days`} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Exclusions</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {excl.map((e, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-red-400 rounded-full flex-shrink-0" />
                  {e}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Network Hospitals</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {net.map((h, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-green-400 rounded-full flex-shrink-0" />
                  {h}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-3">Network hospitals receive 20% discount. Copay waived.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
