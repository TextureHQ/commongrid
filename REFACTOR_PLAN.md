# Tailwind Refactor Plan

## ✅ Completed

### 1. CommonGrid Semantic Color Tokens
- Defined in `app/globals.css` as CSS variables (--color-cg-*)
- Categories: utilities, ISOs, fuel types, EV levels, programs, statuses
- Light and dark mode variants included
- **Wired to Tailwind via `@theme` block** → enables utilities like:
  - `text-cg-utility-iou`
  - `bg-cg-iso-caiso`
  - `border-cg-fuel-solar`

### 2. Typography System
- Imported `@texturehq/edges/responsive-typography.css` in globals.css
- Provides responsive typography scale (text-xs through text-9xl)
- Scales down on mobile for readability

### 3. Nav/Drawer/User Menu
- Kept in globals.css (complex layouts with animations warrant dedicated CSS)
- These are framework-level components, not page-specific styling

## 📋 TODO: Convert Custom Page CSS

### Scope
- `app/(shell)/homepage.css` - 899 lines
- `app/(shell)/detail-page.css` - 642 lines
- `app/(shell)/about/about.css` - 247 lines
- **Total: ~1800 lines of custom CSS**

### Conversion Strategy

#### What to Convert to Tailwind Utilities:
1. **Simple layout patterns** - flex, grid, padding, margins, gaps
2. **Typography** - use `text-*`, `font-*`, `leading-*`, `tracking-*`
3. **Colors** - use edges tokens (`text-[--color-text-heading]`) or CG tokens (`text-cg-iso-caiso`)
4. **Spacing** - use Tailwind's spacing scale (p-4, m-8, gap-6, etc.)
5. **Borders & radius** - `border`, `rounded-*`
6. **Responsive breakpoints** - `md:`, `lg:` prefixes

#### What to Keep as Custom CSS:
1. **Complex animations** (keyframes that Tailwind doesn't cover)
2. **CSS custom properties for theming** (--font-family-brand, --cg-section-y)
3. **Truly unique one-off patterns** that would be ugly as utility soup
4. **Grid areas with named lines** (if any)

### Example Conversion

**Before (homepage.css):**
```css
.cg-home .hero {
  padding: clamp(40px,6vw,88px) 0 clamp(32px,5vw,56px);
}
.cg-home .hero-grid {
  display: grid;
  grid-template-columns: minmax(0,1fr) minmax(0,1.05fr);
  gap: clamp(32px,5vw,64px);
  align-items: center;
}
.cg-home .hero-h1 {
  font-family: var(--font-family-brand);
  font-weight: 500;
  font-size: clamp(36px,5.4vw,64px);
  line-height: 1.05;
  letter-spacing: -.04em;
  margin: 16px 0 24px;
  max-width: 17ch;
  color: var(--color-text-heading);
  text-wrap: balance;
}
```

**After (JSX with Tailwind):**
```tsx
<header className="py-10 md:py-[clamp(40px,6vw,88px)] md:pb-[clamp(32px,5vw,56px)]">
  <div className="max-w-screen-xl mx-auto px-[clamp(20px,4vw,56px)]">
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-8 md:gap-[clamp(32px,5vw,64px)] items-center">
      <div>
        {/* ... */}
        <h1 className="font-['Rethink_Sans'] font-medium text-[clamp(36px,5.4vw,64px)] leading-[1.05] tracking-[-0.04em] my-6 max-w-[17ch] text-[--color-text-heading]" style={{textWrap: 'balance'}}>
          The open registry of U.S. energy infrastructure.
        </h1>
      </div>
    </div>
  </div>
</header>
```

**Observations:**
- Some clamp() values still need arbitrary values `[clamp(...)]`
- CSS custom properties referenced via `text-[--color-text-heading]`
- Font families need arbitrary values or Tailwind config extension
- Some CSS properties like `text-wrap: balance` need inline styles (not yet in Tailwind)

### Alternative Approach: Hybrid

Instead of converting ALL CSS to inline utilities, we could:
1. Keep **semantic component classes** (.hero, .hero-h1, .entity-card)
2. Rewrite their **definitions** to use Tailwind's `@apply` directive
3. Or keep them as CSS but use Tailwind custom properties

**Example with @apply:**
```css
.hero-h1 {
  @apply font-['Rethink_Sans'] font-medium leading-tight tracking-tight my-6 max-w-[17ch];
  font-size: clamp(36px, 5.4vw, 64px);
  letter-spacing: -0.04em;
  line-height: 1.05;
  color: var(--color-text-heading);
  text-wrap: balance;
}
```

This keeps markup readable while leveraging Tailwind's design system.

## Questions for Nick

1. **Conversion depth**: Full inline utilities everywhere, or hybrid with semantic classes?
2. **Custom properties**: Keep font-family/spacing tokens as CSS vars, or wire everything to Tailwind config?
3. **Priorities**: Homepage first, then detail pages, then about? Or all at once?
4. **Timeline**: This is ~2-3 days of careful work. Ship incrementally or one big PR?

## Next Steps

1. Get Nick's feedback on approach
2. Convert homepage.css → Tailwind utilities (or hybrid)
3. Convert detail-page.css
4. Convert about.css
5. Delete CSS files when components are fully converted
6. Test visual regression (before/after screenshots)
7. Verify build passes
