/** "Servidor da IA congestionado": marcação compartilhada entre servidor e navegador.
 *  O servidor marca o erro; o navegador reconhece, avisa a pessoa e tenta de novo sozinho. */

export const AI_BUSY_TAG = "[IA_CONGESTIONADA]";

const BUSY_STATUSES = new Set([429, 500, 502, 503, 504]);

export function isBusyStatus(status: number) {
  return BUSY_STATUSES.has(status);
}

export function aiBusyError(status?: number) {
  const err = new Error(
    `${AI_BUSY_TAG} O servidor da IA está congestionado no momento. Tente de novo em alguns instantes.`,
  ) as Error & { status?: number };
  if (status) err.status = status;
  return err;
}

export function isAiBusy(e: unknown) {
  return e instanceof Error && e.message.includes(AI_BUSY_TAG);
}

/** Mensagem pra mostrar na tela (sem a marcação interna). */
export function aiErrorMessage(e: unknown, fallback: string) {
  if (!(e instanceof Error)) return fallback;
  return e.message.replace(AI_BUSY_TAG, "").trim() || fallback;
}

/** Tenta de novo quando a IA está congestionada: espera 5s, depois 10s (até 2 novas tentativas). */
export async function withAiRetry<T>(
  fn: () => Promise<T>,
  onRetry?: (waitSeconds: number, attempt: number) => void,
  retries = 2,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isAiBusy(e) || attempt > retries) throw e;
      const wait = 5 * attempt;
      onRetry?.(wait, attempt);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
}