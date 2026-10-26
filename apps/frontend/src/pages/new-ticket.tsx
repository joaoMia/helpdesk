import { focusFirstError, scrollToContent } from '../lib/motion';
import { ConfirmChange } from '../components/confirm-change';
import { useEffect, useState } from 'react';
import type { DemoAction, DemoCatalog, DemoService } from '../types/demo';
import type { ServiceAnswers } from '../forms/service-definitions';
import { sanitizeAnswers, validateAnswers } from '../forms/service-definitions';
import { availableServices } from '../mocks/catalog';
import {
  ServiceFields,
  ServiceAnswerSummary,
} from '../components/service-fields';
import { Stepper } from '../components/stepper';
import { MotionRegion } from '../components/motion-region';
import { EmptyState, Icon, PageHeading, Panel } from '../components/ui';

export function NewTicket({
  onCreate,
  catalog,
}: {
  onCreate: (action: Extract<DemoAction, { type: 'create' }>) => void;
  catalog: DemoCatalog;
}) {
  const [step, setStep] = useState(0),
    [categoryId, setCategoryId] = useState(''),
    [serviceId, setServiceId] = useState(''),
    [query, setQuery] = useState('');
  const [answers, setAnswers] = useState<ServiceAnswers>({}),
    [subject, setSubject] = useState(''),
    [description, setDescription] = useState(''),
    [attachment, setAttachment] = useState<string | null>(null),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState('');
  const [pendingChange, setPendingChange] = useState<(() => void) | null>(null);
  const category = catalog.categories.find((c) => c.id === categoryId),
    service = catalog.services.find((s) => s.id === serviceId);
  const dirty = !!(
    subject ||
    description ||
    attachment ||
    Object.values(answers).some((v) => (Array.isArray(v) ? v.length : !!v))
  );
  useEffect(() => {
    document.getElementById('page-title')?.focus({ preventScroll: true });
    scrollToContent(document.getElementById('main-content'));
  }, [step]);
  function resetForChange() {
    setAnswers({});
    setSubject('');
    setDescription('');
    setAttachment(null);
    setErrors({});
    setError('');
    return true;
  }
  function changeSelection(next: () => void) {
    if (dirty) setPendingChange(() => next);
    else next();
  }
  function chooseCategory(id: string) {
    const next = () => {
      if (id !== categoryId) {
        resetForChange();
        setServiceId('');
      }
      setCategoryId(id);
      setQuery('');
      setStep(1);
    };
    if (id !== categoryId && serviceId) changeSelection(next);
    else next();
  }
  function chooseService(nextService: DemoService) {
    const next = () => {
      if (nextService.id !== serviceId) resetForChange();
      setServiceId(nextService.id);
      setStep(2);
    };
    if (nextService.id !== serviceId) changeSelection(next);
    else next();
  }
  function review() {
    if (!service || !category) return;
    const e = validateAnswers(service.id, answers, service.fields);
    setErrors(e);
    if (!subject.trim() || !description.trim() || Object.keys(e).length) {
      setError('Revise os campos obrigatórios indicados.');
      window.requestAnimationFrame(() =>
        focusFirstError(document.getElementById('main-content')),
      );
      return;
    }
    setError('');
    setStep(3);
  }
  function open() {
    if (!service || !category || !category.active || !service.active) return;
    onCreate({
      type: 'create',
      subject,
      description,
      service,
      category,
      answers: sanitizeAnswers(service.id, answers, service.fields),
      attachment,
    });
  }
  const categories = catalog.categories
    .filter(
      (c) =>
        c.active &&
        `${c.name} ${c.description}`
          .toLocaleLowerCase('pt-BR')
          .includes(query.toLocaleLowerCase('pt-BR')),
    )
    .sort((a, b) => a.order - b.order);
  return (
    <>
      {pendingChange && (
        <ConfirmChange
          message="Trocar de serviço descarta as informações e anexos preenchidos. Você pode manter o rascunho atual."
          onCancel={() => setPendingChange(null)}
          onConfirm={() => {
            pendingChange();
            setPendingChange(null);
          }}
        />
      )}
      <PageHeading
        eyebrow="CENTRAL DE SERVIÇOS · DEMONSTRAÇÃO"
        title={
          [
            'Do que você precisa?',
            'Escolha o serviço',
            'Conte os detalhes',
            'Revise e abra seu chamado',
          ][step]!
        }
        description={
          step === 0
            ? 'Encontre a categoria certa. Um chamado, um serviço, um acompanhamento completo.'
            : step === 1
              ? `${category?.name ?? 'Categoria'} · escolha exatamente um serviço ativo.`
              : step === 2
                ? 'O formulário acompanha o serviço escolhido. Use apenas informações fictícias.'
                : 'Confira os dados. A abertura acontece apenas na memória desta prévia.'
        }
      />
      <Stepper
        steps={['Categoria', 'Serviço', 'Formulário', 'Revisão']}
        current={step}
        onStep={setStep}
      />
      <MotionRegion motionKey={'ticket-step-' + step}>
        {step === 0 ? (
          <>
            <label className="search-field mb-6">
              <Icon name="search" />
              <span className="sr-only">Buscar categoria</span>
              <input
                placeholder="Buscar categoria de serviço"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {categories.length ? (
              <div className="selection-grid">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    className="selection-card"
                    onClick={() => chooseCategory(c.id)}
                  >
                    <span className="category-symbol">
                      <Icon
                        name={
                          c.id === 'network'
                            ? 'grid'
                            : c.id === 'accounts'
                              ? 'users'
                              : 'tool'
                        }
                      />
                    </span>
                    <h2>{c.name}</h2>
                    <p>{c.description}</p>
                    <span className="selection-meta">
                      {availableServices(catalog, c.id).length} serviços
                      disponíveis <Icon name="arrow" />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="Nenhuma categoria encontrada">
                Experimente outra pesquisa.
              </EmptyState>
            )}
          </>
        ) : step === 1 ? (
          <>
            {category && (
              <p className="info-note mb-5">
                Categoria: {category.name}. Precisa de dois serviços? Abra dois
                chamados distintos.
              </p>
            )}
            <div className="selection-grid">
              {availableServices(catalog, categoryId).map((s) => (
                <button
                  key={s.id}
                  className={`selection-card ${s.id === serviceId ? 'selection-current' : ''}`}
                  onClick={() => chooseService(s)}
                >
                  <span className="category-symbol">
                    <Icon name="ticket" />
                  </span>
                  <h2>{s.name}</h2>
                  <p>{s.description}</p>
                  <span className="selection-meta">
                    Preencher solicitação <Icon name="arrow" />
                  </span>
                </button>
              ))}
            </div>
            {!availableServices(catalog, categoryId).length && (
              <EmptyState title="Nenhum serviço ativo nesta categoria">
                Volte e escolha outra categoria.
              </EmptyState>
            )}
            <button
              className="button-secondary mt-6"
              onClick={() => setStep(0)}
            >
              ← Voltar às categorias
            </button>
          </>
        ) : step === 2 && service ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              review();
            }}
            className="detail-grid"
          >
            <div className="space-y-6">
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <Panel
                title={service.name}
                subtitle={`${category?.name} · campos em validação`}
              >
                <div className="form-body">
                  <label className="form-label">
                    Assunto *
                    <input
                      className="field"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      maxLength={160}
                    />
                  </label>
                  <label className="form-label">
                    Descrição *
                    <textarea
                      className="field min-h-28"
                      required
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={4000}
                    />
                  </label>
                  <ServiceFields
                    key={service.id}
                    serviceId={service.id}
                    fields={service.fields}
                    answers={answers}
                    onChange={(next) => {
                      setAnswers(next);
                      if (Object.keys(errors).length)
                        setErrors(
                          validateAnswers(service.id, next, service.fields),
                        );
                    }}
                    errors={errors}
                  />
                  <label className="form-label">
                    Anexo geral opcional
                    <input
                      className="field"
                      type="file"
                      onChange={(e) =>
                        setAttachment(e.target.files?.[0]?.name ?? null)
                      }
                    />
                  </label>
                  {attachment && (
                    <p className="text-xs text-slate-500">
                      Nome mantido: {attachment} · sem upload.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={() => setStep(1)}
                    >
                      Voltar ao serviço
                    </button>
                    <button className="button-primary" type="submit">
                      Revisar chamado <Icon name="arrow" />
                    </button>
                  </div>
                </div>
              </Panel>
            </div>
            <aside className="panel p-6">
              <p className="eyebrow">SUA SOLICITAÇÃO</p>
              <h2 className="text-lg font-semibold">{service.name}</h2>
              <p className="my-4 text-sm text-slate-500">{category?.name}</p>
              <p className="info-note">
                Sem escolher técnico ou horário. O chamado começa OPEN, sem
                prioridade e sem responsável.
              </p>
            </aside>
          </form>
        ) : service ? (
          <div className="space-y-6">
            <Panel title="Resumo da solicitação">
              <div className="form-body">
                <div className="summary-strip">
                  <span>{category?.name}</span>
                  <strong>{service.name}</strong>
                </div>
                <h2 className="text-xl font-semibold">{subject}</h2>
                <p className="whitespace-pre-wrap text-sm leading-7">
                  {description}
                </p>
                <ServiceAnswerSummary
                  serviceId={service.id}
                  fields={service.fields}
                  answers={sanitizeAnswers(service.id, answers, service.fields)}
                />
                {attachment && (
                  <p className="text-sm">
                    Anexo geral: {attachment} · sem upload
                  </p>
                )}
              </div>
            </Panel>
            <div className="flex flex-wrap gap-3">
              <button className="button-secondary" onClick={() => setStep(2)}>
                Voltar e editar
              </button>
              <button className="button-primary" onClick={open}>
                Abrir chamado demonstrativo <Icon name="check" />
              </button>
            </div>
            <p className="info-note">
              Um único serviço. Nada será enviado ao servidor. Recarregar
              descarta esta simulação.
            </p>
          </div>
        ) : null}
      </MotionRegion>
    </>
  );
}
