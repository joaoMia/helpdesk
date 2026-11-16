import { useEffect, useState, useRef } from 'react';
import { authClient, AuthError } from '../lib/auth-client';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { DemoDialog } from './demo-dialog';
import { TicketPagination } from './ticket-pagination';

// Real distribution; opening the dialog never starts attendance.
export function AssignmentPreviewDialog({
  id,
  priority,
  code,
  onAssigned,
  onClose,
  onExpired,
}: {
  id: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  code: number;
  onAssigned: () => void;
  onClose: () => void;
  onExpired: () => void;
}) {
  const [text, setText] = useState(''),
    [page, setPage] = useState(1),
    [items, setItems] = useState<{ id: string; name: string }[]>([]),
    [total, setTotal] = useState(0),
    [selected, setSelected] = useState<{ id: string; name: string } | null>(
      null,
    ),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState('');
  const [saving, setSaving] = useState(false);
  const sending = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function confirm() {
    if (sending.current || !selected) return;
    sending.current = true;
    setSaving(true);
    setError('');
    try {
      await authClient.assignTicket(id, {
        technicianId: selected.id,
        expectedPriority: priority,
      });
      if (alive.current) onAssigned();
    } catch (e) {
      if (alive.current) {
        if (e instanceof AuthError && e.status === 401) onExpired();
        else
          setError(
            e instanceof AuthError
              ? e.message
              : 'Não foi possível confirmar a atribuição. Atualize a lista antes de tentar novamente.',
          );
      }
    } finally {
      sending.current = false;
      if (alive.current) setSaving(false);
    }
  }
  const search = useDebouncedValue(text.trim()),
    key = JSON.stringify([page, search]);
  const loading = loaded !== key || text.trim() !== search;
  useEffect(() => {
    let active = true;
    authClient
      .assignees({ page, pageSize: 10, search })
      .then((result) => {
        if (active) {
          setItems(result.items);
          setTotal(result.total);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          setItems([]);
          setTotal(0);
          if (e instanceof AuthError && e.status === 401) onExpired();
          else
            setError(
              'Não foi possível consultar os técnicos. Feche e tente novamente.',
            );
        }
      })
      .finally(() => {
        if (active) setLoaded(key);
      });
    return () => {
      active = false;
    };
  }, [page, search, key, onExpired]);
  return (
    <DemoDialog
      title={`Atribuir chamado HD-${code}`}
      eyebrow="DISTRIBUIÇÃO REAL"
      description="Selecione o responsável. O chamado permanecerá aberto, sem início de atendimento."
      cancelLabel="Cancelar"
      pending={saving}
      confirmLabel={saving ? 'Atribuindo…' : 'Confirmar atribuição'}
      onConfirm={
        selected
          ? () => {
              void confirm();
              return false;
            }
          : undefined
      }
      onCancel={onClose}
    >
      <label className="form-label">
        Buscar técnico
        <input
          className="field"
          type="search"
          maxLength={120}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPage(1);
          }}
          placeholder="Nome do técnico"
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Consultando técnicos…</p>
      ) : (
        <fieldset className="mt-4 space-y-3">
          <legend>Técnicos ativos e com troca inicial concluída</legend>
          {items.length ? (
            items.map((t) => (
              <label className="flex items-center gap-3" key={t.id}>
                <input
                  type="radio"
                  name="assignee"
                  checked={selected?.id === t.id}
                  onChange={() => setSelected(t)}
                />
                {t.name}
              </label>
            ))
          ) : (
            <p>Nenhum técnico encontrado.</p>
          )}
        </fieldset>
      )}
      <TicketPagination
        page={page}
        total={total}
        busy={loading}
        onPage={setPage}
      />
      <p className="info-note mt-4" role="status">
        {selected ? `Responsável selecionado: ${selected.name}. ` : ''} Atribuir
        não inicia atendimento; somente o destinatário poderá iniciá-lo.
      </p>
    </DemoDialog>
  );
}
