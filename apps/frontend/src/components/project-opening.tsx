import { useEffect, useState } from 'react';
import type { ProjectWorkflow } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { ProjectAttachments } from './project-attachments';

type Submission = NonNullable<
  Awaited<ReturnType<typeof authClient.projectSubmission>>
>;

function answerText(
  type: Submission['snapshot']['fields'][number]['type'],
  answer: Submission['answers'][string] | undefined,
) {
  if (answer === undefined || answer === '') return 'Não informado';
  if (type === 'FILE' && Array.isArray(answer)) {
    return answer.length === 1
      ? '1 arquivo enviado'
      : `${answer.length} arquivos enviados`;
  }
  if (Array.isArray(answer)) return answer.join(', ') || 'Não informado';
  if (typeof answer === 'boolean') return answer ? 'Sim' : 'Não';
  if (typeof answer === 'number') return answer.toLocaleString('pt-BR');
  if (type === 'DATE')
    return new Date(`${answer}T12:00:00`).toLocaleDateString('pt-BR');
  if (type === 'DATE_TIME') return new Date(answer).toLocaleString('pt-BR');
  return answer;
}

export function ProjectOpening({
  workflow: project,
  onExpired,
}: {
  workflow: ProjectWorkflow;
  onExpired: () => void;
}) {
  const [submission, setSubmission] = useState<Submission | null>();
  const [error, setError] = useState('');
  const id = project.id;

  useEffect(() => {
    let active = true;
    authClient.projectSubmission(id).then(
      (result) => {
        if (active) {
          setSubmission(result);
          setError('');
        }
      },
      (failure: unknown) => {
        if (!active) return;
        if (failure instanceof AuthError && failure.status === 401) onExpired();
        setError(
          failure instanceof AuthError
            ? failure.message
            : 'Não foi possível consultar a solicitação original.',
        );
      },
    );
    return () => {
      active = false;
    };
  }, [id, onExpired]);

  return (
    <article
      className="ticket-opening panel"
      aria-label="Solicitação registrada"
    >
      <header className="ticket-opening-header">
        <h3>Solicitação registrada</h3>
        <span className="ticket-opening-id">PR-{project.code}</span>
      </header>
      <dl className="ticket-opening-section ticket-opening-details">
        <div>
          <dt>Solicitante</dt>
          <dd>{project.requesterName ?? 'Não informado'}</dd>
        </div>
        <div>
          <dt>Data da solicitação</dt>
          <dd>
            <time dateTime={project.createdAt}>
              {new Date(project.createdAt).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </time>
          </dd>
        </div>
      </dl>
      <section className="ticket-opening-section ticket-opening-details">
        <div>
          <h4>Título do projeto</h4>
          <p className="ticket-opening-subject">{project.title}</p>
        </div>
        <div>
          <h4>Objetivo</h4>
          <p className="whitespace-pre-wrap">{project.objective}</p>
        </div>
        <div>
          <h4>Problema ou necessidade</h4>
          <p className="whitespace-pre-wrap">{project.need}</p>
        </div>
        <div>
          <h4>Categoria</h4>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : submission === undefined ? (
            <p role="status">Consultando categoria…</p>
          ) : (
            <p>{submission?.snapshot.categoryName ?? 'Não registrada'}</p>
          )}
        </div>
      </section>
      <ProjectAttachments id={id} onExpired={onExpired} />
      {!error && submission && submission.snapshot.fields.length > 0 && (
        <section className="ticket-opening-section">
          <details>
            <summary className="text-button">Respostas da solicitação</summary>
            <p className="mt-2 text-xs text-slate-500">
              Versão {submission.snapshot.version} do formulário
            </p>
            <dl className="ticket-opening-answers">
              {submission.snapshot.fields.map((field) => (
                <div key={field.id}>
                  <dt>{field.label}</dt>
                  <dd className="whitespace-pre-wrap">
                    {answerText(field.type, submission.answers[field.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </section>
      )}
    </article>
  );
}
