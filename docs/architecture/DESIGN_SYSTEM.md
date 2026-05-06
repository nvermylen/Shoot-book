# DESIGN SYSTEM
## Lens

> **Purpose**: The single source of truth for UI patterns, design tokens, and visual conventions in Lens. CC references this when building any UI. If a pattern is here, use it exactly. If it isn't, add it after building so the next feature can reuse.
>
> **Relationship to PERSONA_UX.md**: UX covers interaction philosophy and state coverage. This file is the implementation layer — exact Tailwind classes, component code, and composable patterns.

---

## Design Tokens

### Colors

Lens is a tool for working photographers — the visual language is calm, confident, and professional. Not flashy. Not childlike. Restrained palette that lets photography (theirs and their clients') feel premium.

```css
:root {
  /* Backgrounds */
  --color-bg-primary:   #fafaf9;  /* warm white — main canvas */
  --color-bg-secondary: #ffffff;  /* card surfaces */
  --color-bg-tertiary:  #f5f5f4;  /* input fields, hover states */
  --color-bg-elevated:  #ffffff;  /* modals, dropdowns */

  /* Borders */
  --color-border:       #e7e5e4;  /* default border */
  --color-border-focus: #78716c;  /* focused input */
  --color-border-strong:#d6d3d1;  /* emphasized separator */

  /* Text */
  --color-text-primary:   #1c1917; /* main text */
  --color-text-secondary: #57534e; /* supporting */
  --color-text-muted:     #a8a29e; /* labels, metadata */
  --color-text-disabled:  #d6d3d1;

  /* Accent (Lens — desaturated indigo) */
  --color-accent:       #4f46e5;
  --color-accent-hover: #4338ca;
  --color-accent-muted: rgba(79, 70, 229, 0.1);

  /* Semantic */
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-danger:  #dc2626;
  --color-info:    #0284c7;
}
```

### Tailwind reference

Lens uses Tailwind with the standard color scale. Map tokens to classes:

| Token | Background | Text | Border |
|-------|-----------|------|--------|
| Primary BG | `bg-stone-50` | — | — |
| Secondary BG | `bg-white` | — | — |
| Tertiary BG | `bg-stone-100` | — | — |
| Text primary | — | `text-stone-900` | — |
| Text secondary | — | `text-stone-600` | — |
| Text muted | — | `text-stone-400` | — |
| Border | — | — | `border-stone-200` |
| Border focus | — | — | `border-stone-500` |
| Accent | `bg-indigo-600` | `text-indigo-600` | `border-indigo-600` |
| Accent hover | `bg-indigo-700` | — | — |
| Success | `bg-green-50` | `text-green-700` | `border-green-200` |
| Warning | `bg-amber-50` | `text-amber-700` | `border-amber-200` |
| Danger | `bg-red-50` | `text-red-700` | `border-red-200` |
| Info | `bg-sky-50` | `text-sky-700` | `border-sky-200` |

### Typography

```typescript
// In layout.tsx
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
});
```

| Role | Classes | Use |
|------|---------|-----|
| Page title | `text-2xl font-semibold tracking-tight text-stone-900` | H1 |
| Section header | `text-lg font-medium text-stone-900` | H2 |
| Card title | `text-sm font-medium text-stone-900` | Card/panel headers |
| Body | `text-sm text-stone-700` | Default content |
| Supporting | `text-sm text-stone-500` | Descriptions |
| Label / meta | `text-xs text-stone-500 uppercase tracking-wider font-medium` | Field labels, timestamps |
| Data (large) | `text-3xl font-mono font-semibold text-stone-900` | Key metrics |
| Data (medium) | `text-xl font-mono text-stone-900` | Secondary metrics |
| Data (small) | `text-sm font-mono text-stone-700` | Inline data |
| Code | `text-xs font-mono bg-stone-100 px-1.5 py-0.5 rounded` | Inline code |

---

## Core Components

### Page layout

```typescript
export function PageLayout({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50">
      <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-stone-200 px-6 py-3">
        {/* nav contents */}
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
          {action}
        </div>
        {children}
      </main>
    </div>
  );
}
```

### Card

```typescript
interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}

const paddingMap = { sm: 'p-3', md: 'p-4', lg: 'p-6' };

export function Card({ children, className = '', padding = 'md' }: CardProps) {
  return (
    <div className={`bg-white border border-stone-200 rounded-lg ${paddingMap[padding]} ${className}`}>
      {children}
    </div>
  );
}
```

### Booking card (Lens-canonical)

```typescript
import { Phone, Mail, MessageSquare } from 'lucide-react';
import { Badge } from './Badge';

export function BookingCard({ booking }: { booking: BookingWithClient }) {
  return (
    <Card className="hover:border-stone-300 transition-colors" data-testid={`booking-card-${booking.id}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-base font-medium text-stone-900">{booking.client.display_name}</h3>
          <p className="text-sm text-stone-500 mt-0.5">{formatSessionDate(booking.session_date)}</p>
        </div>
        <Badge label={booking.package.name} variant="neutral" />
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <Badge dot label="Paid" variant={booking.paid ? 'success' : 'warning'} />
        <Badge dot label="Locations" variant={booking.locations_set ? 'success' : 'warning'} />
        <Badge dot label="Contract" variant={booking.contract_signed ? 'success' : 'warning'} />
        <Badge dot label="Style guide" variant={booking.style_guide_sent ? 'success' : 'neutral'} />
      </div>

      <div className="flex gap-2 pt-3 border-t border-stone-100">
        <a href={`tel:${booking.client.phone}`} className="flex items-center gap-1.5 text-xs text-stone-600 hover:text-stone-900" data-testid={`booking-${booking.id}-call`}>
          <Phone className="w-3.5 h-3.5" /> Call
        </a>
        <a href={`sms:${booking.client.phone}`} className="flex items-center gap-1.5 text-xs text-stone-600 hover:text-stone-900" data-testid={`booking-${booking.id}-text`}>
          <MessageSquare className="w-3.5 h-3.5" /> Text
        </a>
        <a href={`mailto:${booking.client.email}`} className="flex items-center gap-1.5 text-xs text-stone-600 hover:text-stone-900" data-testid={`booking-${booking.id}-email`}>
          <Mail className="w-3.5 h-3.5" /> Email
        </a>
      </div>
    </Card>
  );
}
```

### Status Badge

```typescript
type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const variantClasses: Record<StatusVariant, string> = {
  success: 'text-green-700 bg-green-50 border-green-200',
  warning: 'text-amber-700 bg-amber-50 border-amber-200',
  danger:  'text-red-700  bg-red-50  border-red-200',
  info:    'text-sky-700  bg-sky-50  border-sky-200',
  neutral: 'text-stone-700 bg-stone-50 border-stone-200',
};

