import { days, time } from '../lib/work-schedule-presentation';
import { ScheduleEditorDialog } from '../components/schedule-editor-dialog';
import { useEffect, useRef, useState } from 'react';
import type {
  WorkSchedule,
  ScheduleInput,
  ScheduleUpdate,
} from '@helpdesk/contracts';
import { scheduleInputSchema } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { PageHeading, EmptyState, Icon, Panel } from '../components/ui';
import { MotionRegion } from '../components/motion-region';
import { TicketPagination } from '../components/ticket-pagination';
import { DemoDialog } from '../components/demo-dialog';
type Version = WorkSchedule['versions'][number];
type Draft = ScheduleInput & { id?: string };
export function AdminSchedules({ onExpired }: { onExpired: () => void }) {
  const [items, setItems] = useState<WorkSchedule[]>([]),
    [text, setText] = useState(''),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all'),
    [loaded, setLoaded] = useState(''),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [draft, setDraft] = useState<Draft | null>(null),
    [defaultId, setDefaultId] = useState<string | null>(null),
    [choosing, setChoosing] = useState<WorkSchedule | null>(null),
    [history, setHistory] = useState<WorkSchedule | null>(null),
    [versions, setVersions] = useState<Version[]>([]),
    [versionPage, setVersionPage] = useState(1),
    [versionTotal, setVersionTotal] = useState(0),
    [versionLoading, setVersionLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const search = useDebouncedValue(text.trim()),
    key = JSON.stringify([page, search, status, revision]),
    loading = loaded !== key || text.trim() !== search,
    sending = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([
      authClient.adminSchedules({ page, pageSize: 10, search, status }),
      authClient.organizationDefault(),
    ])
      .then(([r, d]) => {
        if (active) {
          setItems(r.items);
          setTotal(r.total);
          setDefaultId(d?.workScheduleId ?? null);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          setItems([]);
          setTotal(0);
          if (e instanceof AuthError && e.status === 401) onExpired();
          else setError('Não foi possível consultar os expedientes.');
        }
      })
      .finally(() => {
        if (active) setLoaded(key);
      });
    return () => {
      active = false;
    };
  }, [page, search, status, revision, key, onExpired]);
  useEffect(() => {
    if (!history) return;
    let active = true;
    authClient
      .scheduleVersions(history.id, versionPage)
      .then((r) => {
        if (active) {
          setVersions(r.items);
          setVersionTotal(r.total);
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else setError('Não foi possível consultar o histórico.');
        }
      })
      .finally(() => {
        if (active) setVersionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [history, versionPage, onExpired]);
  function edit(row?: WorkSchedule) {
    setError('');
    const v = row?.versions[0];
    setDraft({
      ...(row ? { id: row.id } : {}),
      name: row?.name ?? '',
      isActive: row?.isActive ?? true,
      timezone: v?.timezone ?? 'America/Sao_Paulo',
      weekly: structuredClone(v?.weekly ?? []),
      exceptions: structuredClone(v?.exceptions ?? []),
    });
  }
  async function save() {
    if (!draft || sending.current) return;
    const { id, ...raw } = draft;
    if (
      raw.weekly.some(
        (w) => !Number.isFinite(w.startMinute) || !Number.isFinite(w.endMinute),
      ) ||
      raw.exceptions.some((ex) =>
        ex.intervals.some(
          (w) =>
            !Number.isFinite(w.startMinute) || !Number.isFinite(w.endMinute),
        ),
      )
    ) {
      setError('Informe horários de entrada e saída válidos.');
      return;
    }
    if (raw.exceptions.some((ex) => !ex.date)) {
      setError('Informe a data de cada exceção.');
      return;
    }
    const parsed = scheduleInputSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revise os períodos.');
      return;
    }
    let data: ScheduleInput | ScheduleUpdate = parsed.data;
    const original = items.find((i) => i.id === id);
    if (original) {
      const old = {
        name: original.name,
        isActive: original.isActive,
        timezone: original.versions[0]?.timezone,
        weekly: original.versions[0]?.weekly,
        exceptions: original.versions[0]?.exceptions,
      };
      data = Object.fromEntries(
        Object.entries(parsed.data).filter(
          ([k, v]) =>
            JSON.stringify(v) !== JSON.stringify(old[k as keyof typeof old]),
        ),
      );
      if (!Object.keys(data).length) {
        setDraft(null);
        return;
      }
    }
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await authClient.saveSchedule(data, id);
      if (alive.current) {
        setDraft(null);
        setNotice(
          'Expediente salvo. Versões e períodos anteriores permanecem preservados.',
        );
        setRevision((n) => n + 1);
      }
    } catch (e) {
      if (alive.current) {
        if (e instanceof AuthError && e.status === 401) onExpired();
        else
          setError(
            e instanceof AuthError
              ? e.message
              : 'Não foi possível confirmar o expediente.',
          );
      }
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function setDefault() {
    if (!choosing || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await authClient.setOrganizationDefault(choosing.id);
      if (alive.current) {
        setChoosing(null);
        setNotice('Padrão da organização atualizado para os períodos futuros.');
        setRevision((n) => n + 1);
      }
    } catch (e) {
      if (alive.current) {
        if (e instanceof AuthError && e.status === 401) onExpired();
        else
          setError(
            e instanceof AuthError
              ? e.message
              : 'Não foi possível confirmar a configuração.',
          );
      }
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRAÇÃO"
        title="Expedientes e jornadas"
        description="Dias, intervalos, exceções e fuso horário, com versões históricas preservadas."
      >
        <button className="button-primary" onClick={() => edit()}>
          <Icon name="plus" />
          Cadastrar expediente
        </button>
      </PageHeading>
      <p className="info-note mb-4">
        {defaultId
          ? 'Há um expediente padrão configurado para a organização.'
          : 'Nenhum expediente padrão da organização está configurado.'}{' '}
        A empresa e o técnico poderão ter configurações específicas.
      </p>
      {notice && (
        <p className="info-note mb-4" role="status">
          {notice}
        </p>
      )}
      {error && !draft && !choosing && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <MotionRegion motionKey="real-schedules">
        <section className="panel">
          <form className="filter-bar" onSubmit={(e) => e.preventDefault()}>
            <label className="search-field">
              <Icon name="search" />
              <span className="sr-only">Buscar expedientes</span>
              <input
                maxLength={120}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setPage(1);
                }}
                placeholder="Pesquisar por nome"
              />
            </label>
            <label>
              <span className="sr-only">Situação do expediente</span>
              <select
                className="field"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as typeof status);
                  setPage(1);
                }}
              >
                <option value="all">Todos os expedientes</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </label>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setText('');
                setStatus('all');
                setPage(1);
              }}
            >
              Limpar filtros
            </button>
          </form>
          {loading ? (
            <p role="status" className="p-6">
              Carregando expedientes…
            </p>
          ) : !items.length ? (
            <EmptyState title="Nenhum expediente encontrado">
              Cadastre horários aprovados para a organização.
            </EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="ticket-table">
                <caption className="sr-only">Expedientes versionados</caption>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Configuração atual</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                        {s.id === defaultId && (
                          <p className="text-xs text-teal-600">
                            Padrão da organização
                          </p>
                        )}
                      </td>
                      <td>
                        Versão {s.versions[0]?.version ?? 'não configurada'}
                        <div className="text-xs text-slate-500">
                          {s.versions[0]?.timezone} ·{' '}
                          {s.versions[0]?.weekly.length ?? 0} períodos semanais
                        </div>
                      </td>
                      <td>{s.isActive ? 'Ativo' : 'Inativo'}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="button-secondary"
                            onClick={() => edit(s)}
                          >
                            Editar
                          </button>
                          <button
                            className="text-button"
                            onClick={() => {
                              setError('');
                              setVersionLoading(true);
                              setVersionPage(1);
                              setHistory(s);
                            }}
                          >
                            Histórico
                          </button>
                          <button
                            className="text-button"
                            disabled={!s.isActive || s.id === defaultId}
                            onClick={() => {
                              setError('');
                              setChoosing(s);
                            }}
                          >
                            Definir como padrão
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <TicketPagination
            page={page}
            total={total}
            busy={loading || busy}
            onPage={setPage}
          />
        </section>
      </MotionRegion>
      {draft && (
        <ScheduleEditorDialog
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          error={error}
          onCancel={() => setDraft(null)}
          onSave={save}
        />
      )}
      {choosing && (
        <DemoDialog
          title="Alterar expediente padrão?"
          eyebrow="CONFIGURAÇÃO DA ORGANIZAÇÃO"
          description={`${choosing.name} será aplicado aos períodos futuros que usam o padrão da organização. O histórico continuará preservado.`}
          pending={busy}
          confirmLabel={busy ? 'Salvando…' : 'Confirmar padrão'}
          onCancel={() => setChoosing(null)}
          onConfirm={() => {
            void setDefault();
            return false;
          }}
        >
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </DemoDialog>
      )}
      {history && (
        <DemoDialog
          title={'Histórico — ' + history.name}
          eyebrow="VERSÕES PRESERVADAS"
          cancelLabel="Fechar histórico"
          onCancel={() => setHistory(null)}
        >
          {versionLoading ? (
            <p role="status">Carregando versões…</p>
          ) : (
            versions.map((v) => (
              <Panel
                key={v.id}
                title={'Versão ' + v.version}
                subtitle={
                  new Date(v.createdAt).toLocaleString('pt-BR') +
                  ' · ' +
                  v.timezone
                }
              >
                <div className="form-body text-sm space-y-2">
                  {days.map((day, index) => (
                    <p key={day}>
                      {day}:{' '}
                      {v.weekly
                        .filter((w) => w.day === index)
                        .map(
                          (w) =>
                            time(w.startMinute) +
                            '–' +
                            (w.endMinute === 1440
                              ? '24:00'
                              : time(w.endMinute)),
                        )
                        .join(', ') || 'sem expediente'}
                    </p>
                  ))}
                  <p>{v.exceptions.length} data(s) de exceção registradas.</p>
                </div>
              </Panel>
            ))
          )}
          <TicketPagination
            page={versionPage}
            total={versionTotal}
            busy={versionLoading}
            onPage={(p) => {
              setVersionLoading(true);
              setVersionPage(p);
            }}
          />
        </DemoDialog>
      )}
    </>
  );
}
