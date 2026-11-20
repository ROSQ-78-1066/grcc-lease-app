"use client";
import { useState } from "react";
import { emptyForm, LeaseForm, recalc, Suite } from "@/lib/lease";
import { StepFinish } from "./StepFinish";
import { StepReview } from "./StepReview";
import { StepSuite } from "./StepSuite";
import { StepTenant } from "./StepTenant";

export type Touched = Partial<Record<"terminationDate" | "anniversaryDate" | "firstEscalationDate" | "renewalStartDate" | "securityDeposit", boolean>>;

export interface WizardState {
  form: LeaseForm;
  suite: Suite | null;
  touched: Touched;
  aiNotes: string[];
  landlordEmail: string;
}

const STEPS = ["Suite & Template", "Tenant Documents", "Review & Customize", "Generate & Send"];

export function Wizard() {
  const [step, setStep] = useState(0);
  const [st, setSt] = useState<WizardState>({
    form: recalc(emptyForm()),
    suite: null,
    touched: {},
    aiNotes: [],
    landlordEmail: "",
  });
  const update = (p: Partial<WizardState>) => setSt((s) => ({ ...s, ...p }));

  return (
    <div>
      <div className="mb-5 sm:hidden">
        <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Step {step + 1} of {STEPS.length}
        </div>
        <div className="text-lg font-semibold">{STEPS[step]}</div>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}: ${label}`}
              className={`h-1.5 rounded-full ${i <= step ? "bg-brand-600" : "bg-stone-200"}`}
            />
          ))}
        </div>
      </div>
      <ol className="mb-8 hidden grid-cols-4 gap-2 sm:grid">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                i === step
                  ? "border-brand-600 bg-brand-50"
                  : i < step
                    ? "border-stone-200 bg-white hover:border-brand-600"
                    : "border-stone-200 bg-stone-100 text-stone-400"
              }`}
            >
              <span className="block text-xs font-semibold uppercase tracking-wide text-stone-500">Step {i + 1}</span>
              <span className="block text-sm font-medium">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && <StepSuite st={st} update={update} next={() => setStep(1)} />}
      {step === 1 && <StepTenant st={st} update={update} back={() => setStep(0)} next={() => setStep(2)} />}
      {step === 2 && <StepReview st={st} update={update} back={() => setStep(1)} next={() => setStep(3)} />}
      {step === 3 && <StepFinish st={st} back={() => setStep(2)} />}
    </div>
  );
}
