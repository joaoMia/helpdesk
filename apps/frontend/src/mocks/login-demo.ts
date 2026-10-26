// Laboratório visual: nenhuma credencial é comparada ou persistida.
export type LoginScenario = 'success' | 'incorrect' | 'not-found' | 'loading';
export function validateDemoLogin(
  identifier: string,
  passwordPresent: boolean,
) {
  const errors: Record<string, string> = {};
  if (!identifier.trim())
    errors.identifier =
      'Informe um e-mail fictício ou identificador de demonstração.';
  else if (
    identifier.includes('@') &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim())
  )
    errors.identifier =
      'Informe um e-mail válido ou use um identificador sem @.';
  if (!passwordPresent)
    errors.password =
      'Preencha uma senha fictícia, somente para testar a interface.';
  return errors;
}
export function loginScenarioError(scenario: LoginScenario) {
  return scenario === 'incorrect'
    ? 'Cenário simulado: credenciais incorretas. Nenhuma senha foi validada.'
    : scenario === 'not-found'
      ? 'Cenário simulado: conta não encontrada no conjunto fictício. Não foi feita consulta de contas.'
      : '';
}
