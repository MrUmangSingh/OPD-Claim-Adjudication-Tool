"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, Member } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, FileText, Loader2 } from "lucide-react";

interface UploadedFile {
  file: File;
  docType: string;
}

const DOC_TYPES = [
  { value: "prescription", label: "Prescription" },
  { value: "bill", label: "Medical Bill" },
  { value: "diagnostic_report", label: "Diagnostic Report" },
  { value: "pharmacy_bill", label: "Pharmacy Bill" },
];

export default function NewClaimPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    member_id: "",
    treatment_date: "",
    claim_amount: "",
    hospital: "",
    cashless_request: false,
  });
  const [files, setFiles] = useState<UploadedFile[]>([]);

  useEffect(() => {
    api.getMembers().then(setMembers).catch(() => {});
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).map((f) => ({ file: f, docType: "bill" }));
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).map((f) => ({ file: f, docType: "bill" }));
    setFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.member_id) { toast.error("Please select a member"); return; }
    if (!form.treatment_date) { toast.error("Please enter treatment date"); return; }
    if (!form.claim_amount) { toast.error("Please enter claim amount"); return; }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("member_id", form.member_id);
      fd.append("treatment_date", form.treatment_date);
      fd.append("claim_amount", form.claim_amount);
      if (form.hospital) fd.append("hospital", form.hospital);
      fd.append("cashless_request", String(form.cashless_request));
      files.forEach((f) => {
        fd.append("files", f.file);
        fd.append("doc_types", f.docType);
      });

      const claim = await api.submitClaim(fd);
      toast.success("Claim submitted! Processing in background…");
      router.push(`/claims/${claim.id}`);
    } catch (err) {
      toast.error("Submission failed: " + String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Submit OPD Claim</h1>
        <p className="text-sm text-gray-500 mt-1">Upload medical documents for AI-powered adjudication</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Claim Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Member</Label>
              <Select value={form.member_id} onValueChange={(v) => v && setForm({ ...form, member_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select member…" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.member_id} value={m.member_id}>
                      {m.name} ({m.member_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Treatment Date</Label>
                <Input type="date" value={form.treatment_date}
                  onChange={(e) => setForm({ ...form, treatment_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Claim Amount (₹)</Label>
                <Input type="number" placeholder="e.g. 2500" value={form.claim_amount}
                  onChange={(e) => setForm({ ...form, claim_amount: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Hospital / Clinic (optional)</Label>
              <Input placeholder="e.g. Apollo Hospitals" value={form.hospital}
                onChange={(e) => setForm({ ...form, hospital: e.target.value })} />
              <p className="text-xs text-gray-400">Network hospitals: Apollo, Fortis, Max, Manipal, Narayana</p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300"
                checked={form.cashless_request}
                onChange={(e) => setForm({ ...form, cashless_request: e.target.checked })} />
              <span className="text-sm">Cashless claim request</span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div
              className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Drag & drop files here, or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG supported</p>
              <input id="file-input" type="file" multiple accept=".pdf,.jpg,.jpeg,.png"
                className="hidden" onChange={handleFileInput} />
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <span className="text-sm flex-1 truncate">{f.file.name}</span>
                    <Select value={f.docType} onValueChange={(v) => {
                      if (!v) return;
                      const updated = [...files];
                      updated[idx] = { ...f, docType: v };
                      setFiles(updated);
                    }}>
                      <SelectTrigger className="w-40 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map((d) => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button type="button" onClick={() => setFiles(files.filter((_, i) => i !== idx))}>
                      <X className="h-4 w-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push("/")}>Cancel</Button>
          <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 min-w-32">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting…</> : "Submit Claim"}
          </Button>
        </div>
      </form>
    </div>
  );
}