export function Badge({
  label, variant = 'neutral', dot = false
}: { label: string; variant?: StatusVariant; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border ${variantClasses[variant]}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}
```

### Button

```typescript
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary:   'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent',
  secondary: 'bg-white hover:bg-stone-50 text-stone-700 border-stone-300',
  ghost:     'bg-transparent hover:bg-stone-100 text-stone-600 hover:text-stone-900 border-transparent',
  danger:    'bg-white hover:bg-red-50 text-red-600 border-red-200',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
  'data-testid'?: string;
}

export function Button({
  children, variant = 'primary', size = 'md',
  disabled, loading, onClick, className = '',
  'data-testid': testId,
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      data-testid={testId}
      className={`
        inline-flex items-center gap-2 font-medium rounded-md border
        transition-colors duration-150
        focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:ring-offset-1
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variantClasses[variant]} ${sizeClasses[size]} ${className}
      `}
    >
      {loading && <Spinner className="w-3 h-3" />}
      {children}
    </button>
  );
}
```

### Form input

```typescript
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export function Input({
  label, error, hint, required,
  ...props
}: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs text-stone-500 uppercase tracking-wider font-medium">
          {label}{required && <span className="text-red-600 ml-1">*</span>}
        </label>
      )}
      <input
        className={`
          w-full px-3 py-2 text-sm text-stone-900
          bg-white border rounded-md
          focus:outline-none focus:ring-2 focus:ring-indigo-500/40
          placeholder:text-stone-400
          transition-colors
          ${error ? 'border-red-300 focus:border-red-500' : 'border-stone-300 focus:border-stone-500'}
        `}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hint && !error && <p className="text-xs text-stone-500">{hint}</p>}
    </div>
  );
}
```

### State components (loading / empty / error)

```typescript
export function SkeletonCard() {
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-stone-200 rounded w-1/2" />
        <div className="h-3 bg-stone-100 rounded w-1/3" />
        <div className="h-3 bg-stone-100 rounded w-2/3" />
      </div>
    </div>
  );
}

