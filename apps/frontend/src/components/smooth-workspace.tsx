import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { useMotionPreference } from '../hooks/use-motion-preference';
import { cancelScrollNavigation, scrollToContent } from '../lib/motion';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
export function SmoothWorkspace({ children }: { children: ReactNode }) {
  const wrapper = useRef<HTMLDivElement>(null),
    content = useRef<HTMLDivElement>(null);
  const { reduced } = useMotionPreference();
  useLayoutEffect(() => {
    const viewport = wrapper.current,
      root = content.current;
    if (!viewport || !root) return;
    const media = gsap.matchMedia();
    const interruptKeys = (event: KeyboardEvent) => {
      if (
        [
          'ArrowDown',
          'ArrowUp',
          'PageDown',
          'PageUp',
          'Home',
          'End',
          ' ',
        ].includes(event.key)
      )
        cancelScrollNavigation();
    };
    window.addEventListener('wheel', cancelScrollNavigation, { passive: true });
    window.addEventListener('touchstart', cancelScrollNavigation, {
      passive: true,
    });
    window.addEventListener('keydown', interruptKeys);
    media.add(
      '(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
      () => {
        const smoother = ScrollSmoother.create({
          wrapper: viewport,
          content: root,
          smooth: 0.95,
          smoothTouch: false,
          effects: false,
          normalizeScroll: false,
          onFocusIn: (_self, event) =>
            event.target instanceof Element && event.target.closest('dialog')
              ? false
              : undefined,
          onUpdate: (self) => {
            root.dataset.scrollRendered = String(Math.round(self.scrollTop()));
            root.dataset.scrollNative = String(Math.round(window.scrollY));
          },
        });
        viewport.dataset.scrollEngine = 'ScrollSmoother';
        const syncModal = () =>
          smoother.paused(!!document.querySelector('dialog[open]'));
        const modals = new MutationObserver((records) => {
          if (
            records.some(
              (record) =>
                record.type === 'attributes' ||
                [...record.addedNodes, ...record.removedNodes].some(
                  (node) =>
                    node instanceof Element &&
                    (node.matches('dialog') || node.querySelector('dialog')),
                ),
            )
          )
            syncModal();
        });
        modals.observe(document.body, {
          attributes: true,
          attributeFilter: ['open'],
          childList: true,
          subtree: true,
        });
        return () => {
          modals.disconnect();
          smoother.kill();
          viewport.dataset.scrollEngine = 'native';
        };
      },
    );
    viewport.dataset.scrollEngine ||= 'native';
    const contexts = new Map<HTMLElement, gsap.Context>();
    let frame = 0,
      refreshTimer = 0;
    const refresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 140);
    };
    const scan = () => {
      for (const [element, context] of contexts) {
        if (!root.contains(element)) {
          context.revert();
          contexts.delete(element);
        }
      }
      if (!reduced) {
        const elements = root.querySelectorAll<HTMLElement>(
          '.panel, .selection-card, .time-examples, .project-overview, [data-scroll-section]',
        );
        for (const element of elements) {
          if (
            contexts.has(element) ||
            (!element.hasAttribute('data-scroll-section') &&
              element.parentElement?.closest(
                '.panel, .selection-card, .form-section',
              ))
          )
            continue;
          const context = gsap.context(() => {
            gsap.fromTo(
              element,
              { y: 24, opacity: 0.5 },
              {
                y: 0,
                opacity: 1,
                duration: 0.65,
                ease: 'power2.out',
                clearProps: 'transform,opacity',
                scrollTrigger: {
                  trigger: element,
                  start: 'top 94%',
                  once: true,
                },
                onStart: () => {
                  element.dataset.scrollReveal = 'running';
                  element
                    .querySelector('.chart-canvas')
                    ?.dispatchEvent(new Event('helpdesk:chart-reveal'));
                },
                onComplete: () => {
                  element.dataset.scrollReveal = 'complete';
                },
              },
            );
          }, element);
          contexts.set(element, context);
        }
      }
      refresh();
    };
    const scheduleScan = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    };
    const changes = new MutationObserver((records) => {
      if (
        records.some((r) =>
          [...r.addedNodes, ...r.removedNodes].some(
            (n) => n instanceof HTMLElement,
          ),
        )
      )
        scheduleScan();
    });
    changes.observe(root, { childList: true, subtree: true });
    const resize = new ResizeObserver(refresh);
    resize.observe(root);
    scheduleScan();
    const anchors = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>(
        'a[href^="#"]',
      );
      const hash = link?.getAttribute('href');
      if (!hash || hash.startsWith('#/') || hash === '#') return;
      const target = document.getElementById(hash.slice(1));
      if (target) {
        event.preventDefault();
        scrollToContent(target, true);
      }
    };
    root.addEventListener('click', anchors);
    return () => {
      window.removeEventListener('wheel', cancelScrollNavigation);
      window.removeEventListener('touchstart', cancelScrollNavigation);
      window.removeEventListener('keydown', interruptKeys);
      cancelAnimationFrame(frame);
      clearTimeout(refreshTimer);
      changes.disconnect();
      resize.disconnect();
      root.removeEventListener('click', anchors);
      contexts.forEach((context) => context.revert());
      media.revert();
    };
  }, [reduced]);
  return (
    <div ref={wrapper} id="smooth-wrapper">
      <div ref={content} id="smooth-content">
        <div className="workspace-body">{children}</div>
      </div>
    </div>
  );
}
