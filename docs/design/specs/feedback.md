# Spec: Alert, Skeleton, Toast (M2b)

Shared rule: status is never color alone. Every tone has its own icon shape and a text title or message.

## Tones
`info`, `success`, `pending`, `warning`, `error`. Each maps to the frozen status tokens (`info` uses the single accent tinted, so there is still one accent hue).

## Alert (inline, stays on the page)
| Item | Rule |
|------|------|
| Content | Optional `title`, body text. Error text says what happened and what to do, and whether money moved where it applies |
| Announcement | `error` uses `role="alert"`, the other tones `role="status"` |
| Dismiss | Optional `onDismiss` shows a 44 px close button |
| Motion | None |

## Skeleton (placeholder while loading)
| Item | Rule |
|------|------|
| Shapes | `line`, `block`, `circle`, sized by props |
| Visibility | Decorative, `aria-hidden` |
| Group | `SkeletonGroup` appears only after 300 ms, so fast loads never flash it, then announces its `label` once |
| Motion | Slow opacity pulse (compositor only, no gradients). Static with reduced motion |

## Toast (temporary message, anywhere in the app)
| Item | Rule |
|------|------|
| API | `ToastProvider` once in the app shell, `useToast()` returns `show(options)` and `dismiss(id)` |
| Duration | 5 s default. Errors stay until dismissed, because a failed payment message must not vanish |
| Pause | Hover or keyboard focus pauses the timer, leaving resumes with the time that was left |
| Limit | 3 visible, the rest wait their turn (their timers start when shown) |
| Announcement | Region `aria-label="Notifications"`, polite. Error toasts use `role="alert"` |
| Controls | Close button (44 px), optional one action button |
| Motion | Slide up and fade in, fade out. Reduced motion removes movement (global safety net) |
| Position | Bottom center, above the safe area. `--toast-offset-bottom` lets the app shell lift it above a tab bar |
| Not in M2 | Swipe to dismiss (needs the `motion` library, planned with the gesture work) |
