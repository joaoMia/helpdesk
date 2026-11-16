import { useEffect, useRef, useState } from 'react';
import { authClient, AuthError } from '../lib/auth-client';
import type { OpeningUpload } from '@helpdesk/contracts';
export function OpeningFileField({
  serviceId,
  formVersionId,
  fieldKey,
  files,
  onChange,
  onExpired,
  onPending,
  disabled = false,
  project = false,
}: {
  serviceId: string;
  formVersionId: string;
  fieldKey: string;
  files: OpeningUpload[];
  onChange: (files: OpeningUpload[]) => void;
  onExpired: () => void;
  onPending: (delta: number) => void;
  disabled?: boolean;
  project?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const lock = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function upload(file: File) {
    if (lock.current) return;
    lock.current = true;
    onPending(1);
    setBusy(true);
    setError('');
    try {
      const item = project
        ? await authClient.uploadProjectOpeningFile(
            { categoryId: serviceId, versionId: formVersionId, fieldKey },
            file,
          )
        : await authClient.uploadOpeningFile(
            { serviceId, formVersionId, fieldKey },
            file,
          );
      if (alive.current) onChange([...files, item]);
      else
        await (
          project
            ? authClient.discardProjectOpeningFile(item.id)
            : authClient.discardOpeningFile(item.id)
        ).catch(() => {});
    } catch (e) {
      if (alive.current) {
        if (e instanceof AuthError && e.status === 401) onExpired();
        else
          setError(
            e instanceof AuthError
              ? e.message
              : 'Não foi possível confirmar o upload. Nenhuma solicitação foi aberta.',
          );
      }
    } finally {
      lock.current = false;
      onPending(-1);
      if (alive.current) setBusy(false);
    }
  }
  async function remove(id: string) {
    if (lock.current) return;
    lock.current = true;
    onPending(1);
    setBusy(true);
    setError('');
    try {
      await (project
        ? authClient.discardProjectOpeningFile(id)
        : authClient.discardOpeningFile(id));
      if (alive.current) onChange(files.filter((f) => f.id !== id));
    } catch (e) {
      if (alive.current) {
        if (e instanceof AuthError && e.status === 401) onExpired();
        else setError('Não foi possível remover o anexo. Tente novamente.');
      }
    } finally {
      lock.current = false;
      onPending(-1);
      if (alive.current) setBusy(false);
    }
  }
  return (
    <span className="block space-y-2">
      <input
        type="file"
        className="field w-full"
        accept=".png,.jpg,.jpeg,.webp,.gif,.txt"
        disabled={disabled || busy || files.length >= 10}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
        }}
      />
      <span className="block text-xs font-normal text-slate-500">
        Até 10 MB por arquivo. Imagens ou texto UTF-8. Upload privado, válido
        por 24 horas.
      </span>
      {files.map((f) => (
        <span
          key={f.id}
          className="flex flex-wrap items-center gap-2 text-sm font-normal"
        >
          <span>
            {f.name} · {Math.ceil(f.size / 1024)} KB
          </span>
          <button
            type="button"
            className="text-button"
            disabled={busy || disabled}
            onClick={() => void remove(f.id)}
          >
            Remover
          </button>
        </span>
      ))}
      {busy && (
        <span role="status" className="block text-sm">
          Processando anexo…
        </span>
      )}
      {error && (
        <span role="alert" className="form-error block">
          {error}
        </span>
      )}
    </span>
  );
}
