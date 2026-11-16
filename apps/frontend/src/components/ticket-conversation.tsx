import { useEffect, useRef, useState } from 'react';
import type { Conversation, Attachment, PublicUser } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { Panel, Icon } from './ui';
import { DemoDialog } from './demo-dialog';
import { MotionRegion } from './motion-region';
import { useMotionPreference } from '../hooks/use-motion-preference';

import { mergeMessages, chatWritable } from '../lib/chat-messages';
function AttachmentImage({
  src,
  name,
  expanded = false,
}: {
  src: string;
  name: string;
  expanded?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span role="status">Prévia indisponível. Use Download.</span>
  ) : (
    <img
      className={
        expanded
          ? 'max-h-[70vh] max-w-full rounded-xl object-contain'
          : 'max-h-64 max-w-full rounded-xl object-contain'
      }
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
export function TicketConversation({
  id,
  status,
  user,
  onExpired,
  onChanged,
  resource = 'tickets',
  contextLabel = 'chamado',
  allowWrite,
  allowSolve,
  solutionControl,
}: {
  id: string;
  status: string;
  user: PublicUser;
  onExpired: () => void;
  onChanged: () => void;
  resource?: 'tickets' | 'project-conversation';
  contextLabel?: 'chamado' | 'projeto';
  allowWrite?: boolean;
  allowSolve?: boolean;
  solutionControl?: { open: boolean; onOpenChange: (open: boolean) => void };
}) {
  const [solvedAt, setSolvedAt] = useState('');
  const [solutionSaved, setSolutionSaved] = useState(false);
  const [data, setData] = useState<Conversation | null>(null),
    [text, setText] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [connected, setConnected] = useState(false),
    [newMessages, setNewMessages] = useState(false),
    [files, setFiles] = useState<File[]>([]),
    [solutionFiles, setSolutionFiles] = useState<File[]>([]),
    [solution, setSolution] = useState(''),
    [localSolving, setLocalSolving] = useState(false),
    [preview, setPreview] = useState<Attachment | null>(null),
    [notice, setNotice] = useState('');
  const solving = solutionControl?.open ?? localSolving;
  const setSolving = solutionControl?.onOpenChange ?? setLocalSolving;
  const canSolve =
    !solutionSaved &&
    !data?.solution &&
    (allowSolve ?? (user.role === 'TECHNICIAN' && status === 'IN_PROGRESS'));
  const { reduced } = useMotionPreference();
  const viewport = useRef<HTMLDivElement>(null),
    messageRequest = useRef<{ signature: string; id: string } | null>(null),
    previousCount = useRef(0),
    atBottom = useRef(true),
    sending = useRef(false),
    active = useRef(true),
    refresh = useRef<() => void>(() => {}),
    callbacks = useRef({ onExpired, onChanged });
  useEffect(() => {
    callbacks.current = { onExpired, onChanged };
  }, [onExpired, onChanged]);
  useEffect(() => {
    active.current = true;
    previousCount.current = 0;
    atBottom.current = true;
    let disposed = false,
      scopeLost = false,
      source: EventSource | undefined,
      retry: ReturnType<typeof setTimeout> | undefined,
      reading = false,
      queued = false;
    const sync = async () => {
      if (disposed || scopeLost) return;
      if (reading) {
        queued = true;
        return;
      }
      reading = true;
      try {
        let first = await authClient.conversation(id, 1, resource);
        const messages = [...first.comments];
        for (let page = 2; messages.length < first.total; page++) {
          const next = await authClient.conversation(id, page, resource);
          messages.push(...next.comments);
          if (!next.comments.length) break;
        }
        if (disposed) return;
        first = { ...first, comments: mergeMessages(messages) };
        setData(first);
        setError('');
        callbacks.current.onChanged();
      } catch (e) {
        if (!disposed) {
          if (e instanceof AuthError && e.status === 401)
            callbacks.current.onExpired();
          else {
            if (e instanceof AuthError && [403, 404].includes(e.status)) {
              scopeLost = true;
              setData(null);
              setPreview(null);
              setFiles([]);
              setSolutionFiles([]);
              source?.close();
              clearTimeout(retry);
              setConnected(false);
              callbacks.current.onChanged();
            }
            setError(
              'Não foi possível sincronizar a conversa. Verifique sua autorização antes de tentar novamente.',
            );
          }
        }
      } finally {
        reading = false;
        if (!disposed) {
          setLoading(false);
          if (queued) {
            queued = false;
            void sync();
          }
        }
      }
    };
    refresh.current = () => void sync();
    const open = () => {
      if (disposed || scopeLost) return;
      source = new EventSource(authClient.conversationStreamUrl(id, resource), {
        withCredentials: true,
      });
      const connection = source;
      source.addEventListener('sync', () => {
        setConnected(true);
        void sync();
      });
      const reconnect = () => {
        if (source !== connection) return;
        clearTimeout(retry);
        source?.close();
        if (disposed || scopeLost) return;
        setConnected(false);
        retry = setTimeout(() => {
          void authClient
            .me()
            .then((current) => {
              if (!disposed && !scopeLost) {
                if (current.id !== user.id) callbacks.current.onExpired();
                else open();
              }
            })
            .catch((e) => {
              if (!disposed) {
                if (
                  e instanceof AuthError &&
                  (e.status === 401 || e.status === 403)
                )
                  callbacks.current.onExpired();
                else reconnect();
              }
            });
        }, 2500);
      };
      source.addEventListener('unavailable', () => {
        void sync();
        reconnect();
      });
      source.onerror = reconnect;
    };
    void sync();
    if (typeof EventSource !== 'undefined') open();
    return () => {
      disposed = true;
      active.current = false;
      source?.close();
      clearTimeout(retry);
      refresh.current = () => {};
    };
  }, [id, user.id, resource]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const hasNewMessages = (data?.comments.length ?? 0) > previousCount.current;
    const hadMessages = previousCount.current > 0;
    previousCount.current = data?.comments.length ?? 0;
    if (atBottom.current) {
      if (hasNewMessages && hadMessages && !loading)
        el.lastElementChild?.scrollIntoView({
          block: 'nearest',
          behavior: reduced ? 'instant' : 'smooth',
        });
      setNewMessages(false);
    } else if (hasNewMessages) setNewMessages(true);
  }, [data, reduced, loading]);
  useEffect(() => {
    const track = () => {
      const el = viewport.current;
      if (!el) return;
      atBottom.current =
        el.getBoundingClientRect().bottom <= window.innerHeight + 120;
      if (atBottom.current) setNewMessages(false);
    };
    window.addEventListener('scroll', track, { passive: true });
    return () => window.removeEventListener('scroll', track);
  }, []);
  const writable =
    !solutionSaved && !data?.solution && (allowWrite ?? chatWritable(status));
  function select(list: FileList | null, solutionMode = false) {
    if (!list) return;
    const chosen = Array.from(list);
    if (chosen.some((f) => f.size > 10 * 1024 * 1024)) {
      setError('Selecione arquivos de até 10 MB.');
      return;
    }
    const setter = solutionMode ? setSolutionFiles : setFiles;
    setter((old) => {
      if (old.length + chosen.length > 10) {
        setError('Selecione no máximo 10 anexos.');
        return old;
      }
      return [...old, ...chosen];
    });
  }
  async function send(isSolution = false) {
    const content = (isSolution ? solution : text).trim(),
      chosen = isSolution ? solutionFiles : files;
    if (sending.current || !content) {
      if (!content)
        setError(
          isSolution
            ? 'Informe a descrição da solução.'
            : 'Escreva uma mensagem.',
        );
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    const staged: Attachment[] = [];
    let submitted = false;
    try {
      for (const file of chosen)
        staged.push(
          await authClient.uploadAttachment(id, file, true, resource),
        );
      submitted = true;
      if (isSolution)
        await authClient.solveTicket(
          id,
          content,
          staged.map((f) => f.id),
          resource,
          solvedAt ? new Date(solvedAt).toISOString() : undefined,
        );
      else {
        const signature = JSON.stringify([
          content,
          chosen.map((f) => [f.name, f.size, f.lastModified]),
        ]);
        if (messageRequest.current?.signature !== signature)
          messageRequest.current = { signature, id: crypto.randomUUID() };
        await authClient.addComment(
          id,
          content,
          staged.map((f) => f.id),
          messageRequest.current.id,
          resource,
        );
      }
      if (active.current) {
        if (isSolution) {
          setSolution('');
          setSolutionFiles([]);
          setSolvedAt('');
          setSolving(false);
          setNotice('Solução registrada.');
          setSolutionSaved(true);
        } else {
          setText('');
          setFiles([]);
          messageRequest.current = null;
        }
        atBottom.current = true;
        refresh.current();
        callbacks.current.onChanged();
      }
    } catch (e) {
      // Delete only still-private drafts. Already-linked attachments cannot be removed,
      // including when persistence succeeded but its HTTP response was lost.
      await Promise.allSettled(
        staged.map((f) => authClient.discardAttachment(id, f.id, resource)),
      );
      if (active.current) {
        if (e instanceof AuthError && e.status === 401)
          callbacks.current.onExpired();
        else
          setError(
            submitted && !(e instanceof AuthError)
              ? 'Não foi possível confirmar o envio. Confira a conversa antes de tentar novamente.'
              : e instanceof AuthError
                ? e.message
                : 'Não foi possível enviar. Os arquivos não confirmados serão descartados com segurança.',
          );
        refresh.current();
      }
    } finally {
      sending.current = false;
      if (active.current) setBusy(false);
    }
  }
  const filePicker = (solutionMode = false) => (
    <label className="button-secondary cursor-pointer">
      <Icon name="paper" />
      <span>Anexar</span>
      <input
        className="sr-only"
        aria-label={solutionMode ? 'Anexos da solução' : 'Anexos da mensagem'}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.gif,.txt"
        disabled={busy}
        onChange={(e) => {
          select(e.target.files, solutionMode);
          e.target.value = '';
        }}
      />
    </label>
  );
  const selectedFiles = (list: File[], solutionMode = false) => (
    <ul className="flex flex-wrap gap-2">
      {list.map((f, i) => (
        <li
          key={i}
          className="info-note flex min-w-0 items-center gap-2 text-xs"
        >
          <span className="break-all">
            {f.name} · {Math.ceil(f.size / 1024)} KB
          </span>
          <button
            type="button"
            className="text-button"
            aria-label={'Remover ' + f.name}
            disabled={busy}
            onClick={() => {
              (solutionMode ? setSolutionFiles : setFiles)((old) =>
                old.filter((_, n) => n !== i),
              );
            }}
          >
            Remover
          </button>
        </li>
      ))}
    </ul>
  );
  function attachments(list: Attachment[]) {
    return (
      <ul className="space-y-2">
        {list.map((f) => (
          <li key={f.id} className="min-w-0 space-y-2">
            {f.previewable && (
              <button
                type="button"
                className="block max-w-full"
                aria-label={'Ampliar ' + f.name}
                onClick={() => setPreview(f)}
              >
                <AttachmentImage
                  src={authClient.attachmentUrl(id, f.id, true, resource)}
                  name={f.name}
                />
              </button>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Icon name="paper" />
              <span className="break-all">
                {f.name} · {Math.ceil(f.size / 1024)} KB
              </span>
              <button
                type="button"
                className="text-button"
                onClick={async () => {
                  try {
                    const blob = await authClient.downloadAttachment(
                        id,
                        f.id,
                        resource,
                      ),
                      url = URL.createObjectURL(blob),
                      a = document.createElement('a');
                    a.href = url;
                    a.download = f.name;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } catch (e) {
                    if (e instanceof AuthError && e.status === 401)
                      callbacks.current.onExpired();
                    else setError('Download indisponível.');
                  }
                }}
              >
                Download
              </button>
            </div>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Panel
      title={'Conversa do ' + contextLabel}
      subtitle={
        connected
          ? 'Atualização em tempo real'
          : 'Conectando e sincronizando mensagens…'
      }
    >
      <div className="form-body space-y-4">
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="info-note">
            {notice}
          </p>
        )}
        {loading && <p role="status">Carregando conversa…</p>}
        <div
          ref={viewport}
          tabIndex={0}
          aria-label={'Mensagens do ' + contextLabel}
          className="ticket-chat-messages min-h-64 space-y-3 rounded-xl border border-slate-200 p-3 sm:p-5"
        >
          {!loading && data && !data.comments.length && (
            <p className="py-12 text-center text-sm text-slate-500">
              A conversa começa aqui. Envie sua primeira mensagem.
            </p>
          )}
          {data?.comments.map((m, i) => {
            const own = m.authorId === user.id,
              day = new Date(m.createdAt).toLocaleDateString('pt-BR');
            return (
              <div key={m.id}>
                {(i === 0 ||
                  day !==
                    new Date(
                      data.comments[i - 1]!.createdAt,
                    ).toLocaleDateString('pt-BR')) && (
                  <p className="py-3 text-center text-xs text-slate-500">
                    {day}
                  </p>
                )}
                <MotionRegion
                  motionKey={'message-' + m.id}
                  className={'flex ' + (own ? 'justify-end' : 'justify-start')}
                >
                  <article
                    aria-label={'Mensagem de ' + m.authorName}
                    className={
                      'ticket-chat-bubble max-w-[90%] min-w-0 space-y-2 rounded-2xl border px-4 py-3 sm:max-w-[80%] ' +
                      (own ? 'ticket-chat-own' : 'ticket-chat-received')
                    }
                  >
                    <p className="text-xs font-semibold">
                      {own ? 'Você' : m.authorName}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                      {m.content}
                    </p>
                    {attachments(m.attachments)}
                    <time
                      dateTime={m.createdAt}
                      className="block text-right text-xs text-slate-500"
                    >
                      {new Date(m.createdAt).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </article>
                </MotionRegion>
              </div>
            );
          })}
        </div>
        {newMessages && (
          <button
            className="button-secondary"
            onClick={() => {
              atBottom.current = true;
              viewport.current?.lastElementChild?.scrollIntoView({
                block: 'nearest',
                behavior: reduced ? 'instant' : 'smooth',
              });
              setNewMessages(false);
            }}
          >
            Novas mensagens ↓
          </button>
        )}
        {!!data?.attachments.length && (
          <details>
            <summary className="text-button">
              Anexos anteriores do chamado
            </summary>
            {attachments(data.attachments)}
          </details>
        )}
        {data?.solution && (
          <section className="info-note space-y-3">
            <h3 className="font-semibold">Solução registrada</h3>
            <p className="whitespace-pre-wrap break-words">
              {data.solution.description}
            </p>
            <p className="text-xs">
              {data.solution.authorName} ·{' '}
              {new Date(data.solution.createdAt).toLocaleString('pt-BR')}
            </p>
            {attachments(data.solution.attachments)}
          </section>
        )}
        {writable ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {selectedFiles(files)}
            <label className="form-label">
              Mensagem
              <textarea
                className="field min-h-24 w-full resize-y"
                placeholder="Escreva uma mensagem…"
                value={text}
                maxLength={4000}
                disabled={busy}
                required
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              {filePicker()}
              <button
                className="button-primary"
                disabled={busy || !text.trim()}
              >
                {busy ? 'Enviando…' : 'Enviar mensagem'}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Enter envia · Shift+Enter insere uma linha. Imagens e TXT, até 10
              MB por arquivo.
            </p>
          </form>
        ) : (
          <p className="info-note">
            {contextLabel === 'projeto'
              ? 'Projeto concluído ou cancelado: somente leitura.'
              : 'Chamado resolvido ou encerrado: somente leitura.'}
          </p>
        )}
        {canSolve && !solutionControl && (
          <button
            className="button-primary"
            disabled={busy}
            onClick={() => {
              setError('');
              setSolvedAt('');
              setSolving(true);
            }}
          >
            Adicionar solução
          </button>
        )}
        {canSolve && solving && (
          <DemoDialog
            title="Adicionar solução"
            eyebrow="ATENDIMENTO REAL"
            description="Registre o trabalho realizado. A solução finaliza o SLA e deixa o chamado Resolvido, sem encerramento definitivo automático."
            pending={busy}
            confirmLabel={busy ? 'Gravando…' : 'Confirmar solução'}
            onCancel={() => {
              if (!busy) {
                setSolving(false);
                setSolvedAt('');
                setSolutionFiles([]);
              }
            }}
            onConfirm={() => {
              void send(true);
              return false;
            }}
          >
            <div className="space-y-4">
              <label className="form-label">
                Data em que o problema foi solucionado
                <input
                  className="field"
                  type="datetime-local"
                  step={1}
                  value={solvedAt}
                  disabled={busy}
                  onChange={(e) => setSolvedAt(e.target.value)}
                />
                <span className="text-xs">
                  Em branco: agora. A auditoria conserva o momento do registro;
                  o servidor valida a data e o calendário do SLA.
                </span>
              </label>
              <label className="form-label">
                Descrição obrigatória
                <textarea
                  className="field min-h-36 w-full"
                  value={solution}
                  required
                  maxLength={4000}
                  disabled={busy}
                  onChange={(e) => setSolution(e.target.value)}
                />
              </label>
              {filePicker(true)}
              {selectedFiles(solutionFiles, true)}
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
            </div>
          </DemoDialog>
        )}
        {preview && (
          <DemoDialog
            title="Visualização do anexo"
            eyebrow="ARQUIVO AUTORIZADO"
            onCancel={() => setPreview(null)}
            cancelLabel="Fechar"
          >
            <AttachmentImage
              src={authClient.attachmentUrl(id, preview.id, true, resource)}
              name={preview.name}
              expanded
            />
          </DemoDialog>
        )}
      </div>
    </Panel>
  );
}
