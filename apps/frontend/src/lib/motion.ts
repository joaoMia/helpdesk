import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { ScrollSmoother } from 'gsap/ScrollSmoother';

gsap.registerPlugin(ScrollToPlugin);
export const motionQuery = '(prefers-reduced-motion: reduce)';
// Ignore legacy app flags: only the operating system preference controls motion.
export function motionReduced(system: boolean, _legacyManual = false) {
  return system;
}
export function readReducedMotion() {
  return window.matchMedia(motionQuery).matches;
}
let navigation: gsap.core.Tween | undefined;
export function cancelScrollNavigation() {
  navigation?.kill();
}
export function resetPageScroll() {
  cancelScrollNavigation();
  ScrollSmoother.get()?.scrollTop(0);
  window.scrollTo({ top: 0, behavior: 'instant' });
}
export function scrollToContent(element: HTMLElement | null, focus = false) {
  if (!element) return;
  navigation?.kill();
  if (focus) element.focus({ preventScroll: true });
  const dialog = element.closest<HTMLDialogElement>('dialog[open]');
  const smoother = ScrollSmoother.get();
  const reduced = readReducedMotion();
  if (smoother && !dialog && smoother.content().contains(element)) {
    const top = Math.max(0, smoother.offset(element, 'top 96px'));
    if (reduced) smoother.scrollTop(top);
    else
      navigation = gsap.to(smoother, {
        scrollTop: top,
        duration: 0.85,
        ease: 'power2.inOut',
        overwrite: 'auto',
      });
  } else {
    navigation = gsap.to(dialog ?? window, {
      scrollTo: { y: element, offsetY: dialog ? 24 : 96, autoKill: true },
      duration: reduced ? 0 : 0.7,
      ease: 'power2.inOut',
      overwrite: 'auto',
    });
  }
}
export function focusFirstError(container: HTMLElement | null) {
  const field = container?.querySelector<HTMLElement>(
    '[aria-invalid="true"], input:invalid, select:invalid, textarea:invalid',
  );
  const focusable =
    field?.tagName === 'FIELDSET'
      ? field.querySelector<HTMLElement>('input, select, textarea')
      : field;
  scrollToContent(focusable ?? null, true);
}
