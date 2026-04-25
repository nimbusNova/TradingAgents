"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import FinalDecisionBadge from "./FinalDecisionBadge";

interface Section { title: string; key: string }

const ANALYST_SECTIONS: Section[] = [
  { title: "Market Analysis",   key: "market_report" },
  { title: "Social Sentiment",  key: "sentiment_report" },
  { title: "News Analysis",     key: "news_report" },
  { title: "Fundamentals",      key: "fundamentals_report" },
];

const RESEARCH_SECTIONS: Section[] = [
  { title: "Bull Researcher",   key: "debate_bull_history" },
  { title: "Bear Researcher",   key: "debate_bear_history" },
  { title: "Research Manager",  key: "investment_plan" },
];

const RISK_SECTIONS: Section[] = [
  { title: "Aggressive Analyst",  key: "risk_aggressive_history" },
  { title: "Conservative Analyst",key: "risk_conservative_history" },
  { title: "Neutral Analyst",     key: "risk_neutral_history" },
];

function Md({ content }: { content: string }) {
  return (
    <div className="prose-dark text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function PhaseHeader({ label }: { label: string }) {
  return (
    <h2 className="text-base font-bold text-green-400 uppercase tracking-wider border-b border-gray-700 pb-1 mb-4">
      {label}
    </h2>
  );
}

function SectionBlock({ title, content }: { title: string; content: string }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-2">{title}</h3>
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <Md content={content} />
      </div>
    </div>
  );
}

export default function ReportView({ sections }: { sections: Record<string, string> }) {
  const analystSections  = ANALYST_SECTIONS.filter((s) => sections[s.key]);
  const researchSections = RESEARCH_SECTIONS.filter((s) => sections[s.key]);
  const riskSections     = RISK_SECTIONS.filter((s) => sections[s.key]);
  const traderPlan       = sections["trader_investment_plan"];
  const finalDecision    = sections["final_trade_decision"];

  return (
    <div className="space-y-8">
      {analystSections.length > 0 && (
        <section>
          <PhaseHeader label="I. Analyst Team Reports" />
          {analystSections.map((s) => <SectionBlock key={s.key} title={s.title} content={sections[s.key]} />)}
        </section>
      )}
      {researchSections.length > 0 && (
        <section>
          <PhaseHeader label="II. Research Team Decision" />
          {researchSections.map((s) => <SectionBlock key={s.key} title={s.title} content={sections[s.key]} />)}
        </section>
      )}
      {traderPlan && (
        <section>
          <PhaseHeader label="III. Trading Team Plan" />
          <SectionBlock title="Trader" content={traderPlan} />
        </section>
      )}
      {riskSections.length > 0 && (
        <section>
          <PhaseHeader label="IV. Risk Management" />
          {riskSections.map((s) => <SectionBlock key={s.key} title={s.title} content={sections[s.key]} />)}
        </section>
      )}
      {finalDecision && (
        <section>
          <PhaseHeader label="V. Portfolio Manager Decision" />
          <div className="mb-4">
            <FinalDecisionBadge decision={sections["final_trade_decision"]?.match(/\b(BUY|SELL|HOLD|OVERWEIGHT|UNDERWEIGHT)\b/i)?.[0] ?? null} size="lg" />
          </div>
          <SectionBlock title="Portfolio Manager" content={finalDecision} />
        </section>
      )}
    </div>
  );
}
