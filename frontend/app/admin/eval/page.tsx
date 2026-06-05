"use client";

import { useState } from "react";
import { api, EvalResult } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle2, XCircle, Play, Loader2, BarChart3 } from "lucide-react";
import { AuthGate } from "@/components/auth-gate";

function EvalPageContent() {
  const [result, setResult] = useState<EvalResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const data = await api.runEval();
      setResult(data);
      toast.success(`Evaluation complete: ${Math.round(data.decision_accuracy * 100)}% accuracy`);
    } catch (err) {
      toast.error("Evaluation failed: " + String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Adjudication Evaluation</h1>
          <p className="text-sm text-gray-500 mt-1">Run test_cases.json through the engine and measure accuracy</p>
        </div>
        <Button onClick={run} disabled={running} className="bg-blue-600 hover:bg-blue-700">
          {running ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Running…</> : <><Play className="h-4 w-4 mr-2" /> Run Evaluation</>}
        </Button>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Cases", value: result.total_cases, color: "text-gray-900" },
              { label: "Decision Accuracy", value: `${Math.round(result.decision_accuracy * 100)}%`, color: result.decision_accuracy >= 0.9 ? "text-green-700" : "text-red-700" },
              { label: "Amount Accuracy", value: `${Math.round(result.amount_accuracy * 100)}%`, color: result.amount_accuracy >= 0.9 ? "text-green-700" : "text-yellow-700" },
              { label: "Avg Latency", value: `${Math.round(result.avg_latency_ms)}ms`, color: "text-gray-900" },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardContent className="pt-5">
                  <p className="text-sm text-gray-500">{label}</p>
                  <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Case Results</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b text-xs">
                    <th className="pb-2 font-medium">Case</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Expected</th>
                    <th className="pb-2 font-medium">Actual</th>
                    <th className="pb-2 font-medium text-right">Exp Amount</th>
                    <th className="pb-2 font-medium text-right">Actual Amount</th>
                    <th className="pb-2 font-medium text-right">Confidence</th>
                    <th className="pb-2 font-medium text-right">Latency</th>
                    <th className="pb-2 font-medium text-center">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {result.cases.map((c) => {
                    const pass = c.decision_match && c.amount_match;
                    return (
                      <tr key={c.case_id} className={`border-b last:border-0 ${pass ? "" : "bg-red-50"}`}>
                        <td className="py-2 font-mono text-xs text-gray-500">{c.case_id}</td>
                        <td className="py-2 text-xs">{c.case_name}</td>
                        <td className="py-2">
                          <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-700">{c.expected_decision}</span>
                        </td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${c.decision_match ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                            {c.actual_decision}
                          </span>
                        </td>
                        <td className="py-2 text-right text-gray-500">
                          {c.expected_amount != null ? formatCurrency(c.expected_amount) : "—"}
                        </td>
                        <td className={`py-2 text-right font-medium ${c.amount_match ? "text-green-700" : "text-red-700"}`}>
                          {formatCurrency(c.actual_amount)}
                        </td>
                        <td className="py-2 text-right text-gray-500">{Math.round(c.actual_confidence * 100)}%</td>
                        <td className="py-2 text-right text-gray-500">{c.latency_ms}ms</td>
                        <td className="py-2 text-center">
                          {pass
                            ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                            : <XCircle className="h-4 w-4 text-red-500 mx-auto" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {!result && !running && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <BarChart3 className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">Click "Run Evaluation" to test the adjudication engine against all 10 test cases</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function EvalPage() {
  return (
    <AuthGate requiredRole="admin">
      <EvalPageContent />
    </AuthGate>
  );
}
