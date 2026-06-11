import { useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';

type SummaryCard = { label: string; value: string };
type DashboardPayload = {
  summary: SummaryCard[];
  charts: Array<{ label: string; points: number[] }>;
  logs: Array<{ level: string; message: string; source: string }>;
  generatedAt: string;
};
type RecordRow = {
  id: string;
  team: string;
  owner: string;
  status: string;
  score: number;
  createdAt: string;
  notes: string;
  history: Array<{ timestamp: string; message: string }>;
};
type SettingsPayload = {
  pollingMs: number;
  autoRefresh: boolean;
  retainedWidgets: string[];
};
type AnalyticsPayload = {
  summary: SummaryCard[];
  charts: Array<{ label: string; points: number[] }>;
  logs: Array<{ level: string; message: string; source: string }>;
  settings: SettingsPayload;
};
type TeamSnapshot = {
  key: string;
  label: string;
  total: number;
  average: number;
  warningCount: number;
  reviewCount: number;
};
type StatusSnapshot = {
  key: string;
  label: string;
  count: number;
  tone: string;
};

const TEAM_LABELS: Record<string, string> = {
  support: 'Support premium',
  ops: 'Exploitation',
  sales: 'Activation commerciale',
  legal: 'Conformite'
};

const STATUS_META: Record<string, { label: string; tone: string }> = {
  ok: { label: 'Stable', tone: 'stable' },
  warning: { label: 'Sous surveillance', tone: 'warning' },
  review: { label: 'A arbitrer', tone: 'review' }
};

const CHART_TITLES = [
  'Flux support',
  'Escalades grands comptes',
  'Validation metier',
  'Conformite documentaire',
  'Traitement prioritaire',
  'Rappels terrain'
];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error('Echec sur ' + url);
  }
  return response.json() as Promise<T>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function formatRecordId(record: RecordRow, index: number) {
  return record.team.slice(0, 3).toUpperCase() + '-' + String(index + 1204).padStart(4, '0');
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function statusInfo(status: string) {
  return STATUS_META[status] ?? { label: status, tone: 'neutral' };
}

function teamLabel(team: string) {
  return TEAM_LABELS[team] ?? team;
}

function LoginPage({ onAuthenticate }: { onAuthenticate: (token: string) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setPending(true);
    setError(null);

    try {
      const session = await fetchJson<{ token: string }>('/api/session', { method: 'POST' });
      window.localStorage.setItem('ops-session', session.token);
      onAuthenticate(session.token);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Connexion impossible');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="ops-login-shell">
      <section className="ops-login-card">
        <p className="ops-eyebrow">Poste de supervision</p>
        <h1>NorthStar Desk</h1>
        <p>
          Un cockpit pour suivre les files, arbitrages et signaux faibles sur l'ensemble des flux metier.
        </p>
        <div className="ops-chip-row">
          <span>Flux centralises</span>
          <span>Journal live</span>
          <span>Supervision continue</span>
        </div>
        <button type="button" onClick={handleLogin} disabled={pending}>
          {pending ? 'Connexion en cours...' : 'Ouvrir le cockpit'}
        </button>
        {error ? <p className="ops-inline-error">{error}</p> : null}
      </section>
    </main>
  );
}

function Sidebar({ summary, statusSummary }: { summary: SummaryCard[]; statusSummary: StatusSnapshot[] }) {
  return (
    <aside className="ops-sidebar">
      <div className="ops-sidebar-block">
        <p className="ops-eyebrow">Pilotage</p>
        <strong>NorthStar Desk</strong>
        <p className="ops-sidebar-copy">Centre de controle pour les arbitrages quotidiens et le suivi des files actives.</p>
      </div>

      <nav className="ops-nav">
        <NavLink to="/" end>
          Vue generale
        </NavLink>
        <NavLink to="/table">File active</NavLink>
        <NavLink to="/analytics">Analyse</NavLink>
        <NavLink to="/settings">Reglages</NavLink>
      </nav>

      <div className="ops-sidebar-block">
        <p className="ops-eyebrow">Repere rapide</p>
        <div className="ops-sidebar-metrics">
          {summary.slice(0, 3).map((item) => (
            <article key={item.label} className="ops-sidebar-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </div>

      <div className="ops-sidebar-block">
        <p className="ops-eyebrow">Etat des files</p>
        <div className="ops-status-stack">
          {statusSummary.map((item) => (
            <div key={item.key} className="ops-status-row">
              <span className={'ops-status-pill ' + item.tone}>{item.label}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function DashboardPage({
  dashboard,
  statusSummary,
  teamSummary,
  urgentRecords
}: {
  dashboard: DashboardPayload;
  statusSummary: StatusSnapshot[];
  teamSummary: TeamSnapshot[];
  urgentRecords: RecordRow[];
}) {
  return (
    <div className="ops-stack">
      <section className="ops-hero-panel">
        <div>
          <p className="ops-eyebrow">Vue generale</p>
          <h1>Suivi temps reel des operations</h1>
          <p>
            Supervision des demandes, capacite des equipes et signaux a arbitrer dans une seule vue.
          </p>
        </div>
        <div className="ops-generated-at">Actualise le {formatDateTime(dashboard.generatedAt)}</div>
      </section>

      <section className="ops-summary-grid">
        {dashboard.summary.map((item) => (
          <article key={item.label} className="ops-summary-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="ops-main-grid">
        <article className="ops-panel">
          <div className="ops-section-header">
            <div>
              <p className="ops-eyebrow">Cadence</p>
              <h2>Flux surveilles</h2>
            </div>
          </div>
          <div className="ops-chart-grid">
            {dashboard.charts.slice(0, 6).map((chart, index) => (
              <article key={chart.label} className="ops-trend-card">
                <div className="ops-card-header">
                  <h3>{CHART_TITLES[index] ?? chart.label}</h3>
                  <span>{average(chart.points)} pts</span>
                </div>
                <div className="ops-bar-row">
                  {chart.points.slice(-12).map((point, pointIndex) => (
                    <span key={chart.label + '-' + pointIndex} style={{ height: point + '%' }} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>

        <aside className="ops-panel ops-log-panel">
          <div className="ops-section-header">
            <div>
              <p className="ops-eyebrow">Journal live</p>
              <h2>Derniers evenements</h2>
            </div>
          </div>
          <div className="ops-log-list">
            {dashboard.logs.map((log, index) => (
              <article key={log.message + '-' + index} className="ops-log-entry">
                <div className="ops-card-header">
                  <span className={'ops-status-pill ' + (log.level === 'high' ? 'warning' : 'neutral')}>{log.level}</span>
                  <small>{log.source}</small>
                </div>
                <p>{log.message}</p>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="ops-health-layout">
        <article className="ops-panel">
          <div className="ops-section-header">
            <div>
              <p className="ops-eyebrow">Etat des files</p>
              <h2>Distribution instantanee</h2>
            </div>
          </div>
          <div className="ops-summary-grid compact">
            {statusSummary.map((item) => (
              <article key={item.key} className="ops-summary-card compact">
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </article>
            ))}
          </div>
          <div className="ops-team-list">
            {teamSummary.map((team) => (
              <div key={team.key} className="ops-team-row">
                <div>
                  <strong>{team.label}</strong>
                  <span>{team.total} dossiers actifs</span>
                </div>
                <div className="ops-team-meta">
                  <span>{team.average} pts</span>
                  <small>{team.warningCount + team.reviewCount} a surveiller</small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="ops-panel">
          <div className="ops-section-header">
            <div>
              <p className="ops-eyebrow">A arbitrer</p>
              <h2>Points chauds du moment</h2>
            </div>
          </div>
          <div className="ops-watch-list">
            {urgentRecords.map((record, index) => {
              const meta = statusInfo(record.status);
              return (
                <article key={record.id} className="ops-watch-card">
                  <div className="ops-card-header">
                    <strong>{formatRecordId(record, index)}</strong>
                    <span className={'ops-status-pill ' + meta.tone}>{meta.label}</span>
                  </div>
                  <p>{teamLabel(record.team)} · {record.owner}</p>
                  <small>{record.notes.slice(0, 118)}...</small>
                </article>
              );
            })}
          </div>
        </article>
      </section>
    </div>
  );
}

function TablePage({ records }: { records: RecordRow[] }) {
  const [selectedId, setSelectedId] = useState(records[0]?.id ?? '');

  useEffect(() => {
    if (!records.some((record) => record.id === selectedId)) {
      setSelectedId(records[0]?.id ?? '');
    }
  }, [records, selectedId]);

  const selectedIndex = records.findIndex((record) => record.id === selectedId);
  const selectedRecord = selectedIndex >= 0 ? records[selectedIndex] : records[0];

  return (
    <div className="ops-stack">
      <section className="ops-hero-panel compact">
        <div>
          <p className="ops-eyebrow">File active</p>
          <h1>Vue dossier par dossier</h1>
          <p>Selectionnez une ligne pour consulter l'historique, le contexte et le score de suivi associe.</p>
        </div>
      </section>

      <section className="ops-records-grid">
        <article className="ops-panel ops-record-list">
          {records.slice(0, 18).map((record, index) => {
            const meta = statusInfo(record.status);
            const isSelected = record.id === selectedRecord?.id;
            return (
              <button
                key={record.id}
                type="button"
                className={isSelected ? 'ops-record-button selected' : 'ops-record-button'}
                onClick={() => setSelectedId(record.id)}
              >
                <div className="ops-card-header">
                  <strong>{formatRecordId(record, index)}</strong>
                  <span className={'ops-status-pill ' + meta.tone}>{meta.label}</span>
                </div>
                <div className="ops-record-meta">
                  <span>{teamLabel(record.team)}</span>
                  <span>{record.owner}</span>
                  <span>{formatDateTime(record.createdAt)}</span>
                </div>
                <div className="ops-progress-bar">
                  <span style={{ width: record.score + '%' }} />
                </div>
              </button>
            );
          })}
        </article>

        <aside className="ops-panel ops-record-detail">
          {selectedRecord ? (
            <>
              <div className="ops-section-header">
                <div>
                  <p className="ops-eyebrow">Detail</p>
                  <h2>{formatRecordId(selectedRecord, Math.max(selectedIndex, 0))}</h2>
                </div>
                <span className={'ops-status-pill ' + statusInfo(selectedRecord.status).tone}>
                  {statusInfo(selectedRecord.status).label}
                </span>
              </div>

              <div className="ops-detail-grid">
                <article className="ops-detail-card">
                  <span>Equipe</span>
                  <strong>{teamLabel(selectedRecord.team)}</strong>
                </article>
                <article className="ops-detail-card">
                  <span>Referent</span>
                  <strong>{selectedRecord.owner}</strong>
                </article>
                <article className="ops-detail-card">
                  <span>Score de suivi</span>
                  <strong>{selectedRecord.score} pts</strong>
                </article>
                <article className="ops-detail-card">
                  <span>Creation</span>
                  <strong>{formatDateTime(selectedRecord.createdAt)}</strong>
                </article>
              </div>

              <article className="ops-narrative-panel">
                <p className="ops-eyebrow">Contexte</p>
                <p>{selectedRecord.notes}</p>
              </article>

              <article className="ops-narrative-panel">
                <p className="ops-eyebrow">Historique recent</p>
                <div className="ops-history-list">
                  {selectedRecord.history.map((entry) => (
                    <div key={entry.timestamp + entry.message} className="ops-history-row">
                      <strong>{formatDateTime(entry.timestamp)}</strong>
                      <p>{entry.message}</p>
                    </div>
                  ))}
                </div>
              </article>
            </>
          ) : null}
        </aside>
      </section>
    </div>
  );
}

function AnalyticsPage({
  analytics,
  teamSummary,
  urgentRecords
}: {
  analytics: AnalyticsPayload;
  teamSummary: TeamSnapshot[];
  urgentRecords: RecordRow[];
}) {
  return (
    <div className="ops-stack">
      <section className="ops-hero-panel compact">
        <div>
          <p className="ops-eyebrow">Analyse</p>
          <h1>Tendances et niveaux d'attention</h1>
          <p>Lecture croisee des volumes, des equipes les plus sollicitees et des dossiers a arbitrer.</p>
        </div>
      </section>

      <section className="ops-analytics-grid">
        <article className="ops-panel">
          <div className="ops-section-header">
            <div>
              <p className="ops-eyebrow">Equipes</p>
              <h2>Charge moyenne</h2>
            </div>
          </div>
          <div className="ops-ranking-list">
            {teamSummary.map((team) => (
              <div key={team.key} className="ops-ranking-row">
                <div>
                  <strong>{team.label}</strong>
                  <small>{team.total} dossiers</small>
                </div>
                <div className="ops-ranking-bar">
                  <span style={{ width: team.average + '%' }} />
                </div>
                <strong>{team.average}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="ops-panel">
          <div className="ops-section-header">
            <div>
              <p className="ops-eyebrow">Signaux</p>
              <h2>Rythmes de flux</h2>
            </div>
          </div>
          <div className="ops-signal-list">
            {analytics.charts.slice(0, 4).map((chart, index) => (
              <div key={chart.label} className="ops-signal-row">
                <div className="ops-card-header">
                  <strong>{CHART_TITLES[index] ?? chart.label}</strong>
                  <span>{average(chart.points)} pts</span>
                </div>
                <div className="ops-mini-bars">
                  {chart.points.slice(-18).map((point, pointIndex) => (
                    <span key={chart.label + '-' + pointIndex} style={{ height: point + '%' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="ops-main-grid">
        <article className="ops-panel">
          <div className="ops-section-header">
            <div>
              <p className="ops-eyebrow">Resume</p>
              <h2>Indicateurs de supervision</h2>
            </div>
          </div>
          <div className="ops-summary-grid compact">
            {analytics.summary.map((item) => (
              <article key={item.label} className="ops-summary-card compact">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </article>

        <article className="ops-panel">
          <div className="ops-section-header">
            <div>
              <p className="ops-eyebrow">Priorites</p>
              <h2>Dossiers les plus exposes</h2>
            </div>
          </div>
          <div className="ops-watch-list">
            {urgentRecords.map((record, index) => (
              <article key={record.id} className="ops-watch-card compact">
                <div className="ops-card-header">
                  <strong>{formatRecordId(record, index)}</strong>
                  <span>{teamLabel(record.team)}</span>
                </div>
                <small>{record.history.length} evenement(s) · {record.score} pts</small>
              </article>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function SettingsPage({ settings }: { settings: SettingsPayload }) {
  return (
    <div className="ops-stack">
      <section className="ops-hero-panel compact">
        <div>
          <p className="ops-eyebrow">Reglages</p>
          <h1>Configuration du poste</h1>
          <p>Parametres de rafraichissement et widgets retenus pour les equipes de supervision.</p>
        </div>
      </section>

      <section className="ops-settings-grid">
        <article className="ops-panel">
          <div className="ops-section-header">
            <div>
              <p className="ops-eyebrow">Cadence</p>
              <h2>Parametres clefs</h2>
            </div>
          </div>
          <div className="ops-summary-grid compact">
            <article className="ops-summary-card compact">
              <span>Polling</span>
              <strong>{settings.pollingMs} ms</strong>
            </article>
            <article className="ops-summary-card compact">
              <span>Auto refresh</span>
              <strong>{settings.autoRefresh ? 'Actif' : 'Desactive'}</strong>
            </article>
            <article className="ops-summary-card compact">
              <span>Widgets conserves</span>
              <strong>{settings.retainedWidgets.length}</strong>
            </article>
          </div>
        </article>

        <article className="ops-panel">
          <div className="ops-section-header">
            <div>
              <p className="ops-eyebrow">Widgets</p>
              <h2>Elements affiches</h2>
            </div>
          </div>
          <div className="ops-bullet-stack">
            {settings.retainedWidgets.map((widget) => (
              <div key={widget} className="ops-bullet-row">
                <strong>{widget}</strong>
                <small>Visible dans la colonne de pilotage</small>
              </div>
            ))}
          </div>
        </article>

        <article className="ops-panel">
          <div className="ops-section-header">
            <div>
              <p className="ops-eyebrow">Routines</p>
              <h2>Cadre de supervision</h2>
            </div>
          </div>
          <div className="ops-bullet-stack">
            <div className="ops-bullet-row">
              <strong>Relecture des alertes toutes les 15 minutes</strong>
              <small>Verifier les niveaux warning et review avant la prochaine bascule.</small>
            </div>
            <div className="ops-bullet-row">
              <strong>Partage des arbitrages en fin de cycle</strong>
              <small>Centraliser les decisions pour le tour de table suivant.</small>
            </div>
            <div className="ops-bullet-row">
              <strong>Controle des pics de charge</strong>
              <small>Surveiller les equipes dont la moyenne depasse 70 pts.</small>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

export default function OpsApp() {
  const [sessionToken, setSessionToken] = useState<string | null>(() => window.localStorage.getItem('ops-session'));
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }

    function loadAll() {
      Promise.all([
        fetchJson<DashboardPayload>('/api/dashboard'),
        fetchJson<RecordRow[]>('/api/records'),
        fetchJson<SettingsPayload>('/api/settings'),
        fetchJson<AnalyticsPayload>('/api/analytics')
      ]).then(([dashboardPayload, recordPayload, settingsPayload, analyticsPayload]) => {
        setDashboard(dashboardPayload);
        setRecords(recordPayload);
        setSettings(settingsPayload);
        setAnalytics(analyticsPayload);
      });
    }

    loadAll();
    const timer = window.setInterval(loadAll, 5000);
    return () => window.clearInterval(timer);
  }, [sessionToken]);

  const statusSummary = useMemo<StatusSnapshot[]>(() => {
    const counts = records.reduce<Record<string, number>>((accumulator, record) => {
      accumulator[record.status] = (accumulator[record.status] ?? 0) + 1;
      return accumulator;
    }, {});

    return Object.keys(STATUS_META).map((key) => ({
      key,
      label: STATUS_META[key].label,
      tone: STATUS_META[key].tone,
      count: counts[key] ?? 0
    }));
  }, [records]);

  const teamSummary = useMemo<TeamSnapshot[]>(() => {
    const buckets = records.reduce<
      Record<string, { total: number; scoreTotal: number; warningCount: number; reviewCount: number }>
    >((accumulator, record) => {
      if (!accumulator[record.team]) {
        accumulator[record.team] = { total: 0, scoreTotal: 0, warningCount: 0, reviewCount: 0 };
      }

      accumulator[record.team].total += 1;
      accumulator[record.team].scoreTotal += record.score;
      if (record.status === 'warning') {
        accumulator[record.team].warningCount += 1;
      }
      if (record.status === 'review') {
        accumulator[record.team].reviewCount += 1;
      }

      return accumulator;
    }, {});

    return Object.entries(buckets)
      .map(([key, bucket]) => ({
        key,
        label: teamLabel(key),
        total: bucket.total,
        average: Math.round(bucket.scoreTotal / bucket.total),
        warningCount: bucket.warningCount,
        reviewCount: bucket.reviewCount
      }))
      .sort((left, right) => right.average - left.average);
  }, [records]);

  const urgentRecords = useMemo(() => {
    return [...records]
      .filter((record) => record.status !== 'ok' || record.score >= 70)
      .sort((left, right) => right.score + right.history.length * 4 - (left.score + left.history.length * 4))
      .slice(0, 6);
  }, [records]);

  if (!sessionToken) {
    return <LoginPage onAuthenticate={setSessionToken} />;
  }

  if (!dashboard || !settings || !analytics) {
    return <main className="ops-loading-shell"><p>Chargement du cockpit...</p></main>;
  }

  return (
    <div className="ops-app">
      <Sidebar summary={dashboard.summary} statusSummary={statusSummary} />
      <main className="ops-content">
        <Routes>
          <Route
            path="/"
            element={
              <DashboardPage
                dashboard={dashboard}
                statusSummary={statusSummary}
                teamSummary={teamSummary}
                urgentRecords={urgentRecords}
              />
            }
          />
          <Route path="/table" element={<TablePage records={records} />} />
          <Route
            path="/analytics"
            element={<AnalyticsPage analytics={analytics} teamSummary={teamSummary} urgentRecords={urgentRecords} />}
          />
          <Route path="/settings" element={<SettingsPage settings={settings} />} />
        </Routes>
      </main>
    </div>
  );
}
