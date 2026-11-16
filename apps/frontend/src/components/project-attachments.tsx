import { useEffect, useState } from 'react';
import { authClient, AuthError } from '../lib/auth-client';
import { Panel, Icon } from './ui';
import { DemoDialog } from './demo-dialog';
type FileMeta = Awaited<
  ReturnType<typeof authClient.projectAttachments>
>['items'][number];
function ProjectFile({
  projectId,
  file,
  onExpired,
}: {
  projectId: string;
  file: FileMeta;
  onExpired: () => void;
}) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState(''),
    [expanded, setExpanded] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true,
      objectUrl = '';
    if (file.mime === 'image/png')
      authClient
        .downloadAttachment(projectId, file.id, 'projects')
        .then((blob) => {
          objectUrl = URL.createObjectURL(blob);
          if (alive) setUrl(objectUrl);
          else URL.revokeObjectURL(objectUrl);
        })
        .catch(() => {
          if (alive) setError('Prévia indisponível. Tente baixar o arquivo.');
        });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, file.id, file.mime]);
  async function download(preview = false) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const blob = await authClient.downloadAttachment(
        projectId,
        file.id,
        'projects',
      );
      if (preview) {
        setExpanded(true);
      } else {
        const u = URL.createObjectURL(blob),
          a = document.createElement('a');
        a.href = u;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(u), 1000);
      }
    } catch (e) {
      if (e instanceof AuthError && e.status === 401) onExpired();
      setError(
        e instanceof Error ? e.message : 'Não foi possível baixar o arquivo.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="rounded-xl border border-slate-200 p-4 space-y-3">
      <p className="flex items-center gap-2">
        <Icon name="paper" />
        <span className="min-w-0 break-all">
          {file.name} · {Math.ceil(file.size / 1024)} KB
        </span>
      </p>
      <p className="text-xs text-slate-500">
        Campo: {file.fieldLabel ?? file.fieldKey}
      </p>
      {url && (
        <img
          src={url}
          alt={file.name}
          className="max-h-48 max-w-full rounded-lg object-contain"
          onError={() => setError('Não foi possível mostrar a prévia.')}
        />
      )}
      <div className="flex gap-3">
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void download()}
        >
          {busy ? 'Consultando…' : 'Baixar'}
        </button>
        {url && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void download(true)}
          >
            Ampliar imagem
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {expanded && (
        <DemoDialog
          title={file.name}
          confirmLabel="Fechar"
          onConfirm={() => setExpanded(false)}
          onCancel={() => setExpanded(false)}
        >
          <img
            src={url}
            alt={file.name}
            className="max-h-[70vh] max-w-full object-contain"
          />
        </DemoDialog>
      )}
    </article>
  );
}
export function ProjectAttachments({
  id,
  onExpired,
}: {
  id: string;
  onExpired: () => void;
}) {
  const [files, setFiles] = useState<FileMeta[] | undefined>(),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    authClient
      .projectAttachments(id)
      .then((v) => {
        if (alive) {
          setFiles(v.items);
          setError('');
        }
      })
      .catch((e) => {
        if (alive) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          setError(e.message ?? 'Falha ao consultar anexos.');
        }
      });
    return () => {
      alive = false;
    };
  }, [id, onExpired, retry]);
  return (
    <Panel title="Anexos da solicitação">
      <div className="form-body space-y-3">
        {error ? (
          <p role="alert" className="form-error">
            {error}{' '}
            <button
              className="text-button"
              onClick={() => setRetry((v) => v + 1)}
            >
              Tentar novamente
            </button>
          </p>
        ) : files === undefined ? (
          <p role="status">Consultando anexos…</p>
        ) : !files.length ? (
          <p>Nenhum anexo nesta solicitação.</p>
        ) : (
          files.map((f) => (
            <ProjectFile
              key={f.id}
              projectId={id}
              file={f}
              onExpired={onExpired}
            />
          ))
        )}
      </div>
    </Panel>
  );
}
