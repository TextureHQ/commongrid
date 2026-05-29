# CommonGrid UI Component Library

A collection of composable, responsive UI components built with **Tailwind utilities** and **Edges tokens**. All components are TypeScript-typed and mobile-first responsive.

## 🎯 Design Philosophy

1. **Pure Tailwind utilities** — No custom CSS files (except `globals.css`)
2. **Edges tokens for theming** — Uses `--color-*`, `--space-*`, etc.
3. **Composable by default** — Build pages by composing small components
4. **Use Edges atoms** — Button, TextField, etc. for interactive elements
5. **Mobile-first responsive** — Test at 375px, 768px, 1440px

---

## 📦 Components

### Layout Components (`components/ui/layout/`)

#### `PageShell`
Max-width container (960px) with responsive padding.

```tsx
import { PageShell } from "@/components/ui";

<PageShell>
  <PageHeader title="My Page" />
  <Section>Content here</Section>
</PageShell>
```

**Props:**
- `children: ReactNode` — Content
- `className?: string` — Additional classes

---

#### `PageHeader`
Flexible header with breadcrumbs, title, subtitle, and actions.

```tsx
import { PageHeader } from "@/components/ui";

<PageHeader
  breadcrumbs={[
    { label: "Home", href: "/" },
    { label: "About" }
  ]}
  title="About CommonGrid"
  subtitle="The energy industry's shared infrastructure record."
  actions={<Button>Create Account</Button>}
/>
```

**Props:**
- `title: string` — Page title (required)
- `subtitle?: string` — Description below title
- `breadcrumbs?: Array<{ label: string; href?: string }>` — Breadcrumb trail
- `actions?: ReactNode` — Right-side actions (buttons, etc.)

---

#### `Section`
Consistent section spacing wrapper with optional heading.

```tsx
import { Section } from "@/components/ui";

<Section heading="Data Sources">
  <p>Content here...</p>
</Section>
```

**Props:**
- `children: ReactNode` — Content
- `heading?: string` — Section heading
- `className?: string` — Additional classes

---

### Data Display Components (`components/ui/data/`)

#### `StatGrid` / `StatItem`
Responsive grid for displaying metrics.

```tsx
import { StatGrid, StatItem } from "@/components/ui";

<StatGrid columns={3}>
  <StatItem value="1,234" label="Utilities" />
  <StatItem value="67" label="Grid Operators" />
  <StatItem value="12,345" label="Power Plants" />
</StatGrid>
```

**StatGrid Props:**
- `children: ReactNode` — StatItem components
- `columns?: 2 | 3 | 4 | 5 | 6` — Number of columns (default: 3)
- `className?: string` — Additional classes

**StatItem Props:**
- `value: ReactNode` — Metric value (supports Skeleton for loading)
- `label: string` — Metric label
- `icon?: ReactNode` — Optional icon/decoration

**Loading states:** Pass `<Skeleton>` as the `value` for loading states.

---

#### `KeyValueTable`
Bordered table for field lists (commonly used on detail pages).

```tsx
import { KeyValueTable } from "@/components/ui";

<KeyValueTable
  rows={[
    { key: "EIA ID", value: "12345" },
    { key: "Type", value: "Investor-Owned" },
    { key: "State", value: "California" },
  ]}
/>
```

**Props:**
- `rows: Array<{ key: string; value: ReactNode }>` — Key-value pairs
- `className?: string` — Additional classes

---

#### `DefinitionList`
Formatted definition list for term-description pairs.

```tsx
import { DefinitionList } from "@/components/ui";

<DefinitionList
  items={[
    { term: "EIA-860", description: "Annual Electric Generator Report" },
    { term: "HIFLD", description: "Homeland Infrastructure Foundation" },
  ]}
/>
```

**Props:**
- `items: Array<{ term: string; description: ReactNode }>` — Definitions
- `className?: string` — Additional classes

---

## 🛠️ Usage Patterns

### Basic Page Structure

```tsx
import { PageShell, PageHeader, Section } from "@/components/ui";
import { Button } from "@texturehq/edges";

export default function MyPage() {
  return (
    <PageShell>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "My Page" }]}
        title="Page Title"
        subtitle="Description of the page"
        actions={<Button>Primary Action</Button>}
      />
      
      <Section heading="Main Content">
        <p>Your content here...</p>
      </Section>
    </PageShell>
  );
}
```

### Data-Heavy Page

```tsx
import { PageShell, PageHeader, Section, StatGrid, StatItem, KeyValueTable } from "@/components/ui";

export default function EntityDetailPage({ entity }) {
  return (
    <PageShell>
      <PageHeader
        title={entity.name}
        subtitle={entity.description}
      />
      
      <Section heading="Metrics">
        <StatGrid columns={4}>
          <StatItem value={entity.count1} label="Metric 1" />
          <StatItem value={entity.count2} label="Metric 2" />
          <StatItem value={entity.count3} label="Metric 3" />
          <StatItem value={entity.count4} label="Metric 4" />
        </StatGrid>
      </Section>
      
      <Section heading="Details">
        <KeyValueTable
          rows={[
            { key: "ID", value: entity.id },
            { key: "Type", value: entity.type },
            { key: "Region", value: entity.region },
          ]}
        />
      </Section>
    </PageShell>
  );
}
```

---

## 🎨 Styling Guidelines

### 1. Use Tailwind Utilities Only

❌ **Don't:**
```tsx
// Custom CSS class
<div className="my-custom-class">
```

✅ **Do:**
```tsx
// Tailwind utilities
<div className="flex items-center gap-3 px-4 py-2">
```

### 2. Use Edges Tokens for Colors

❌ **Don't:**
```tsx
// Hard-coded colors
<div className="text-gray-600 bg-blue-50">
```

✅ **Do:**
```tsx
// Edges tokens
<div className="text-text-muted bg-background-surface">
```

### 3. Compose, Don't Extend

❌ **Don't:**
```tsx
// Creating custom wrapper components without reason
<CustomPageWrapper>
  <CustomHeader />
</CustomPageWrapper>
```

✅ **Do:**
```tsx
// Use existing components
<PageShell>
  <PageHeader title="..." />
  <Section>...</Section>
</PageShell>
```

### 4. Use Edges Atoms for Interactive Elements

✅ **Do:**
```tsx
import { Button, TextField, Select } from "@texturehq/edges";

<Button variant="primary">Submit</Button>
<TextField label="Name" />
<Select options={[...]} />
```

---

## 📱 Responsive Behavior

All components are mobile-first responsive. Test at these breakpoints:

- **375px** — Mobile
- **768px** — Tablet (sm:)
- **1440px** — Desktop (lg:, xl:)

Common responsive patterns:
- `PageHeader` — Stacks title and actions on mobile
- `StatGrid` — 1 column mobile → 2-3 columns tablet → 3-6 columns desktop
- `PageShell` — Padding scales from 20px (mobile) to 56px (desktop)

---

## 🔍 Live Examples

Visit `/components` in the running app to see live examples of every component with interactive code snippets.

---

## 📚 Additional Resources

- **Edges Design System:** `.claude/edges.md` in repo
- **Tailwind Config:** `tailwind.config.ts`
- **Edges Tokens:** `app/globals.css` (imported from `@texturehq/edges-tokens`)