export function EmptyState({ message, cta, onCta }: { message: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="text-center py-12 px-4" data-testid="empty-state">
      <p className="text-sm text-stone-500 mb-4">{message}</p>
      {cta && <Button onClick={onCta} data-testid="empty-state-cta">{cta}</Button>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-center py-12 px-4" data-testid="error-state">
      <p className="text-sm text-red-600 mb-4">{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry} data-testid="error-state-retry">Try again</Button>}
    </div>
  );
}
```

### Modal (mobile-aware: bottom sheet on mobile)

```typescript
export function Modal({
  open, onClose, title, children, size = 'md'
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  if (!open) return null;
  const sizeClasses = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };

  return (
    <div className="fixed inset-0 z-50 flex sm:items-center items-end justify-center p-0 sm:p-4" data-testid="modal-overlay">
      <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${sizeClasses[size]} bg-white border border-stone-200 rounded-t-2xl sm:rounded-xl shadow-xl`} data-testid="modal-content">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="text-base font-medium text-stone-900">{title}</h2>
          <button onClick={onClose} data-testid="modal-close-btn" className="p-1 rounded-md text-stone-500 hover:text-stone-900 hover:bg-stone-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
```

### Toast

```typescript
// Use a single library — sonner is recommended.
toast.success('Booking saved.');                       // past tense, no exclamation
toast.error('Couldn\'t save the booking. Try again.'); // actionable
toast.info('Reconnecting Gmail…');
toast.warning('Stripe webhook missed. Reconciling…');
```

Duration: 3000ms success/info, 5000ms error/warning. Position: bottom-right (desktop), bottom-center (mobile).

---

## Grid layouts

```typescript
// Dashboard: 4-col responsive
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

// Bookings list: 1-col mobile, 2-col tablet+
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">

// Sidebar + main
<div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
```

---

## Animation conventions

```typescript
'animate-pulse'                                 // skeleton loading
'animate-in fade-in duration-200'               // page/modal appear
'animate-in slide-in-from-bottom duration-300'  // mobile bottom sheet
'transition-colors duration-150'                // hover transitions
'transition-all duration-200'                   // layout (use sparingly)
```

No animation for: data updates, form validation errors (instant feedback preferred).

---

## Icons

**Library:** `lucide-react`.
**Standard size:** `w-4 h-4` (16px) inline; `w-5 h-5` (20px) standalone.
**Color:** `text-stone-500` default; semantic when meaningful.

Canonical icon mapping:

| Concept | Icon |
|---------|------|
| Add / Create | `Plus` |
| Edit | `Pencil` |
| Delete | `Trash2` |
| Close | `X` |
| Search | `Search` |
| Filter | `Filter` |
| Settings | `Settings` |
| Phone | `Phone` |
| Email | `Mail` |
| Text/SMS | `MessageSquare` |
| Calendar | `Calendar` |
| Camera / Session | `Camera` |
| Image / Gallery | `Image` |
| Money / Invoice | `Receipt` |
| Payment | `CreditCard` |
| Location | `MapPin` |
| External link | `ExternalLink` |
| Check / Done | `CheckCircle2` |
| Warning | `AlertTriangle` |
| Error | `AlertCircle` |
| Info | `Info` |
| Loading spinner | `Loader2` (with `animate-spin`) |

---

## Cross-References

| Concern | Lives in |
|---------|----------|
| State patterns and interaction philosophy | `docs/personas/PERSONA_UX.md` |
| Component file structure and `data-testid` naming | `docs/personas/PERSONA_DEV.md` |
| UI anti-patterns | `ANTI_PATTERNS.md` |

---

*Lens | Design System | Last updated: 2026-05-04*
