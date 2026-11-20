import { visibleFormKeys, type TicketDetail } from '@helpdesk/contracts';
import type { ReactNode } from 'react';

function displayAnswer(
  type: TicketDetail['serviceSnapshot']['fields'][number]['type'],
  value: TicketDetail['answers'][number]['value'] | undefined,
) {
  if (type === 'FILE') {
    const count = Array.isArray(value) ? value.length : 0;
    if (count === 0) return 'Nenhum arquivo informado';
    return count === 1 ? '1 arquivo enviado' : `${count} arquivos enviados`;
  }
  if (Array.isArray(value)) return value.join(', ') || 'Não informado';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return String(value ?? 'Não informado');
}

export function TicketOpening({
  ticket,
  requester,
  files,
}: {
  ticket: TicketDetail;
  requester: string;
  files?: ReactNode;
}) {
  const snapshot = ticket.serviceSnapshot;
  const answers = Object.fromEntries(
    ticket.answers.map(({ fieldKey, value }) => [fieldKey, value]),
  );
  const visible = visibleFormKeys(snapshot.fields, answers);
  const fields = snapshot.fields.filter((field) => visible.has(field.key));
  const responses = (
    <dl className="ticket-opening-answers">
      {fields.map((field) => (
        <div key={field.id}>
          <dt>{field.label}</dt>
          <dd className="whitespace-pre-wrap">
            {displayAnswer(field.type, answers[field.key])}
          </dd>
        </div>
      ))}
    </dl>
  );
  return (
    <article
      className="ticket-opening panel"
      aria-label="Solicitação registrada"
    >
      <header className="ticket-opening-header">
        <h3>Solicitação registrada</h3>
        <span className="ticket-opening-id">HD-{ticket.code}</span>
      </header>
      <dl className="ticket-opening-section ticket-opening-details">
        <div>
          <dt>Solicitante</dt>
          <dd>{requester}</dd>
        </div>
        <div>
          <dt>Data da solicitação</dt>
          <dd>
            <time dateTime={ticket.createdAt}>
              {new Date(ticket.createdAt).toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </time>
          </dd>
        </div>
      </dl>
      <section className="ticket-opening-section ticket-opening-details">
        <div>
          <h4>Assunto</h4>
          <p className="ticket-opening-subject">{ticket.subject}</p>
        </div>
        <div>
          <h4>Descrição</h4>
          <p className="whitespace-pre-wrap">{ticket.description}</p>
        </div>
      </section>
      <section className="ticket-opening-section">
        <h4>Serviço solicitado</h4>
        <p>
          {snapshot.categoryName} › {snapshot.serviceName}
        </p>
        {snapshot.serviceDescription && (
          <p className="whitespace-pre-wrap">{snapshot.serviceDescription}</p>
        )}
      </section>
      {fields.length > 0 && (
        <section className="ticket-opening-section">
          {fields.length > 4 ? (
            <details>
              <summary className="text-button">
                Perguntas e respostas ({fields.length})
              </summary>
              {responses}
            </details>
          ) : (
            responses
          )}
        </section>
      )}
      {files && (
        <section className="ticket-opening-section">
          <h4>Anexos da abertura</h4>
          {files}
        </section>
      )}
    </article>
  );
}
