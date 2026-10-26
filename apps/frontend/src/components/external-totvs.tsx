import { useState } from 'react';
import type { DemoTicket, DemoAction, Role } from '../types/demo';
import { Panel } from './ui';
export function ExternalTotvs({
  ticket,
  role,
  onAction,
}: {
  ticket: DemoTicket;
  role: Role;
  onAction: (action: DemoAction) => void;
}) {
  const [value, setValue] = useState(ticket.externalTotvs ?? '');
  if (!(ticket.service.id === 's3')) return null;
  const canEdit =
    role === 'technician' &&
    ticket.technicianId === 't1' &&
    ticket.status !== 'CLOSED';
  return (
    <Panel
      title="Referência externa TOTVS"
      subtitle="Não é o número interno do HelpDesk. Sem integração real."
    >
      <div className="form-body">
        {canEdit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAction({ type: 'external-totvs', id: ticket.id, value });
            }}
          >
            <label className="form-label">
              Número do chamado externo TOTVS{' '}
              <span className="text-xs font-normal text-slate-500">
                Opcional
              </span>
              <input
                className="field"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={80}
                placeholder="Ex.: TOTVS-DEMO-1234"
              />
            </label>
            <button className="button-secondary mt-4" type="submit">
              Simular atualização da referência
            </button>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Não altera status ou pendência. Visível ao solicitante quando
              informado.
            </p>
          </form>
        ) : (
          <p className="text-sm text-slate-700">
            {ticket.externalTotvs ||
              'Não informado. Nem todo atendimento exige um chamado externo.'}
          </p>
        )}
      </div>
    </Panel>
  );
}
