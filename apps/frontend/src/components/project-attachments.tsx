import { useEffect, useState } from 'react';
import { authClient, AuthError } from '../lib/auth-client';
import { AttachmentCard } from './attachment-card';
type FileMeta = Awaited<
  ReturnType<typeof authClient.projectAttachments>
>['items'][number];
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
  if (files?.length === 0 && !error) return null;
  return (
    <section className="ticket-opening-section">
      <h4>Anexos da abertura</h4>
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
      ) : (
        <ul className="attachment-grid" aria-label="Anexos da abertura">
          {files.map((file) => (
            <li key={file.id}>
              <AttachmentCard
                file={file}
                note={file.fieldLabel ?? file.fieldKey}
                imageUrl={
                  file.mime === 'image/png'
                    ? authClient.attachmentUrl(id, file.id, true, 'projects')
                    : undefined
                }
                load={() =>
                  authClient.downloadAttachment(id, file.id, 'projects')
                }
                onExpired={onExpired}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
