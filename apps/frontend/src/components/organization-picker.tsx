import { useEffect, useState } from 'react';
import { authClient, AuthError } from '../lib/auth-client';
import { loadAllOptions } from '../lib/paginated-options';
export function OrganizationPicker({
  kind,
  label,
  value,
  currentName,
  onChange,
  onExpired,
  companyId,
  disabled = false,
  includeInactive = false,
}: {
  kind: 'companies' | 'departments' | 'schedules';
  label: string;
  value: string | null;
  currentName?: string | null;
  onChange: (id: string | null) => void;
  onExpired: () => void;
  companyId?: string | null;
  disabled?: boolean;
  includeInactive?: boolean;
}) {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState('');
  const unavailable = kind === 'departments' && !companyId,
    key = JSON.stringify([kind, companyId, includeInactive]),
    loading = loaded !== key;
  useEffect(() => {
    if (unavailable) return;
    let active = true;
    const fetchPage = (page: number) => {
      const query = {
        page,
        pageSize: 50,
        status: includeInactive ? ('all' as const) : ('active' as const),
      };
      return kind === 'companies'
        ? authClient.adminCompanies(query)
        : kind === 'departments'
          ? authClient.adminDepartments({ ...query, companyId: companyId! })
          : authClient.adminSchedules(query);
    };
    loadAllOptions<{ id: string; name: string }>(fetchPage, () => !active)
      .then((rows) => {
        if (active) {
          setItems(rows);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          setItems([]);
          if (e instanceof AuthError && e.status === 401) onExpired();
          else
            setError(
              'Não foi possível carregar as opções. Reabra o formulário para tentar novamente.',
            );
        }
      })
      .finally(() => {
        if (active) setLoaded(key);
      });
    return () => {
      active = false;
    };
  }, [kind, companyId, includeInactive, unavailable, key, onExpired]);
  return (
    <label className="form-label block">
      {label}
      <select
        className="field w-full"
        value={value ?? ''}
        disabled={disabled || unavailable || loading || !!error}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">
          {unavailable
            ? 'Selecione primeiro a empresa'
            : loading
              ? 'Carregando opções…'
              : 'Não informado'}
        </option>
        {value && !items.some((i) => i.id === value) && (
          <option value={value} disabled>
            {currentName ?? 'Vínculo atual'}
          </option>
        )}
        {!loading &&
          !unavailable &&
          items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
      </select>
      {error && (
        <span role="alert" className="form-error">
          {error}
        </span>
      )}
    </label>
  );
}
