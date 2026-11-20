import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  Conversation,
  Attachment,
  PublicUser,
  TicketDetail,
} from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { Panel } from './ui';
import { DemoDialog } from './demo-dialog';
import { MotionRegion } from './motion-region';
import { useMotionPreference } from '../hooks/use-motion-preference';
import { TicketOpening } from './ticket-opening';
import { AttachmentCard, AttachmentPicker } from './attachment-card';
import {
  attachmentSelectionError,
  fileSelectionKey,
  newSelections,
} from '../lib/attachment-display';

import {
  mergeMessages,
  chatWritable,
  projectTicketOpening,
} from '../lib/chat-messages';
type ChatResource = 'tickets' | 'project-conversation';
type PendingMessage = {
  id: string;
  content: string;
  files: File[];
  attachmentIds: string[];
};

function discardDrafts(id: string, ids: string[], resource: ChatResource) {
  return Promise.allSettled(
    ids.map((fileId) => authClient.discardAttachment(id, fileId, resource)),
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
  opening,
  projectOpening,
}: {
  id: string;
  status: string;
  user: PublicUser;
  onExpired: () => void;
  onChanged: () => void;
  resource?: ChatResource;
  contextLabel?: 'chamado' | 'projeto';
  allowWrite?: boolean;
  allowSolve?: boolean;
  solutionControl?: { open: boolean; onOpenChange: (open: boolean) => void };
  opening?: { ticket: TicketDetail; requester: string };
  projectOpening?: ReactNode;
}) {
  const [solvedAt, setSolvedAt] = useState('');
  const [solutionSaved, setSolutionSaved] = useState(false);
  const [data, setData] = useState<Conversation | null>(null),
    [text, setText] = useState(''),
    [error, setError] = useState(''),
    [syncError, setSyncError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [connected, setConnected] = useState(false),
    [newMessages, setNewMessages] = useState(false),
    [files, setFiles] = useState<File[]>([]),
    [showFiles, setShowFiles] = useState(false),
    [solutionFiles, setSolutionFiles] = useState<File[]>([]),
    [solution, setSolution] = useState(''),
    [localSolving, setLocalSolving] = useState(false),
    [notice, setNotice] = useState('');
  const solving = solutionControl?.open ?? localSolving;
  const setSolving = solutionControl?.onOpenChange ?? setLocalSolving;
  const canSolve =
    !solutionSaved &&
    !data?.solution &&
    (allowSolve ?? (user.role === 'TECHNICIAN' && status === 'IN_PROGRESS'));
  const { reduced } = useMotionPreference();
  const composerHelp = useId();
  const fixed = !!(opening || projectOpening);
  const openingTicket = opening?.ticket;
  const presentation = useMemo(
    () =>
      openingTicket && data ? projectTicketOpening(openingTicket, data) : null,
    [openingTicket, data],
  );
  const comments = presentation?.comments ?? data?.comments;
  const messageCount = comments?.length ?? 0;
  const viewport = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    messageRequest = useRef<PendingMessage | null>(null),
    previousCount = useRef(0),
    initialHistory = useRef(false),
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
    initialHistory.current = false;
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
        setSyncError('');
        callbacks.current.onChanged();
      } catch (e) {
        if (!disposed) {
          if (e instanceof AuthError && e.status === 401)
            callbacks.current.onExpired();
          else {
            if (e instanceof AuthError && [403, 404].includes(e.status)) {
              scopeLost = true;
              setData(null);
              setFiles([]);
              setSolutionFiles([]);
              source?.close();
              clearTimeout(retry);
              setConnected(false);
              callbacks.current.onChanged();
            }
            setSyncError(
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
      if (!sending.current && messageRequest.current) {
        void discardDrafts(id, messageRequest.current.attachmentIds, resource);
        messageRequest.current = null;
      }
      refresh.current = () => {};
    };
  }, [id, user.id, resource]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const hasNewMessages = messageCount > previousCount.current;
    const hadMessages = previousCount.current > 0;
    previousCount.current = messageCount;
    if (fixed && !initialHistory.current && !loading) {
      initialHistory.current = true;
      atBottom.current = el.scrollHeight - el.clientHeight - el.scrollTop <= 96;
      return;
    }
    if (atBottom.current) {
      if (hasNewMessages && !loading) {
        if (fixed) el.scrollTop = el.scrollHeight;
        else if (hadMessages)
          el.lastElementChild?.scrollIntoView({
            block: 'nearest',
            behavior: reduced ? 'instant' : 'smooth',
          });
      }
      setNewMessages(false);
    } else if (hasNewMessages) setNewMessages(true);
  }, [data, messageCount, reduced, loading, fixed]);
  useEffect(() => {
    if (fixed) return;
    const track = () => {
      const el = viewport.current;
      if (!el) return;
      atBottom.current =
        el.getBoundingClientRect().bottom <= window.innerHeight + 120;
      if (atBottom.current) setNewMessages(false);
    };
    window.addEventListener('scroll', track, { passive: true });
    return () => window.removeEventListener('scroll', track);
  }, [fixed]);
  const writable =
    !solutionSaved && !data?.solution && (allowWrite ?? chatWritable(status));
  function select(chosen: File[], solutionMode = false) {
    const current = solutionMode ? solutionFiles : files;
    const added = newSelections(current, chosen);
    const selectionError = attachmentSelectionError(added);
    if (selectionError) {
      setError(selectionError);
      return;
    }
    if (current.length + added.length > 10) {
      setError('Selecione no máximo 10 anexos.');
      return;
    }
    if (added.length) {
      setError('');
      (solutionMode ? setSolutionFiles : setFiles)([...current, ...added]);
    }
  }
  async function send(isSolution = false) {
    const original = isSolution ? solution : text,
      content = original.trim(),
      chosen = isSolution ? solutionFiles : files;
    if (sending.current || (isSolution ? !canSolve : !writable)) return;
    if (!content && (isSolution || !chosen.length)) {
      setError(
        isSolution
          ? 'Informe a descrição da solução.'
          : 'Escreva uma mensagem ou anexe um arquivo.',
      );
      return;
    }
    if (!isSolution) composer.current?.focus({ preventScroll: true });
    sending.current = true;
    setBusy(true);
    setError('');
    let staged: string[] = [];
    let submitted = false;
    try {
      let request = isSolution ? null : messageRequest.current;
      if (
        request &&
        (request.content !== content || request.files !== chosen)
      ) {
        messageRequest.current = null;
        await discardDrafts(id, request.attachmentIds, resource);
        request = null;
      }
      if (request) {
        staged = request.attachmentIds;
      } else {
        for (const file of chosen)
          staged.push(
            (await authClient.uploadAttachment(id, file, true, resource)).id,
          );
      }
      if (isSolution) {
        submitted = true;
        await authClient.solveTicket(
          id,
          content,
          staged,
          resource,
          solvedAt ? new Date(solvedAt).toISOString() : undefined,
        );
      } else {
        request ??= {
          id: crypto.randomUUID(),
          content,
          files: chosen,
          attachmentIds: staged,
        };
        messageRequest.current = request;
        submitted = true;
        await authClient.addComment(
          id,
          content,
          request.attachmentIds,
          request.id,
          resource,
        );
        messageRequest.current = null;
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
          setText((current) => (current === original ? '' : current));
          setFiles([]);
        }
        if (!fixed) atBottom.current = true;
        refresh.current();
        callbacks.current.onChanged();
      }
    } catch (e) {
      const outdatedSchema =
        e instanceof AuthError && e.code === 'ATTACHMENT_SCHEMA_OUTDATED';
      const uncertain =
        submitted &&
        !outdatedSchema &&
        (!(e instanceof AuthError) || e.status === 0 || e.status >= 500);
      // Retries of an unconfirmed message must reuse the original draft IDs and key.
      if (
        isSolution ||
        !(uncertain || (submitted && outdatedSchema)) ||
        !active.current
      ) {
        if (!isSolution) messageRequest.current = null;
        await discardDrafts(id, staged, resource);
      }
      if (active.current) {
        if (e instanceof AuthError && e.status === 401)
          callbacks.current.onExpired();
        else
          setError(
            uncertain
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
    <AttachmentPicker
      label={solutionMode ? 'Anexos da solução' : 'Anexos da mensagem'}
      multiple
      disabled={busy}
      onFiles={(selected) => select(selected, solutionMode)}
    />
  );
  const selectedFiles = (list: File[], solutionMode = false, strip = false) => (
    <ul
      className={strip ? 'attachment-strip' : 'attachment-grid'}
      aria-label="Anexos selecionados"
    >
      {list.map((file) => (
        <li key={fileSelectionKey(file)}>
          <AttachmentCard
            file={file}
            local={file}
            disabled={busy}
            onRemove={() => {
              (solutionMode ? setSolutionFiles : setFiles)((current) =>
                current.filter((candidate) => candidate !== file),
              );
            }}
          />
        </li>
      ))}
    </ul>
  );
  function attachments(list: Attachment[]) {
    return (
      <ul className="attachment-grid" aria-label="Anexos">
        {list.map((file) => (
          <li key={file.id}>
            <AttachmentCard
              file={file}
              imageUrl={
                file.previewable
                  ? authClient.attachmentUrl(id, file.id, true, resource)
                  : undefined
              }
              load={() => authClient.downloadAttachment(id, file.id, resource)}
              onExpired={() => callbacks.current.onExpired()}
            />
          </li>
        ))}
      </ul>
    );
  }
  const previousFiles =
    presentation?.previousAttachments ?? data?.attachments ?? [];
  const legacyFiles = previousFiles.length > 0 && (
    <details>
      <summary className="text-button">Anexos anteriores do chamado</summary>
      {attachments(previousFiles)}
    </details>
  );
  const solutionRecord = data?.solution && (
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
  );
  const jumpToLatest = newMessages && (
    <button
      className={
        fixed ? 'ticket-new-messages button-secondary' : 'button-secondary'
      }
      onClick={() => {
        atBottom.current = true;
        const el = viewport.current;
        if (fixed && el) {
          el.scrollTop = el.scrollHeight;
          el.focus({ preventScroll: true });
        } else {
          el?.lastElementChild?.scrollIntoView({
            block: 'nearest',
            behavior: reduced ? 'instant' : 'smooth',
          });
        }
        setNewMessages(false);
      }}
    >
      Novas mensagens ↓
    </button>
  );
  return (
    <Panel
      title={'Conversa do ' + contextLabel}
      subtitle={
        connected
          ? 'Atualização em tempo real'
          : 'Conectando e sincronizando mensagens…'
      }
      action={fixed ? jumpToLatest : undefined}
    >
      <div
        className={fixed ? 'ticket-conversation-body' : 'form-body space-y-4'}
      >
        {(syncError || error) && (
          <p role="alert" className="form-error">
            {error || syncError}
          </p>
        )}
        {notice && (
          <p role="status" className="info-note">
            {notice}
          </p>
        )}
        {loading && !fixed && <p role="status">Carregando conversa…</p>}
        <div
          ref={viewport}
          tabIndex={0}
          role="region"
          aria-label={'Mensagens do ' + contextLabel}
          className={
            fixed
              ? 'ticket-chat-messages ticket-conversation-history space-y-3'
              : 'ticket-chat-messages min-h-64 space-y-3 rounded-xl border border-slate-200 p-3 sm:p-5'
          }
          onScroll={
            fixed
              ? (event) => {
                  const el = event.currentTarget;
                  atBottom.current =
                    el.scrollHeight - el.clientHeight - el.scrollTop <= 96;
                  if (atBottom.current) setNewMessages(false);
                }
              : undefined
          }
        >
          {opening && (
            <TicketOpening
              ticket={opening.ticket}
              requester={opening.requester}
              files={
                presentation?.openingAttachments.length
                  ? attachments(presentation.openingAttachments)
                  : undefined
              }
            />
          )}
          {projectOpening}
          {loading && fixed && <p role="status">Carregando conversa…</p>}
          {!loading && data && !comments?.length && !fixed && (
            <p className="py-12 text-center text-sm text-slate-500">
              A conversa começa aqui. Envie sua primeira mensagem.
            </p>
          )}
          {comments?.map((m, i) => {
            const own = m.authorId === user.id,
              day = new Date(m.createdAt).toLocaleDateString('pt-BR'),
              layout = 'flex ' + (own ? 'justify-end' : 'justify-start');
            const bubble = (
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
                {m.content && (
                  <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                    {m.content}
                  </p>
                )}
                {(!fixed || m.attachments.length > 0) &&
                  attachments(m.attachments)}
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
            );
            return (
              <div key={m.id}>
                {(i === 0 ||
                  day !==
                    new Date(comments[i - 1]!.createdAt).toLocaleDateString(
                      'pt-BR',
                    )) && (
                  <p className="py-3 text-center text-xs text-slate-500">
                    {day}
                  </p>
                )}
                {fixed ? (
                  <div className={layout}>{bubble}</div>
                ) : (
                  <MotionRegion
                    motionKey={'message-' + m.id}
                    className={layout}
                  >
                    {bubble}
                  </MotionRegion>
                )}
              </div>
            );
          })}
          {fixed && legacyFiles}
          {fixed && solutionRecord}
        </div>
        {!fixed && jumpToLatest}
        {!fixed && legacyFiles}
        {!fixed && solutionRecord}
        {writable ? (
          <form
            className={fixed ? 'ticket-composer' : 'space-y-3'}
            aria-busy={busy}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            {files.length > 0 && selectedFiles(files, false, true)}
            <label className="form-label">
              <span className={fixed ? 'sr-only' : undefined}>Mensagem</span>
              <textarea
                ref={composer}
                className={
                  fixed
                    ? 'field w-full resize-none'
                    : 'field min-h-24 w-full resize-y'
                }
                placeholder="Escreva uma mensagem…"
                aria-describedby={composerHelp}
                value={text}
                maxLength={4000}
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
            <div
              className={
                fixed
                  ? 'flex flex-wrap items-center gap-2'
                  : 'flex flex-wrap items-center justify-between gap-3'
              }
            >
              {filePicker()}
              {fixed && files.length > 0 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setShowFiles(true)}
                >
                  {files.length} {files.length === 1 ? 'anexo' : 'anexos'}
                </button>
              )}
              <button
                className={fixed ? 'button-primary ml-auto' : 'button-primary'}
                disabled={busy || (!text.trim() && !files.length)}
              >
                {busy ? 'Enviando…' : 'Enviar mensagem'}
              </button>
            </div>
            <p
              id={composerHelp}
              className={
                fixed
                  ? 'ticket-composer-help text-xs text-slate-500'
                  : 'text-xs text-slate-500'
              }
            >
              Enter envia · Shift+Enter insere uma linha. Imagens, TXT, MD, CSV,
              PDF, DOCX, XLSX e PPTX.
            </p>
          </form>
        ) : (
          <p
            className={
              fixed ? 'ticket-composer-readonly info-note' : 'info-note'
            }
          >
            {contextLabel === 'projeto'
              ? 'Projeto concluído ou cancelado: somente leitura.'
              : 'Chamado resolvido ou encerrado: somente leitura.'}
          </p>
        )}
        {writable && fixed && showFiles && (
          <DemoDialog
            title="Anexos da mensagem"
            eyebrow="CONVERSA"
            cancelLabel="Voltar à mensagem"
            onCancel={() => setShowFiles(false)}
          >
            {files.length ? (
              selectedFiles(files)
            ) : (
              <p>Nenhum anexo selecionado.</p>
            )}
          </DemoDialog>
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
      </div>
    </Panel>
  );
}
