# Spec: Input and Card (M2)

## Input
Purpose: one text field for sign up, login, contribution amount, phone, and later forms.

| Item | Rule |
|------|------|
| Label | Always a real `<label for>`. Visible, floats up on focus or when filled. Never a placeholder substitute |
| Height and type | 56 px tall (above the 44 px minimum), 16 px text so iOS does not zoom |
| Shape | Pill, 1 px `border` token (3:1), 2 px focus ring |
| Prefix | `prefix` slot, for example "+234". Label stays floated when a prefix exists |
| Trailing | `trailing` slot, for example a show password button |
| Hint | Muted text under the field, linked with `aria-describedby` |
| Error | Icon plus text under the field, error colored border, `aria-invalid`, linked with `aria-describedby`, announced politely when it changes. Text says what is wrong and how to fix it |
| Disabled | Native `disabled`, reduced opacity |
| Autofill | Label floats for browser autofilled values |
| Reduced motion | Label moves without animation (global safety net) |

States: empty, focus, filled, hover, error, disabled, with prefix, with trailing.

Tests: label association, floating hook (placeholder space), error and hint wiring, error announcement, disabled, prefix and trailing render, onChange, ref and attribute pass through.

## Card
A surface for grouping. `tone="surface"` white with hairline and soft shadow, `tone="ink"` black hero card (uses `data-surface="ink"`). `padding` md or lg. Renders `div`, `section` or `article`. No animation.
