import { focusFirstError } from '../lib/motion';
import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { DemoProject, ProgressDraft } from '../types/project-demo';
import type { Role } from '../types/demo';
import { validateProgress } from '../mocks/projects';
import { date } from '../lib/presentation';
import { useMotionPreference } from '../hooks/use-motion-preference';
import { AnimatedNumber } from './animated-number';
import { DemoDialog } from './demo-dialog';
import { Panel } from './ui';
export function ProgressBar({ value }: { value: number }) {
  const fill = useRef<HTMLDivElement>(null),
    { reduced } = useMotionPreference();
  useGSAP(
    () => {
      gsap.fromTo(
        fill.current,
        { width: 0 },
        { width: `${value}%`, duration: reduced ? 0 : 0.9, ease: 'power2.out' },
      );
    },
    { scope: fill, dependencies: [value, reduced], revertOnUpdate: true },
  );
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label="Andamento demonstrativo"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <div ref={fill} className="progress-fill" />
    </div>
  );
}
export function ProjectProgress({
  project,
  role,
  onUpdate,
}: {
  project: DemoProject;
  role: Role;
  onUpdate: (draft: ProgressDraft) => boolean;
}) {
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState(String(project.progress)),
    [note, setNote] = useState(''),
    [error, setError] = useState('');
  return (
    <Panel
      title="Andamento do projeto"
      subtitle="Percentual manual demonstrativo · não representa aprovação ou prazo"
    >
      <div className="form-body">
        <div className="progress-heading">
          <strong>
            <AnimatedNumber value={project.progress} suffix="%" />
          </strong>
          <span>
            {project.progress === 100
              ? 'Percentual completo na amostra'
              : 'Em acompanhamento demonstrativo'}
          </span>
        </div>
        <ProgressBar value={project.progress} />
        <p className="text-xs leading-6 text-slate-500">
          Estimativa informada manualmente. O critério definitivo poderá usar
          entregas ou marcos ponderados. Última atualização:{' '}
          {date(project.progressHistory.at(-1)?.at ?? project.createdAt)}.
        </p>
        {role === 'admin' && (
          <button
            className="button-secondary"
            onClick={() => {
              setValue(String(project.progress));
              setNote('');
              setError('');
              setEditing(true);
            }}
          >
            Atualizar progresso
          </button>
        )}
        <ol className="progress-history">
          {project.progressHistory.map((update) => (
            <li key={update.id}>
              <strong>
                {update.from}% → {update.to}%
              </strong>
              <span>
                {date(update.at)} · {update.by}
              </span>
              <p>{update.note}</p>
            </li>
          ))}
        </ol>
        {!project.progressHistory.length && (
          <p className="text-sm text-slate-500">
            Nenhuma atualização registrada na sessão.
          </p>
        )}
      </div>
      {editing && (
        <DemoDialog
          title="Atualizar andamento"
          description="Esta alteração fica somente em memória e não aprova o projeto."
          confirmLabel="Confirmar atualização simulada"
          onCancel={() => setEditing(false)}
          onConfirm={() => {
            const problem = validateProgress(Number(value), note);
            if (problem || !value.trim()) {
              setError(problem || 'Informe o percentual.');
              window.requestAnimationFrame(() =>
                focusFirstError(document.querySelector('dialog[open]')),
              );
              return false;
            }
            return onUpdate({ id: project.id, value: Number(value), note });
          }}
        >
          <label className="form-label">
            Percentual de conclusão *
            <input
              className="field"
              type="number"
              required
              min={0}
              max={100}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={
                !!error &&
                (!value.trim() ||
                  !Number.isInteger(Number(value)) ||
                  Number(value) < 0 ||
                  Number(value) > 100)
              }
            />
          </label>
          <label className="form-label">
            Observações do progresso *
            <textarea
              className="field"
              maxLength={1500}
              value={note}
              required
              aria-invalid={!!error && !note.trim()}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </DemoDialog>
      )}
    </Panel>
  );
}
