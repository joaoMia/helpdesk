import { useEffect, useState } from 'react';
import { AuthError } from '../lib/auth-client';
import {
  attachmentAccept,
  attachmentDisplay,
  attachmentTextExcerpt,
  formatAttachmentSize,
  safeLocalImage,
} from '../lib/attachment-display';
import { DemoDialog } from './demo-dialog';
import { Icon } from './ui';

export function AttachmentPicker({
  label,
  onFiles,
  disabled,
  multiple,
  accept = attachmentAccept,
  id,
  required,
  invalid,
  describedBy,
}: {
  label: string;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  accept?: string;
  id?: string;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <label className="attachment-picker button-secondary cursor-pointer">
      <Icon name="paper" />
      <span>Anexar</span>
      <input
        className="sr-only"
        id={id}
        aria-label={label}
        aria-required={required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </label>
  );
}

const typeLabels = {
  image: 'Imagem',
  text: 'Texto',
  word: 'Word',
  sheet: 'Planilha',
  pdf: 'PDF',
  slides: 'Apresentação',
  file: 'Arquivo',
};

export function AttachmentCard({
  file,
  local,
  imageUrl,
  load,
  onRemove,
  onExpired,
  disabled,
  note,
}: {
  file: { name: string; size?: number; mime?: string };
  local?: File;
  imageUrl?: string;
  load?: () => Promise<Blob>;
  onRemove?: () => void;
  onExpired?: () => void;
  disabled?: boolean;
  note?: string;
}) {
  const { kind, extension, textPreview } = attachmentDisplay(
    file.name,
    file.mime,
  );
  const [localPreview, setLocalPreview] = useState<{
    file: File;
    image?: string;
    text?: string;
    unavailable?: boolean;
  }>();
  const [imageError, setImageError] = useState('');
  const [error, setError] = useState('');
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remoteText, setRemoteText] = useState<string>();
  useEffect(() => {
    if (!local || (kind !== 'image' && !textPreview)) return;
    let alive = true;
    let url: string | undefined;
    void (async () => {
      try {
        if (textPreview) {
          const text = await attachmentTextExcerpt(local);
          if (alive) setLocalPreview({ file: local, text });
        } else {
          const image = await safeLocalImage(local);
          if (!alive) return;
          if (image) url = URL.createObjectURL(image);
          setLocalPreview({ file: local, image: url, unavailable: !url });
        }
      } catch {
        if (alive) setLocalPreview({ file: local, unavailable: true });
      }
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [kind, local, textPreview]);
  const preview = localPreview?.file === local ? localPreview : undefined;
  const src = imageUrl ?? preview?.image;
  const image = Boolean(src && imageError !== src);
  const publishedImage = !!imageUrl && !local && image;
  const excerpt = preview?.text ?? remoteText;
  const metadata = [
    typeLabels[kind],
    extension && extension !== typeLabels[kind] ? extension : '',
    file.size === undefined ? '' : formatAttachmentSize(file.size),
  ]
    .filter(Boolean)
    .join(' · ');

  async function read(download: boolean) {
    if (!load || busy) return;
    setBusy(true);
    setError('');
    try {
      const blob = await load();
      if (download) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        setRemoteText(await attachmentTextExcerpt(blob));
      }
    } catch (e) {
      if (e instanceof AuthError && e.status === 401) onExpired?.();
      setError(download ? 'Download indisponível.' : 'Prévia indisponível.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className={
        publishedImage
          ? 'attachment-card attachment-card-published-image'
          : 'attachment-card'
      }
      data-type={kind}
    >
      <button
        type="button"
        className="attachment-card-details"
        title={file.name}
        aria-label={
          (image ? 'Ampliar ' : textPreview ? 'Visualizar ' : 'Detalhes de ') +
          file.name
        }
        onClick={() => {
          setOpened(true);
          if (!local && textPreview && remoteText === undefined)
            void read(false);
        }}
      >
        <span className="attachment-card-thumb" aria-hidden="true">
          {image ? (
            <img
              src={src}
              alt=""
              loading="lazy"
              onError={() => setImageError(src!)}
            />
          ) : (
            <Icon
              name={
                kind === 'image'
                  ? 'image'
                  : kind === 'sheet'
                    ? 'sheet'
                    : kind === 'file'
                      ? 'paper'
                      : 'document'
              }
            />
          )}
        </span>
        <span className="min-w-0">
          <span className="attachment-card-name">{file.name}</span>
          <span className="attachment-card-meta">{metadata}</span>
        </span>
      </button>
      {note && (
        <p className="attachment-card-meta attachment-card-note">{note}</p>
      )}
      {local && excerpt && (
        <pre className="attachment-card-excerpt">{excerpt}</pre>
      )}
      {(load || onRemove) && (
        <div className="attachment-card-actions">
          {load && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => void read(true)}
            >
              Download
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              className="text-button"
              aria-label={'Remover ' + file.name}
              disabled={disabled}
              onClick={onRemove}
            >
              Remover
            </button>
          )}
        </div>
      )}
      {!opened && error && (
        <p role="alert" className="attachment-card-note">
          {error}
        </p>
      )}
      {opened && (
        <DemoDialog
          title="Visualização do anexo"
          eyebrow=""
          cancelLabel="Fechar"
          onCancel={() => {
            setOpened(false);
            setError('');
          }}
        >
          <p className="break-words font-semibold">{file.name}</p>
          <p>{metadata}</p>
          {busy && <p role="status">Consultando prévia…</p>}
          {error && <p role="alert">{error}</p>}
          {image && (
            <img
              className="max-h-[65dvh] max-w-full rounded-lg object-contain"
              src={src}
              alt={file.name}
              onError={() => setImageError(src!)}
            />
          )}
          {excerpt !== undefined && (
            <pre className="attachment-text-preview">{excerpt}</pre>
          )}
          {!image && excerpt === undefined && !busy && !error && (
            <p>
              {preview?.unavailable || imageError
                ? 'Prévia indisponível.'
                : 'Este arquivo está disponível para identificação pelo nome e formato.'}
            </p>
          )}
        </DemoDialog>
      )}
    </article>
  );
}

export function LocalAttachmentField({
  name,
  label,
  onNameChange,
  id,
  required,
  invalid,
  describedBy,
  accept = '',
  disabled,
}: {
  name?: string;
  label: string;
  onNameChange?: (name: string) => void;
  id?: string;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  accept?: string;
  disabled?: boolean;
}) {
  const [file, setFile] = useState<File>();
  const shownName = name ?? file?.name;
  const selected = shownName === file?.name ? file : undefined;
  return (
    <div className="space-y-2">
      <AttachmentPicker
        label={label}
        id={id}
        required={required}
        invalid={invalid}
        describedBy={describedBy}
        accept={accept}
        disabled={disabled}
        onFiles={([chosen]) => {
          if (!chosen) return;
          setFile(chosen);
          onNameChange?.(chosen.name);
        }}
      />
      {shownName && (
        <AttachmentCard
          key={shownName}
          file={selected ?? { name: shownName }}
          local={selected}
          disabled={disabled}
          note="Prévia local · sem upload"
          onRemove={() => {
            setFile(undefined);
            onNameChange?.('');
          }}
        />
      )}
    </div>
  );
}
