"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Provider } from "@/lib/types";
import { createRun, listProviders } from "@/lib/api";

const ANALYSTS = [
  { key: "market",       label: "Market Analyst",       desc: "Technical indicators, price action" },
  { key: "social",       label: "Social Analyst",        desc: "Sentiment from company news" },
  { key: "news",         label: "News Analyst",          desc: "Macro & global news impact" },
  { key: "fundamentals", label: "Fundamentals Analyst",  desc: "Financials, balance sheet" },
];

const DEPTHS = [
  { value: 1, label: "Shallow",  desc: "1 debate round — fast, lower cost" },
  { value: 3, label: "Medium",   desc: "3 rounds — balanced" },
  { value: 5, label: "Deep",     desc: "5 rounds — thorough, higher cost" },
];

const LANGUAGES = [
  "English","Chinese","Japanese","Korean","Spanish","French","German","Portuguese","Arabic","Russian",
];

const EFFORT_OPTIONS = [
  { value: "low",    label: "Low — faster, cheaper" },
  { value: "medium", label: "Medium (recommended)" },
  { value: "high",   label: "High — most thorough" },
];

const THINKING_OPTIONS = [
  { value: "minimal", label: "Minimal / disabled" },
  { value: "high",    label: "Enabled (recommended)" },
];

interface FormState {
  ticker: string;
  analysis_date: string;
  analysts: string[];
  research_depth: number;
  output_language: string;
  llm_provider: string;
  quick_think_llm: string;
  deep_think_llm: string;
  openai_reasoning_effort: string;
  google_thinking_level: string;
  anthropic_effort: string;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function RunWizard() {
  const router = useRouter();
  const [step, setStep]           = useState(0);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState("");
  const [maxDate, setMaxDate]     = useState("");
  const [form, setForm]           = useState<FormState>({
    ticker: "",
    analysis_date: "",
    analysts: ["market", "social", "news", "fundamentals"],
    research_depth: 1,
    output_language: "English",
    llm_provider: "",
    quick_think_llm: "",
    deep_think_llm: "",
    openai_reasoning_effort: "medium",
    google_thinking_level: "high",
    anthropic_effort: "high",
  });

  useEffect(() => {
    listProviders().then(setProviders).catch(() => {});
    const t = today();
    setMaxDate(t);
    setForm((f) => ({ ...f, analysis_date: t }));
  }, []);

  const set = (k: keyof FormState, v: unknown) =>
    setForm((f) => ({ ...f, [k as string]: v }));

  const selectedProvider = providers.find((p) => p.key === form.llm_provider);

  // Auto-fill first models when provider changes
  const handleProviderSelect = (key: string) => {
    const p = providers.find((pr) => pr.key === key);
    set("llm_provider", key);
    if (p) {
      set("quick_think_llm", p.quick_models[0]?.value ?? "");
      set("deep_think_llm",  p.deep_models[0]?.value  ?? "");
    }
  };

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      const run = await createRun({
        ticker: form.ticker.toUpperCase(),
        analysis_date: form.analysis_date,
        analysts: form.analysts,
        research_depth: form.research_depth,
        output_language: form.output_language,
        llm_provider: form.llm_provider,
        quick_think_llm: form.quick_think_llm,
        deep_think_llm: form.deep_think_llm,
        openai_reasoning_effort: selectedProvider?.thinking_config === "reasoning_effort" ? form.openai_reasoning_effort : null,
        google_thinking_level: selectedProvider?.thinking_config === "thinking_level" ? form.google_thinking_level : null,
        anthropic_effort: selectedProvider?.thinking_config === "effort" ? form.anthropic_effort : null,
      });
      router.push(`/run/${run.id}`);
    } catch (e: unknown) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  const STEPS = [
    "Ticker & Date",
    "Analysts",
    "Depth & Language",
    "Provider",
    "Models",
    "Review",
  ];

