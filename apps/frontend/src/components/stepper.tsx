export function Stepper({
  steps,
  current,
  onStep,
}: {
  steps: string[];
  current: number;
  onStep: (step: number) => void;
}) {
  return (
    <nav className="wizard-steps" aria-label="Etapas da solicitação">
      {steps.map((label, index) => (
        <button
          key={label}
          type="button"
          disabled={index > current}
          onClick={() => onStep(index)}
          aria-current={index === current ? 'step' : undefined}
          className={
            index === current
              ? 'step-current'
              : index < current
                ? 'step-complete'
                : ''
          }
        >
          <span>
            {index < current ? '✓' : String(index + 1).padStart(2, '0')}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
