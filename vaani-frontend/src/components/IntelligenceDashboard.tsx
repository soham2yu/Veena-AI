"use client";

import { IncidentState, Fact, Hypothesis, Action, Risk, TimelineEvent } from '@/types';
import { useState } from 'react';
import { ShieldAlert, Clock, Activity, CheckCircle, Database, GitBranch, Bug } from 'lucide-react';

export default function IntelligenceDashboard({ state, onConnectProject }: { state: IncidentState | null, onConnectProject?: () => void }) {
  const [expandedSection, setExpandedSection] = useState<'facts' | 'hypotheses' | 'actions' | 'risks' | 'timeline' | 'code_findings' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const allFacts = state?.topics?.flatMap(t => t.facts) || [];
  const allHypotheses = state?.topics?.flatMap(t => t.hypotheses) || [];
  const allActions = state?.topics?.flatMap(t => t.actions) || [];
  const allRisks = state?.risks || [];
  const allTimeline = state?.timeline || [];
  const allCodeFindings = state?.code_findings || [];

  const handleExpand = (section: 'facts' | 'hypotheses' | 'actions' | 'risks' | 'timeline' | 'code_findings') => {
    setExpandedSection(section);
    setSearchQuery('');
  };

  const closeExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSection(null);
  };

  const renderExpanded = () => {
    if (!expandedSection) return null;

    let title: string, data: unknown[], renderer: (item: unknown, i: number) => React.ReactNode;
    if (expandedSection === 'facts') {
      title = 'Verified Facts';
      data = allFacts.filter(f => !searchQuery || f.statement.toLowerCase().includes(searchQuery.toLowerCase()) || f.speaker.toLowerCase().includes(searchQuery.toLowerCase()));
      renderer = (item: unknown, i: number) => { const f = item as Fact; return (
        <div key={i} className="text-white/80 border-l-2 border-green-500/50 pl-4 py-2 text-sm bg-white/5 pr-4 rounded-r-lg flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-green-400 font-mono text-[10px]">[{f.speaker}]</span>
            <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded ${f.confidence === 'verified' ? 'bg-green-500/20 text-green-300' : 'bg-white/10 text-white/50'}`}>{f.confidence}</span>
          </div>
          <span className="text-white">{f.statement}</span>
        </div>
      )};
    } else if (expandedSection === 'hypotheses') {
      title = 'Active Hypotheses';
      data = allHypotheses.filter(h => !searchQuery || h.statement.toLowerCase().includes(searchQuery.toLowerCase()) || h.speaker.toLowerCase().includes(searchQuery.toLowerCase()));
      renderer = (item: unknown, i: number) => { const h = item as Hypothesis; return (
        <div key={i} className="text-white/80 border-l-2 border-blue-500/50 pl-4 py-2 text-sm bg-white/5 pr-4 rounded-r-lg flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 font-mono text-[10px]">[{h.speaker}]</span>
            <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded ${h.status === 'supported' ? 'bg-green-500/20 text-green-300' : h.status === 'refuted' ? 'bg-red-500/20 text-red-300' : 'bg-yellow-500/20 text-yellow-300'}`}>{h.status}</span>
          </div>
          <span className="text-white">{h.statement}</span>
        </div>
      )};
    } else if (expandedSection === 'actions') {
      title = 'Decisions & Actions';
      data = allActions.filter(a => !searchQuery || a.description.toLowerCase().includes(searchQuery.toLowerCase()) || (a.owner && a.owner.toLowerCase().includes(searchQuery.toLowerCase())));
      renderer = (item: unknown, i: number) => { const a = item as Action; return (
        <div key={i} className="text-white/80 border-l-2 border-white/50 pl-4 py-2 text-sm bg-white/5 pr-4 rounded-r-lg flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-white/40 font-mono uppercase text-[9px] bg-black/40 px-2 py-0.5 rounded">{a.owner || 'UNASSIGNED'}</span>
            <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded ${a.priority === 'critical' || a.priority === 'high' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white/50'}`}>{a.priority}</span>
            <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded ${a.status === 'completed' ? 'bg-green-500/20 text-green-300' : 'bg-blue-500/20 text-blue-300'}`}>{a.status}</span>
          </div>
          <span className="text-white">{a.description}</span>
        </div>
      )};
    } else if (expandedSection === 'risks') {
      title = 'Global Risks';
      data = allRisks.filter(r => !searchQuery || r.description.toLowerCase().includes(searchQuery.toLowerCase()));
      renderer = (item: unknown, i: number) => { const r = item as Risk; return (
        <div key={i} className="text-white/80 border-l-2 border-red-500/50 pl-4 py-2 text-sm bg-white/5 pr-4 rounded-r-lg flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={`text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded ${r.severity === 'critical' ? 'bg-red-500/40 text-red-200' : 'bg-orange-500/20 text-orange-300'}`}>{r.severity} Risk</span>
            <span className="text-white/40 font-mono text-[9px]">{r.status}</span>
          </div>
          <span className="text-red-100">{r.description}</span>
        </div>
      )};
    } else if (expandedSection === 'timeline') {
      title = 'Incident Timeline';
      data = allTimeline.filter(t => !searchQuery || t.event.toLowerCase().includes(searchQuery.toLowerCase()));
      renderer = (item: unknown, i: number) => { const t = item as TimelineEvent; return (
        <div key={i} className="text-white/80 border-l-2 border-purple-500/50 pl-4 py-2 text-sm bg-white/5 pr-4 rounded-r-lg flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-purple-400 font-mono text-[10px]">{t.timestamp}</span>
            <span className="text-white/40 text-[9px] uppercase tracking-wider">[{t.speaker}]</span>
            <span className="bg-purple-500/20 text-purple-300 text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded">{t.event_type}</span>
          </div>
          <span className="text-white">{t.event}</span>
        </div>
      )};
    } else {
      title = 'Code Findings';
      data = allCodeFindings.filter(f => !searchQuery || `${f.title} ${f.file} ${f.evidence} ${f.explanation}`.toLowerCase().includes(searchQuery.toLowerCase()));
      renderer = (item: unknown, i: number) => {
        const finding = item as IncidentState['code_findings'][number];
        const severityClass = finding.severity === 'critical' || finding.severity === 'high'
          ? 'border-red-500/50 text-red-200'
          : finding.severity === 'medium' ? 'border-orange-500/50 text-orange-200' : 'border-blue-500/50 text-blue-200';
        return (
          <div key={i} className={`border-l-2 pl-4 py-3 text-sm bg-white/5 pr-4 rounded-r-lg space-y-2 ${severityClass}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-white">{finding.title}</span>
              <span className="text-[8px] uppercase tracking-wider">{finding.severity}</span>
            </div>
            <div className="font-mono text-[10px] text-cyan-300/80">{finding.file}{finding.line ? `:${finding.line}` : ''}</div>
            <p className="text-white/80">{finding.explanation}</p>
            <p className="text-white/50"><span className="text-white/70">Fix:</span> {finding.recommendation}</p>
            <p className="font-mono text-[10px] text-white/40">Evidence: {finding.evidence}</p>
          </div>
        );
      };
    }

    return (
      <div className="fixed inset-y-8 right-8 w-[400px] bg-black/80 backdrop-blur-3xl rounded-2xl border border-white/10 shadow-2xl z-50 flex flex-col overflow-hidden animate-fade-in pointer-events-auto">
        <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/5">
          <h2 className="text-white text-sm font-light tracking-widest uppercase">{title}</h2>
          <button onClick={closeExpanded} className="text-white/50 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="p-4 border-b border-white/5 bg-black/40">
          <input 
            type="text" 
            placeholder="Search records..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-white/30"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scroll">
          {data.length > 0 ? data.map((item, i) => renderer(item, i)) : (
            <div className="text-white/30 text-sm italic">No records match your search.</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Horizontal row of compact widgets */}
      <div className="flex flex-wrap gap-3 items-start animate-fade-in pointer-events-auto" style={{animationDelay: '0.2s'}}>
        
        {/* Room Vibe */}
        <div className="bg-black/50 backdrop-blur-xl border border-white/15 rounded-xl px-4 py-3 flex items-center gap-3 min-w-[140px] relative overflow-hidden">
          <div className="absolute inset-0 opacity-15" style={{
            background: state?.room_vibe === 'Chaotic' ? 'linear-gradient(90deg, transparent, #ef4444)' : 
                        state?.room_vibe === 'Stressed' ? 'linear-gradient(90deg, transparent, #f97316)' :
                        state?.room_vibe === 'Focused' ? 'linear-gradient(90deg, transparent, #3b82f6)' :
                        'linear-gradient(90deg, transparent, #22c55e)'
          }} />
          <div className="relative z-10">
            <h2 className="text-white/40 text-[8px] tracking-[0.2em] uppercase font-bold flex items-center gap-1"><Activity className="w-3 h-3" /> Vibe</h2>
            <div className="text-white text-[12px] uppercase mt-0.5 tracking-widest font-light">{state?.room_vibe || 'Calm'}</div>
          </div>
          <div className="relative z-10 flex h-2.5 w-2.5 ml-auto">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              state?.room_vibe === 'Chaotic' ? 'bg-red-400' : 
              state?.room_vibe === 'Stressed' ? 'bg-orange-400' :
              state?.room_vibe === 'Focused' ? 'bg-blue-400' : 'bg-green-400'
            }`}></span>
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
              state?.room_vibe === 'Chaotic' ? 'bg-red-500' : 
              state?.room_vibe === 'Stressed' ? 'bg-orange-500' :
              state?.room_vibe === 'Focused' ? 'bg-blue-500' : 'bg-green-500'
            }`}></span>
          </div>
        </div>

        {/* Facts */}
        <div onClick={() => handleExpand('facts')} className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-green-500/50 hover:bg-white/5 transition-all flex items-center gap-3 min-w-[130px] group">
          <div>
            <h2 className="text-white/40 text-[8px] tracking-[0.2em] uppercase font-bold group-hover:text-green-500/70 transition-colors flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Facts</h2>
            <div className="text-white/50 text-[8px] uppercase mt-0.5 truncate max-w-[100px]">{allFacts[allFacts.length-1]?.statement?.slice(0,20) || 'None'}</div>
          </div>
          <div className="text-2xl font-black text-white tracking-tighter tabular-nums ml-auto">{allFacts.length.toString().padStart(2, '0')}</div>
        </div>

        {/* Hypotheses */}
        <div onClick={() => handleExpand('hypotheses')} className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-blue-500/50 hover:bg-white/5 transition-all flex items-center gap-3 min-w-[130px] group">
          <div>
            <h2 className="text-white/40 text-[8px] tracking-[0.2em] uppercase font-bold group-hover:text-blue-500/70 transition-colors flex items-center gap-1"><Activity className="w-3 h-3" /> Hypotheses</h2>
            <div className="text-white/50 text-[8px] uppercase mt-0.5 truncate max-w-[100px]">{allHypotheses[allHypotheses.length-1]?.statement?.slice(0,20) || 'None'}</div>
          </div>
          <div className="text-2xl font-black text-white tracking-tighter tabular-nums ml-auto">{allHypotheses.length.toString().padStart(2, '0')}</div>
        </div>

        {/* Actions */}
        <div onClick={() => handleExpand('actions')} className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-white/50 hover:bg-white/5 transition-all flex items-center gap-3 min-w-[130px] group">
          <div>
            <h2 className="text-white/40 text-[8px] tracking-[0.2em] uppercase font-bold group-hover:text-white/70 transition-colors flex items-center gap-1"><Database className="w-3 h-3" /> Actions</h2>
            <div className="text-white/50 text-[8px] uppercase mt-0.5 truncate max-w-[100px]">{allActions[allActions.length-1]?.description?.slice(0,20) || 'None'}</div>
          </div>
          <div className="text-2xl font-black text-white tracking-tighter tabular-nums ml-auto">{allActions.length.toString().padStart(2, '0')}</div>
        </div>

        {/* Risks */}
        <div onClick={() => handleExpand('risks')} className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-red-500/50 hover:bg-white/5 transition-all flex items-center gap-3 min-w-[130px] group">
          <div>
            <h2 className="text-white/40 text-[8px] tracking-[0.2em] uppercase font-bold group-hover:text-red-500/70 transition-colors flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Risks</h2>
            <div className="text-white/50 text-[8px] uppercase mt-0.5 truncate max-w-[100px]">{allRisks[allRisks.length-1]?.description?.slice(0,20) || 'None'}</div>
          </div>
          <div className="text-2xl font-black text-white tracking-tighter tabular-nums ml-auto">{allRisks.length.toString().padStart(2, '0')}</div>
        </div>

        {/* Timeline */}
        <div onClick={() => handleExpand('timeline')} className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-purple-500/50 hover:bg-white/5 transition-all flex items-center gap-3 min-w-[130px] group">
          <div>
            <h2 className="text-white/40 text-[8px] tracking-[0.2em] uppercase font-bold group-hover:text-purple-500/70 transition-colors flex items-center gap-1"><Clock className="w-3 h-3" /> Timeline</h2>
            <div className="text-white/50 text-[8px] uppercase mt-0.5 truncate max-w-[100px]">{allTimeline[allTimeline.length-1]?.event?.slice(0,20) || 'None'}</div>
          </div>
          <div className="text-2xl font-black text-white tracking-tighter tabular-nums ml-auto">{allTimeline.length.toString().padStart(2, '0')}</div>
        </div>

        {/* Code Findings */}
        <div onClick={() => handleExpand('code_findings')} className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-orange-500/50 hover:bg-white/5 transition-all flex items-center gap-3 min-w-[145px] group">
          <div>
            <h2 className="text-white/40 text-[8px] tracking-[0.2em] uppercase font-bold group-hover:text-orange-400/80 transition-colors flex items-center gap-1"><Bug className="w-3 h-3" /> Findings</h2>
            <div className="text-white/50 text-[8px] uppercase mt-0.5 truncate max-w-[110px]">{allCodeFindings[allCodeFindings.length - 1]?.file || 'None'}</div>
          </div>
          <div className="text-2xl font-black text-white tracking-tighter tabular-nums ml-auto">{allCodeFindings.length.toString().padStart(2, '0')}</div>
        </div>

        {/* Connect Project Button */}
        {onConnectProject && (
          <div onClick={onConnectProject} className="bg-blue-500/10 backdrop-blur-xl border border-blue-500/30 rounded-xl px-4 py-3 cursor-pointer hover:border-blue-500/70 hover:bg-blue-500/20 transition-all flex items-center gap-2 min-w-[130px] group">
            <GitBranch className="w-4 h-4 text-blue-400 group-hover:text-blue-300" />
            <div>
              <h2 className="text-blue-400 text-[8px] tracking-[0.2em] uppercase font-bold">Connect</h2>
              <div className="text-blue-300/60 text-[8px] uppercase mt-0.5">GitHub</div>
            </div>
          </div>
        )}
      </div>
      
      {renderExpanded()}
    </>
  );
}
