import { useEffect, useRef, useState } from 'react';
import { authClient, AuthError } from '../lib/auth-client';
import {
  attachmentSelectionError,
  fileSelectionKey,
  newSelections,
} from '../lib/attachment-display';
import type { OpeningUpload } from '@helpdesk/contracts';
import { AttachmentCard, AttachmentPicker } from './attachment-card';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState<File[]>([]);
  const [local, setLocal] = useState<Record<string, File>>({});
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const discard = project
    ? authClient.discardProjectOpeningFile
    : authClient.discardOpeningFile;

  async function upload(chosen: File[]) {
    if (lock.current) return;
    const selection = newSelections(
      files.flatMap(({ id }) => (local[id] ? [local[id]] : [])),
      chosen,
    );
    if (!selection.length) return;
    const selectionError = attachmentSelectionError(selection);
    if (selectionError) {
      setError(selectionError);
      return;
    }
    if (files.length + selection.length > 10) {
      setError('Selecione no máximo 10 anexos.');
      return;
    }
    lock.current = true;
    onPending(1);
    setBusy(true);
    setError('');
    setUploading(selection);
    const uploaded: { item: OpeningUpload; file: File }[] = [];
    try {
      for (const file of selection) {
        if (!alive.current) break;
        const item = project
          ? await authClient.uploadProjectOpeningFile(
              { categoryId: serviceId, versionId: formVersionId, fieldKey },
              file,
            )
          : await authClient.uploadOpeningFile(
              { serviceId, formVersionId, fieldKey },
              file,
            );
        uploaded.push({ item, file });
      }
    } catch (e) {
      if (alive.current) {
        if (e instanceof AuthError && e.status === 401) onExpired();
        else
          setError(
            e instanceof AuthError
              ? e.message
              : 'Não foi possível confirmar o upload.',
          );
      }
    } finally {
      if (alive.current) {
        if (uploaded.length) {
          setLocal((current) => ({
            ...current,
            ...Object.fromEntries(
              uploaded.map(({ item, file }) => [item.id, file]),
            ),
          }));
          onChange([...files, ...uploaded.map(({ item }) => item)]);
        }
        setUploading([]);
        setBusy(false);
      } else {
        await Promise.allSettled(uploaded.map(({ item }) => discard(item.id)));
      }
      lock.current = false;
      onPending(-1);
    }
  }
  async function remove(id: string) {
    if (lock.current) return;
    lock.current = true;
    onPending(1);
    setBusy(true);
    setError('');
    try {
      await discard(id);
      if (alive.current) {
        onChange(files.filter((f) => f.id !== id));
        setLocal((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
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
    <div className="space-y-2">
      <AttachmentPicker
        label="Anexar arquivos"
        multiple
        disabled={disabled || busy || files.length >= 10}
        onFiles={(chosen) => void upload(chosen)}
      />
      <p className="text-xs font-normal text-slate-500">
        Imagens, TXT, MD, CSV, PDF, DOCX, XLSX e PPTX. Até 10 MB por arquivo.
        Upload privado, válido por 24 horas.
      </p>
      {(files.length > 0 || uploading.length > 0) && (
        <ul className="attachment-grid" aria-label="Anexos selecionados">
          {files.map((file) => (
            <li key={file.id}>
              <AttachmentCard
                file={local[file.id] ?? file}
                local={local[file.id]}
                disabled={busy || disabled}
                onRemove={() => void remove(file.id)}
              />
            </li>
          ))}
          {uploading.map((file) => (
            <li key={fileSelectionKey(file)}>
              <AttachmentCard
                file={file}
                local={file}
                note="Validando arquivo…"
              />
            </li>
          ))}
        </ul>
      )}
      {busy && (
        <p role="status" className="text-sm">
          Processando anexo…
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
