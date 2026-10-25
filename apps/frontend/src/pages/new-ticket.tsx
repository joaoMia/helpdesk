import { money } from '../lib/presentation';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { DemoAction } from '../types/demo';
import { services } from '../mocks/fixtures';
import { href } from '../navigation/routes';
import { Icon, PageHeading, Panel } from '../components/ui';

export function NewTicket({
  onCreate,
}: {
  onCreate: (action: Extract<DemoAction, { type: 'create' }>) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<string | null>(null);
  const [error, setError] = useState('');
  const chosen = services.filter((s) => selected.includes(s.id) && s.active);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = String(data.get('subject') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    if (!subject || !description || !chosen.length) {
      setError(
        'Preencha assunto, descrição e selecione ao menos um serviço ativo.',
      );
      return;
    }
    onCreate({
      type: 'create',
      subject,
      description,
      services: chosen,
      attachment,
    });
  };
  return (
    <>
      <PageHeading
        eyebrow="NOVA SOLICITAÇÃO"
        title="Como podemos ajudar?"
        description="Conte o que aconteceu. A equipe de TI fará a triagem e definirá o atendimento."
      />
      <form onSubmit={submit} className="detail-grid">
        <div className="space-y-6">
          <Panel
            title="Sobre a solicitação"
            subtitle="Os campos marcados com * são obrigatórios."
          >
            <div className="form-body">
              <label className="form-label">
                Assunto *
                <input
                  className="field"
                  name="subject"
                  placeholder="Ex.: não consigo acessar a rede interna"
                  required
                  maxLength={160}
                />
              </label>
              <label className="form-label">
                Descrição *
                <textarea
                  className="field min-h-36"
                  name="description"
                  placeholder="Descreva o problema, quando começou e o que você já tentou."
                  required
                  maxLength={4000}
                />
              </label>
              <label className="attachment-box">
                <Icon name="paper" />
                <span>
                  <span className="block text-sm font-medium text-slate-700">
                    Anexo opcional
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    Nesta prévia, apenas o nome é exibido. O arquivo não é
                    enviado.
                  </span>
                  <input
                    className="mt-3 block w-full min-w-0 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-700"
                    type="file"
                    onChange={(e) =>
                      setAttachment(e.target.files?.[0]?.name ?? null)
                    }
                  />
                </span>
              </label>
            </div>
          </Panel>
          <Panel
            title="De quais serviços você precisa? *"
            subtitle="Selecione um ou mais serviços ativos. Valores são fictícios."
          >
            <fieldset className="form-body grid gap-3">
              <legend className="sr-only">Serviços ativos obrigatórios</legend>
              {services
                .filter((s) => s.active)
                .map((service) => (
                  <label
                    className={`service-choice ${selected.includes(service.id) ? 'service-selected' : ''}`}
                    key={service.id}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-teal-700"
                      checked={selected.includes(service.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, service.id]
                            : selected.filter((id) => id !== service.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-800">
                        {service.name}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        {service.description}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-sm font-medium text-slate-600">
                      {money(service.cents)}
                    </span>
                  </label>
                ))}
            </fieldset>
          </Panel>
        </div>
        <aside>
          <section className="panel p-6">
            <p className="eyebrow">RESUMO DA SOLICITAÇÃO</p>
            <h2 className="mt-3 text-lg font-semibold">
              Tudo pronto para começar
            </h2>
            <div className="my-6 space-y-3 text-sm text-slate-600">
              <p className="flex justify-between gap-3">
                <span>Serviços selecionados</span>
                <strong className="text-slate-900">{chosen.length}</strong>
              </p>
              <p className="flex justify-between gap-3">
                <span>Total ilustrativo</span>
                <strong className="text-slate-900">
                  {money(chosen.reduce((sum, s) => sum + s.cents, 0))}
                </strong>
              </p>
            </div>
            <p className="info-note">
              Seu chamado começa aberto, sem prioridade e sem técnico. A
              classificação acontece depois.
            </p>
            <p className="my-4 text-xs leading-5 text-slate-500">
              Não é necessário escolher técnico ou reservar horário. Nada será
              salvo no servidor.
            </p>
            {error && (
              <p role="alert" className="mb-4 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              className="button-primary w-full justify-center"
              type="submit"
            >
              <Icon name="plus" />
              Simular abertura
            </button>
            <a
              className="button-secondary mt-3 w-full justify-center"
              href={href('requester', 'chamados')}
            >
              Cancelar
            </a>
          </section>
        </aside>
      </form>
    </>
  );
}