  const canNext = () => {
    if (step === 0) return form.ticker.trim().length > 0 && form.analysis_date.length === 10;
    if (step === 1) return form.analysts.length > 0;
    if (step === 3) return form.llm_provider.length > 0;
    if (step === 4) return form.quick_think_llm.length > 0 && form.deep_think_llm.length > 0;
    return true;
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center flex-1">
            <button
              onClick={() => i < step && setStep(i)}
              className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                i < step ? "bg-green-600 text-white cursor-pointer" :
                i === step ? "bg-green-500 text-white" : "bg-gray-700 text-gray-500"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </button>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 ${i < step ? "bg-green-600" : "bg-gray-700"}`} />
            )}
          </div>
        ))}
      </div>
      <h2 className="text-lg font-semibold text-white mb-6">Step {step + 1}: {STEPS[step]}</h2>

      {/* Step 0: Ticker + Date */}
      {step === 0 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Ticker Symbol</label>
            <input
              type="text"
              value={form.ticker}
              onChange={(e) => set("ticker", e.target.value.toUpperCase())}
              placeholder="e.g. SPY, NVDA, 7203.T"
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Analysis Date</label>
            <input
              type="date"
              value={form.analysis_date}
              max={maxDate}
              onChange={(e) => set("analysis_date", e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-green-500"
            />
          </div>
        </div>
      )}

      {/* Step 1: Analysts */}
      {step === 1 && (
        <div className="space-y-2">
          {ANALYSTS.map(({ key, label, desc }) => {
            const checked = form.analysts.includes(key);
            return (
              <label
                key={key}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  checked ? "border-green-600 bg-green-900/20" : "border-gray-700 hover:border-gray-600"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    set("analysts", e.target.checked
                      ? [...form.analysts, key]
                      : form.analysts.filter((a) => a !== key))
                  }
                  className="mt-0.5 accent-green-500"
                />
                <div>
                  <p className="text-sm font-medium text-white">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              </label>
            );
          })}
        </div>
      )}

      {/* Step 2: Depth + Language */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <p className="text-sm text-gray-400 mb-2">Research Depth</p>
            <div className="space-y-2">
              {DEPTHS.map(({ value, label, desc }) => (
                <label
                  key={value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    form.research_depth === value ? "border-green-600 bg-green-900/20" : "border-gray-700 hover:border-gray-600"
                  }`}
                >
                  <input
                    type="radio"
                    name="depth"
                    checked={form.research_depth === value}
                    onChange={() => set("research_depth", value)}
                    className="mt-0.5 accent-green-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-white">{label}</p>
                    <p className="text-xs text-gray-500">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Output Language</label>
            <select
              value={form.output_language}
              onChange={(e) => set("output_language", e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-green-500"
            >
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Step 3: Provider */}
      {step === 3 && (
        <div className="grid grid-cols-2 gap-2">
          {providers.map((p) => (
            <button
              key={p.key}
              onClick={() => handleProviderSelect(p.key)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                form.llm_provider === p.key ? "border-green-500 bg-green-900/20" : "border-gray-700 hover:border-gray-600"
              }`}
            >
              <p className="text-sm font-medium text-white">{p.display}</p>
            </button>
          ))}
        </div>
      )}

      {/* Step 4: Models + thinking config */}
      {step === 4 && selectedProvider && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Quick-Thinking Model (analysts, researchers)</label>
            <select
              value={form.quick_think_llm}
              onChange={(e) => set("quick_think_llm", e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-green-500"
            >
              {selectedProvider.quick_models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Deep-Thinking Model (managers, portfolio)</label>
            <select
              value={form.deep_think_llm}
              onChange={(e) => set("deep_think_llm", e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-green-500"
            >
              {selectedProvider.deep_models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Provider-specific thinking config */}
          {selectedProvider.thinking_config === "reasoning_effort" && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Reasoning Effort</label>
              <select
                value={form.openai_reasoning_effort}
                onChange={(e) => set("openai_reasoning_effort", e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-green-500"
              >
                {EFFORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {selectedProvider.thinking_config === "effort" && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Effort Level</label>
              <select
                value={form.anthropic_effort}
                onChange={(e) => set("anthropic_effort", e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-green-500"
              >
                {EFFORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {selectedProvider.thinking_config === "thinking_level" && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Thinking Mode</label>
              <select
                value={form.google_thinking_level}
                onChange={(e) => set("google_thinking_level", e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-green-500"
              >
                {THINKING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Step 5: Review */}
      {step === 5 && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-3 text-sm">
          {[
            ["Ticker",      form.ticker],
            ["Date",        form.analysis_date],
            ["Analysts",    form.analysts.join(", ")],
            ["Depth",       `${form.research_depth} round${form.research_depth > 1 ? "s" : ""}`],
            ["Language",    form.output_language],
            ["Provider",    selectedProvider?.display ?? form.llm_provider],
            ["Quick Model", form.quick_think_llm],
            ["Deep Model",  form.deep_think_llm],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-gray-500">{k}</span>
              <span className="text-white font-mono text-right ml-4">{v}</span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-900/30 border border-red-700 rounded p-3 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="px-4 py-2 rounded border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
        >
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext()}
            className="px-5 py-2 rounded bg-green-700 hover:bg-green-600 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 transition-colors text-sm font-semibold"
          >
            {submitting ? "Starting…" : "Start Analysis →"}
          </button>
        )}
      </div>
    </div>
  );
}
