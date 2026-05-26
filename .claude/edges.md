# @texturehq/edges Design System

This project uses the @texturehq/edges design system with Tailwind 4. The theme CSS file contains all design system variables that automatically become available as Tailwind classes.

## Setup

The theme is imported via CSS:
```css
@import "@texturehq/edges/theme.css";
```

## How It Works

- CSS variables in the theme file automatically become Tailwind classes
- `--color-brand-primary` becomes available as `bg-brand-primary`, `text-brand-primary`, `border-brand-primary`, etc.
- `--spacing-md` becomes available as `p-md`, `m-md`, `gap-md`, etc.
- `--text-lg` becomes available as `text-lg`
- `--radius-lg` becomes available as `rounded-lg`

## Usage Guidelines

- **Use semantic classes over arbitrary values**
- Prefer: `bg-brand-primary`, `text-text-body`, `p-md`, `rounded-lg`
- Avoid: `bg-[#444ae1]`, `text-[#333333]`, `p-[1rem]`, `rounded-[0.5rem]`

## Examples

```html
<!-- ✅ Good - Uses semantic classes -->
<div class="bg-brand-primary text-text-on-primary p-md rounded-lg shadow-md">
  <h2 class="text-text-heading text-lg font-medium">Title</h2>
  <p class="text-text-body text-base">Content</p>
</div>

<!-- ❌ Avoid - Uses arbitrary values -->
<div class="bg-[#444ae1] text-[#ffffff] p-[1rem] rounded-[0.5rem]">
  <h2 class="text-[#111827] text-[1.125rem] font-[500]">Title</h2>
  <p class="text-[#333333] text-[1rem]">Content</p>
</div>
```

## Dark Mode

All colors automatically adapt to dark mode when `.theme-dark` class is present.

## Design Token Reference

For comprehensive token documentation, see the live Edges docs:

- **Color System:** https://edges.texturehq.com/foundations/color
  - Brand, text, background, border, action, feedback colors
  - Device states (charging, discharging, heat, cool, etc.)
  - Grid states (importing, exporting)
  - Data visualization palettes
  - Map colors, skeleton colors, surface elevation

- **Typography:** https://edges.texturehq.com/foundations/typography
  - Font families, weights, sizes
  - Line heights, letter spacing
  - Text styles (display, heading, body, label, caption, code, eyebrow)

- **Spacing:** Numeric scale (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96)

- **Border Radius:** none, xs, sm, md, lg, xl, 2xl, 3xl, 4xl, full

- **Motion:** Durations (instant, fast, normal, slow, slower), easing (standard, emphasized, accelerate, deaccelerate)

For AI agents: Read `node_modules/@texturehq/edges/theme.css` directly if you need the raw token definitions.

## Available Components

The following components are available from @texturehq/edges:

### Quick Reference

- **ActionCell** - Component
- **ActionMenu** - ActionMenu  A dropdown menu for actions, typically triggered by a button. Supports icons, destructive actions, and flexible alignment.
- **ActivityFeed** - Height/maxHeight for scroll container
- **ActivityFeedGroup** - Group content
- **ActivityItem** - Marks the item as interactive, enabling keyboard semantics
- **Alert** - Alert  A simple alert dialog with a single action button. Use for informational messages that require acknowledgment.
- **AppShell** - Isomorphic AppShell component that works as both server and client component Uses CSS-only interactions by default for full SSR compatibility Can be progressively enhanced with JavaScript when enableJsEnhancements is true
- **AreaSeries** - AreaSeries  Chart component for rendering area charts with gradient fill. Displays data as a filled area with optional line path, supporting animations and custom colors.
- **Autocomplete** - Additional CSS classes to apply to the component
- **AutoMobileRenderer** - Component
- **Avatar** - Avatar  Display user, team, or organization avatars with support for images, initials, and fallback icons. Includes optional status indicators.
- **Badge** - Badge  A non-interactive label for displaying status, counts, or categories. Use for read-only indicators. For interactive elements, use Chip instead.  Supports device states (charging, discharging, heat, cool, etc.) and grid states (importing, exporting) as variant values.
- **BadgeCell** - Component
- **Banner** - Banner  A prominent message component for displaying important information or system messages. Can be used inline within content sections or positioned at the page level.  Inspired by Atlassian's Section Message and Chakra UI's Alert, combining the best features of both: semantic variant colors, multiple appearances, inline actions, and flexible composition.  @example ```tsx // Simple info banner <Banner variant="info" title="New features available"> Check out the latest updates to improve your workflow. </Banner>  // With actions <Banner variant="warning" title="Your trial expires soon" primaryAction={{ label: "Upgrade now", onPress: () => {} }} secondaryAction={{ label: "Learn more", onPress: () => {}, asLink: true }} > Upgrade to continue using premium features. </Banner>  // Bold appearance <Banner variant="error" appearance="bold" title="Action required" dismissible onDismiss={() => {}} > Please update your payment information. </Banner> ```
- **BarSeries** - BarSeries  Chart component for rendering bar/column charts. Displays data as vertical bars with customizable colors, opacity, and category-based coloring.
- **BooleanCell** - Component
- **BreadcrumbItem** - BreadcrumbItem  Individual breadcrumb item with optional link The last breadcrumb is automatically styled as the current page (non-interactive, bold) When `copyable` is true, adds a copy-to-clipboard button next to the current (last) breadcrumb
- **Breadcrumbs** - Breadcrumbs  Navigation breadcrumbs that show the user's current location in the hierarchy Automatically collapses middle items into an ellipsis dropdown when the container width exceeds the maxWidth threshold (default: 600px)
- **Button** - Renders an Edges Button. When `href` is provided, renders a link-styled button using the same visual system.
- **Calendar** - Calendar  Single-date calendar primitive with Edges styling.
- **Card** - When true and parent Card has layout="flex", content expands to fill available space
- **CardContent** - When true and parent Card has layout="flex", content expands to fill available space
- **CardFooter** - When true and parent Card has layout="flex", content expands to fill available space
- **CardHeader** - When true and parent Card has layout="flex", content expands to fill available space
- **CardMedia** - When true and parent Card has layout="flex", content expands to fill available space
- **CardMobileRenderer** - Component
- **CarouselAutoplayTrigger** - CarouselAutoplayTrigger - Toggle button for autoplay functionality. Allows users to pause and resume automatic slide transitions.
- **CarouselControl** - CarouselControl - Container for navigation controls and indicators. Typically holds prev/next buttons, indicators, and autoplay controls.
- **CarouselIndicator** - CarouselIndicator - Dot indicator for a specific slide. Clicking navigates to the slide at the specified index.
- **CarouselIndicatorGroup** - CarouselIndicatorGroup - Container for all page indicators. Automatically generates indicators for each page/slide.
- **CarouselItem** - Individual slide/item within the carousel. Handles sizing based on slidesPerView and applies snap alignment.
- **CarouselItemGroup** - CarouselItemGroup - Container for carousel items with scrolling behavior. Manages scroll snap, drag interactions, and layout spacing.
- **CarouselNextTrigger** - CarouselNextTrigger - Button to navigate to the next slide. Automatically disabled when at the last slide (unless loop is enabled).
- **CarouselPrevTrigger** - CarouselPrevTrigger - Button to navigate to the previous slide. Automatically disabled when at the first slide (unless loop is enabled).
- **CarouselProgressText** - CarouselProgressText - Displays current slide position (e.g., "1 / 5"). Shows the current page number and total number of pages.
- **CarouselRoot** - CarouselRoot - Main carousel container with state management and navigation logic. Handles page state, autoplay, looping, and drag interactions.
- **CategoryBarChart** - Show tooltip on hover (default true)
- **ChartAxis** - ChartAxis  Chart axis components for rendering X and Y axes. Provides formatted bottom (time) and left (numeric) axes with customizable tick formatting.  Components: - Bottom: Time-based x-axis (for time-series charts) - Left: Numeric y-axis - CategoryBottom: Categorical x-axis (for bar charts with labels) - CategoryLeft: Categorical y-axis (for horizontal bar charts) - NumericBottom: Numeric x-axis (for horizontal bar charts)
- **ChartBottomBar** - ChartBottomBar  Chart footer component with legend and export functionality. Displays color-coded legend items and provides export options for CSV, SVG, and PNG formats.  **Smart legend display:** - Desktop (≥ 640px): Shows all legend items inline with wrapping - Mobile (< 640px): Shows "Legend (N)" button that opens a tray with all items - Legend and action buttons always stay on a single row for clean, consistent layout  **Responsive behavior:** - Mobile: No padding, legend in tray, button text hidden (icon-only) - Desktop: Chart margin padding, inline legend, full button labels  Respects chart margins to align legend with Y-axis and export button with X-axis end.
- **ChartContainer** - ChartContainer  Main chart wrapper component that provides context and layout for chart visualizations. Handles scaling, tooltips, axes, and data management for area, line, and bar charts.
- **ChartEventMarkers** - ChartEventMarkers  Renders vertical lines with markers for events (e.g., commands) on a chart. Must be used as a child of ChartContainer to access chart context.  @example ```tsx <ChartContainer> <AreaSeries data={data} label="Power" /> <ChartEventMarkers events={[ { timestamp: new Date('2024-01-01T10:00:00Z'), label: 'Command sent', type: 'command' }, { timestamp: new Date('2024-01-01T12:00:00Z'), label: 'Alert triggered', type: 'alert' } ]} /> </ChartContainer> ```
- **ChartTooltip** - ChartTooltip  Interactive tooltip component for charts. Displays formatted data values at hover position with automatic positioning and animations. Uses the main formatting system for consistency with Kpi, StatList, and DataTable.  Can be used standalone (with label prop) or within ChartContext (for time-series charts).
- **Checkbox** - Visual variant of the checkbox @default "default"
- **CheckboxGroup** - Visual variant of the checkbox @default "default"
- **Chip** - Chip  A compact element that represents an input, attribute, or action. Can be removable with an X button and supports different variants and sizes.
- **ChipInputField** - ChipInputField  A tags input component with autocomplete suggestions. Press Enter or comma to add tags, Backspace when empty to remove last tag. Supports both static items and async fetching for suggestions.
- **CodeEditor** - CodeEditor  A code editor component with syntax highlighting and various language support. Built on top of Ace Editor.
- **Collapse** - Collapse  A composable disclosure group built on `react-aria-components` that follows the Edges design system. Supports contained, bordered, and plain variants along with compact or comfortable density options.
- **CollapseContent** - Collapse  A composable disclosure group built on `react-aria-components` that follows the Edges design system. Supports contained, bordered, and plain variants along with compact or comfortable density options.
- **CollapseHeader** - Collapse  A composable disclosure group built on `react-aria-components` that follows the Edges design system. Supports contained, bordered, and plain variants along with compact or comfortable density options.
- **CollapseItem** - Collapse  A composable disclosure group built on `react-aria-components` that follows the Edges design system. Supports contained, bordered, and plain variants along with compact or comfortable density options.
- **ColorField** - ColorField Component  A form control that allows users to input hex color codes manually or select colors using a visual color picker. Integrates seamlessly with the Edges design system.  @example ```tsx <ColorField label="Brand Color" value={color} onChange={setColor} description="Choose your primary brand color" /> ```
- **CommandPalette** - Component
- **Confirm** - Confirm  A confirmation dialog with confirm and cancel actions. Use for actions that require user confirmation before proceeding.
- **ConnectionStatusBadge** - ConnectionStatusBadge  Displays device connection status with optional timestamps. - Green "Connected" badge with pulsing dot - Gray "Disconnected" badge with duration offline - Auto-calculates "offline for 2 hours" type strings  @example ```tsx <ConnectionStatusBadge isConnected={true} /> <ConnectionStatusBadge isConnected={false} disconnectedAt={new Date()} showTimestamp /> <ConnectionStatusBadge isConnected={true} connectedAt={new Date()} /> ```
- **ContactCard** - ContactCard  A card component for displaying contact information with avatar. Includes name, optional email, and optional phone number.  @example ```tsx <ContactCard firstName="John" lastName="Doe" email="john.doe@example.com" phone="+1 (555) 123-4567" showEmail showPhone href="/contacts/123" /> ```
- **ContactMetaCell** - Component
- **ContactMetaDisplay** - ContactMetaDisplay  Reusable component for displaying contact information with avatar. Supports stacked and inline layouts with size variants and optional linking.  **Stacked layout**: Avatar, name above, optional email below **Inline layout**: Avatar + name only (horizontal)  Use this component directly in cards, lists, or other layouts. For DataTable cells, use ContactMetaCell which wraps this component.  @example ```tsx // Stacked layout (default) <ContactMetaDisplay firstName="John" lastName="Doe" email="john@example.com" layout="stacked" size="md" showEmail href="/contacts/123" />  // Inline layout <ContactMetaDisplay firstName="John" lastName="Doe" layout="inline" size="sm" href="/contacts/123" /> ```
- **CopyToClipboard** - Position of the copy icon relative to children, defaults to "right"
- **CustomCell** - Component
- **DataControls** - DataControls  A unified control bar for data display components (Lists, DataTables). Provides search, filtering, sorting, results count, and action controls with responsive layout.  All data operations (search, filter, sort) are handled server-side. This component is purely presentational and controlled.  **Features:** - Optional sticky positioning for data-heavy pages - Works with PageLayout sticky headers - Configurable z-index and offset  **Responsive Behavior:** - Narrow containers (< 640px): Two rows - Row 1: inputs (search + filter icon), Row 2: outputs (results + sort + actions) - Wide containers (≥ 640px): Single row with all controls visible  Example usage: ```tsx <DataControls resultsCount={{ count: 23, label: "sites" }} search={{ value: searchQuery, onChange: setSearchQuery, onClear: () => setSearchQuery(''), placeholder: "Search sites..." }} filters={activeFilters} onRemoveFilter={removeFilter} onClearAllFilters={clearAllFilters} onManageFilters={() => setFilterDrawerOpen(true)} sort={{ value: sortBy, options: sortOptions, onChange: setSortBy }} /> ```
- **DataTable** - DataTable  Advanced table component with sorting, filtering, pagination, and infinite scroll. Supports custom cell renderers, column configurations, multiple display densities, and virtualization for large datasets.
- **DateCell** - Component
- **DateField** - Renders an Edges DateField with label, description, validation states, and optional calendar picker.
- **DateRangePicker** - DateRangePicker  Composed date range input with popover calendar.
- **DeviceHealthBadge** - DeviceHealthBadge  Displays device health status with optional alert counts. Maps health status to feedback colors (success/warning/error). Pulsing dot for warning/error states.  @example ```tsx <DeviceHealthBadge status="healthy" /> <DeviceHealthBadge status="warning" alertCount={2} showCount /> <DeviceHealthBadge status="error" alertCount={5} showCount /> ```
- **DeviceMetaCell** - Component
- **DeviceMetaDisplay** - DeviceMetaDisplay  Reusable component for displaying device metadata (manufacturer, model, logo). Supports stacked and inline layouts with size variants and optional linking.  **Stacked layout**: Large icon/logo, manufacturer name above, device type icon + model below **Inline layout**: Small icon + "Manufacturer Model" as single text string  Use this component directly in cards, lists, or other layouts. For DataTable cells, use DeviceMetaCell which wraps this component.  @example ```tsx // Stacked layout (default) <DeviceMetaDisplay manufacturer="Tesla" model="Powerwall 2" deviceType="battery" layout="stacked" size="md" logoUrl="https://..." href="/devices/123" />  // Inline layout <DeviceMetaDisplay manufacturer="Tesla" model="Powerwall 2" deviceType="battery" layout="inline" size="sm" href="/devices/123" /> ```
- **DeviceStateBadge** - DeviceStateBadge  A specialized badge component for displaying device states with smart defaults. Auto-enables pulsing dot for active states (charging, discharging, heat, cool, on). Uses semantic device state colors from the theme.  @example ```tsx <DeviceStateBadge state="charging" /> <DeviceStateBadge state="heat" label="Heating Mode" /> <DeviceStateBadge state="on" icon="Lightning" /> ```
- **DeviceStateCell** - Component
- **DeviceStateWithMetric** - DeviceStateWithMetric  Combines a device state badge with a formatted metric display. Uses the existing FieldFormat system for flexible metric formatting. Supports horizontal layout (for tables) and vertical layout (for cards/detail views).  @example ```tsx // Battery: "Charging | 75%" <DeviceStateWithMetric state="charging" metric={75} metricFormatter={{ type: "number", decimals: 0, suffix: "%" }} />  // Inverter: "On | 5.2 kW" <DeviceStateWithMetric state="on" metric={5200} metricFormatter={{ type: "power", unit: "kW" }} />  // Thermostat: "Cool | 72°F" <DeviceStateWithMetric state="cool" metric={72} metricFormatter={{ type: "temperature", unit: "F" }} /> ```
- **DeviceTypeIcon** - DeviceTypeIcon  Displays a consistent icon for device types across the platform.  **Preferred usage:** Pass `iconName` explicitly (from device-config package) **Legacy usage:** Pass `deviceType` to use built-in icon mapping (deprecated)  @example ```tsx // Preferred: Explicit icon from device-config import { getDeviceTypeDisplay } from "@texturehq/device-config"; const display = getDeviceTypeDisplay("battery"); <DeviceTypeIcon iconName={display.icon} size="md" />  // Legacy: Built-in mapping (deprecated) <DeviceTypeIcon deviceType="battery" size="md" /> ```
- **Dialog** - Dialog  Responsive modal dialog component with backdrop.  **Desktop (≥768px):** Centered modal with scale and fade animation **Mobile (<768px):** Uses Tray component for native bottom sheet experience with drag handle  Includes optional header with title/back button and footer with action buttons.  ## Usage Patterns  ### Uncontrolled with DialogTrigger (Recommended) ```tsx import { DialogTrigger, Dialog, Button } from "@texturehq/edges";  <DialogTrigger> <Button>Open Dialog</Button> <Dialog title="My Dialog"> <p>Dialog content</p> </Dialog> </DialogTrigger> ```  ### Controlled (Advanced) ```tsx const [isOpen, setIsOpen] = useState(false);  <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="My Dialog"> <p>Dialog content</p> </Dialog> ```
- **DialogHeader** - DialogHeader  Header area for dialogs with optional back arrow.
- **Drawer** - Drawer  Sliding panel that anchors to screen edges.
- **EmptyState** - EmptyState  Minimal, composable empty state surface for communicating lack of data. Supports optional icon, description and opinionated action patterns.  Use `primaryAction` (button) and `secondaryAction` (text link) for consistent styling, or use `actions` for complete control over the action area.  The `spotlight` variant adds a subtle branded gradient background for marketing-focused empty states that encourage user behavior. Choose from different gradient patterns using the `spotlightPattern` prop.
- **EnrollmentStatusBadge** - EnrollmentStatusBadge  Displays device enrollment status for programs. Color-coded status with optional program name in tooltip.  Status mapping: - enrolled → success (green) - eligible → info (blue) - pending → warning (yellow) - not_eligible → neutral (gray) - opted_out → neutral (gray)  @example ```tsx <EnrollmentStatusBadge status="enrolled" programName="Demand Response Q4" /> <EnrollmentStatusBadge status="eligible" /> <EnrollmentStatusBadge status="pending" /> ```
- **ErrorBoundary** - ErrorBoundary  React error boundary component for graceful error handling. Catches JavaScript errors in child components and displays a fallback UI with retry option.
- **FileUpload** - FileUpload  A file upload component with drag-and-drop support. Supports image preview, custom upload handlers, and file validation.
- **FilterChips** - Component
- **FilterDialog** - Component
- **FirmwareVersionBadge** - FirmwareVersionBadge  Displays firmware version with update status indicators. Green indicator if latest, orange if update available. Compact display suitable for tables.  @example ```tsx <FirmwareVersionBadge version="1.2.3" isLatest /> <FirmwareVersionBadge version="1.1.0" updateAvailable /> <FirmwareVersionBadge version="2.0.0-beta" /> ```
- **Form** - Form  Accessibility-first form wrapper with consistent spacing. Defaults to ARIA validation to use custom error styling instead of native browser tooltips.
- **FormattedCell** - Component
- **FunnelSeries** - Accessible label
- **GlobalSearch** - GlobalSearch  Complete global search experience with trigger + results. Desktop: SearchTrigger with popover below Mobile: Icon trigger with full-screen tray  Handles CMD+K shortcuts automatically.  @example ```tsx const [query, setQuery] = useState(""); const [isOpen, setIsOpen] = useState(false);  <GlobalSearch value={query} onChange={setQuery} isOpen={isOpen} onOpenChange={setIsOpen} placeholder="Search sites, devices, contacts..." > <SearchResultsList> <SearchResultGroup title="Sites" count={2}> <SearchResultItem id="1" title="HQ" /> </SearchResultGroup> </SearchResultsList> </GlobalSearch> ```
- **Grid** - Child elements
- **GridStateBadge** - GridStateBadge  A specialized badge component for displaying grid states (importing, exporting). Optionally shows directional icons to indicate power flow direction. Uses semantic grid state colors from the theme.  @example ```tsx <GridStateBadge state="importing" /> <GridStateBadge state="exporting" showIcon /> <GridStateBadge state="importing" label="Grid Import" /> ```
- **Heading** - Heading  Typography component for page/section headings with size and height options.
- **HierarchyExplorer** - HierarchyExplorer - Main component for drill-down navigation through hierarchical data
- **HorizontalBarCell** - Component
- **HoverCard** - Whether to show an arrow pointing to the trigger @default false
- **Icon** - Icon  Phosphor icon wrapper component with standardized sizing and styling. Provides access to the full Phosphor icon library with tree-shaking support and design system presets. - TypeScript autocomplete for all icon names  Usage: ```tsx <Icon name="House" size="md" /> <Icon name="User" size={32} className="text-brand" /> ```
- **InfiniteScrollIndicator** - InfiniteScrollIndicator  Lightweight composition component for displaying loading states in infinite scroll contexts. Uses the Loader component for consistency.  - For initial loading: Use component-specific Skeleton implementations - For loading-more: Use this component at the bottom of lists/tables  By default, shows only a spinner (no text) to avoid internationalization concerns. Consuming applications can provide their own localized message via the `message` prop.  Example usage: ```tsx // Default: spinner only (no i18n needed) <InfiniteScrollIndicator state="loading-more" />  // With localized text <InfiniteScrollIndicator state="loading-more" message={t('loading.loadMore')} /> ```
- **InteractiveMap** - Component
- **Kpi** - Custom trend renderer
- **KpiGroup** - Component
- **LineSeries** - LineSeries  Chart component for rendering line charts. Displays data as a continuous line with customizable stroke width, color, and dash patterns.
- **List** - List  A semantic wrapper and state manager for rows. Handles selection, hover, keyboard navigation, accessibility, and infinite scroll with virtualization. Composes with ListItem for visual rows.  Example usage: ```tsx <List items={sites} selectedId={selectedSiteId} onSelect={(id) => openDetail(id)} onHoverChange={(id) => highlightOnMap(id)} renderItem={({ item, rowProps, isSelected }) => ( <ListItem id={item.id} title={item.name} subtitle={item.address?.city} isSelected={isSelected} {...rowProps} /> )} // Optional: Custom loading skeleton matching your data structure renderLoadingSkeleton={() => ( <div className="flex items-center gap-3 px-4 py-3"> <Skeleton width={40} height={40} variant="circle" /> <div className="flex-1"> <Skeleton width="60%" height={16} /> <Skeleton width="40%" height={12} /> </div> </div> )} loadingSkeletonCount={8} // Infinite scroll onLoadMore={loadMoreSites} hasMore={hasMoreSites} isLoading={isLoading} /> ```
- **ListBox** - ListBox  Styled wrapper around `react-aria-components` ListBox and related parts used in dropdowns and menus.
- **ListBoxItem** - ListBoxItem  A styled wrapper around `react-aria-components` ListBoxItem with size variants that align with Edges typography.
- **ListItem** - Component
- **ListPane** - Component
- **Loader** - Loader  Animated loading spinner component. Displays a circular spinner with customizable size and color for loading states.
- **Logo** - Logo  Brand logo component with optional wordmark. Supports customizable sizing and fill colors with theme-aware defaults.
- **MAP_TYPES** - Component
- **Meter** - Meter  Displays a measurement within a known range, with visual indicators for different value ranges. Perfect for showing capacity, usage levels, scores, or any bounded measurement.
- **MiniBarCell** - Component
- **ModalBackdrop** - ModalBackdrop  Shared backdrop/overlay component used by Dialog and Drawer. Wraps React Aria's ModalOverlay with consistent styling and smooth animations.
- **Notice** - Notice  Individual notification component that displays a message with an icon. Typically used within a NoticeProvider for managing multiple notifications.
- **NoticeContainer** - Component
- **NoticeProvider** - Component
- **NumberCell** - Component
- **NumberField** - Where to display the description text - "below": Show below the field (default) - "tooltip": Show as a tooltip on the label icon - "inline": Show inline with the label - "hidden": Don't display the description @default "below"
- **PageBanner** - Component
- **PageLayout** - Constrain width and apply default page rhythm
- **PercentBarCell** - Component
- **PlaceSearch** - PlaceSearch  Location search component with autocomplete; emits a `Place` value on selection.
- **Popover** - Popover content
- **ProgressBar** - ProgressBar  Linear progress indicator with optional labels.
- **Radio** - Visual variant of the radio buttons @default "default"
- **RadioCard** - Gap between items
- **RadioCardGroup** - Gap between items
- **RadioGroup** - Visual variant of the radio buttons @default "default"
- **RangeCalendar** - RangeCalendar  Calendar allowing selection of a date range.
- **ResultsCount** - Component
- **RichTextEditor** - RichTextEditor  A rich text editor with formatting capabilities including headings, bold, italic, lists, and links. Built on top of TipTap/ProseMirror.
- **SearchControl** - Component
- **SearchEmptyState** - Component
- **SearchLoadingState** - Component
- **SearchResultGroup** - Component
- **SearchResultItem** - Component
- **SearchResultsList** - Component
- **SearchTrigger** - Component
- **Section** - Label used by in-page navigation (PageLayout.Content with withSectionNav). Falls back to title when omitted
- **SectionNav** - Custom filter function to determine which sections are visible
- **SegmentedControl** - SegmentedControl  A segmented control component for selecting between multiple options. Similar to a radio group but with a more compact, button-like appearance.
- **Select** - Whether to use a Tray (bottom sheet) on mobile devices instead of a Popover @default true
- **SelectCell** - Component
- **SideNav** - SideNav  Vertical navigation component for application sidebars. Supports nested navigation items, sections, collapsible categories, and mobile-responsive behavior.
- **SiteCard** - SiteCard  A card component for displaying site/location information. Can include an optional static map showing the site's location.  @example ```tsx <SiteCard streetAddress="123 Main St" city="San Francisco" state="CA" postalCode="94102" longitude={-122.4194} latitude={37.7749} showMap href="/sites/123" /> ```
- **SiteContactCard** - SiteContactCard  A combined card component for displaying both site and contact information. Shows site details with optional map, followed by associated contact information.  @example ```tsx <SiteContactCard site={{ streetAddress: "123 Main St", city: "San Francisco", state: "CA", postalCode: "94102", longitude: -122.4194, latitude: 37.7749, href: "/sites/123" }} contact={{ firstName: "John", lastName: "Doe", email: "john.doe@example.com", phone: "+1 (555) 123-4567", href: "/contacts/123" }} showMap /> ```
- **SiteMetaCell** - Component
- **SiteMetaDisplay** - SiteMetaDisplay  Reusable component for displaying site location information. Supports stacked and inline layouts with size variants and optional linking.  **Stacked layout**: MapPin icon, street address above, city/state/zip below **Inline layout**: MapPin icon + street address only (no city/state)  Use this component directly in cards, lists, or other layouts. For DataTable cells, use SiteMetaCell which wraps this component.  @example ```tsx // Stacked layout (default) <SiteMetaDisplay streetAddress="123 Main St" city="San Francisco" state="CA" postalCode="94102" layout="stacked" size="md" href="/sites/123" />  // Inline layout <SiteMetaDisplay streetAddress="123 Main St" layout="inline" size="sm" href="/sites/123" /> ```
- **Skeleton** - Skeleton  Loading placeholder component that mimics content structure. Supports various shapes, animations, and responsive configurations for skeleton screens.
- **SKELETON_SIZES** - Component
- **Slider** - Show the current numeric value to the right of the track
- **SortControl** - Component
- **SparklineCell** - Component
- **SplitPane** - Child panels
- **StaticMap** - Component
- **StatList** - Additional CSS classes */ className?: string; }  // Helpers  // Use the centralized formatting utility function formatValue(value: StatValue, formatter?: StatFormatter): React.ReactNode { // If value is already a React element, return it as-is (skip formatting) if (React.isValidElement(value)) { return value; }  return formatComponentValue({ value, formatter, emptyClassName: "text-text-muted", emptyText: "—", }); }  function getTone(item: StatItem): StatTone | undefined { // Check thresholds first if (item.thresholds && item.value !== null && item.value !== undefined) { for (const threshold of item.thresholds) { if (threshold.when(item.value)) { return threshold.tone; } } }  // Fall back to explicit tone return item.tone; }  const toneColors: Record<StatTone, string> = { neutral: "text-text-body", success: "text-feedback-success", warning: "text-feedback-warning", error: "text-feedback-error", info: "text-feedback-info", };  // StatRow Component  // Constants for auto-truncation const LONG_STRING_THRESHOLD = 24; const LONG_STRING_TRUNCATE_LENGTH = 20;  function StatRow({ item, dense, valueAlign }: { item: StatItem; dense?: boolean; valueAlign?: StatAlign }) { const tone = getTone(item); const toneClass = tone ? toneColors[tone] : ""; const isStacked = item.stackOnMobile;  // Check if this is a long string that should be auto-truncated on mobile const isLongString = typeof item.value === "string" && item.value.length > LONG_STRING_THRESHOLD && !item.formatter && !React.isValidElement(item.value);  // Get the formatted value (used for both truncated and full display) const formattedValue = formatValue(item.value, item.formatter);  // Get the truncated value for mobile display // Note: We cast to string here because isLongString already verifies typeof item.value === "string" const truncatedValue = isLongString ? truncateMiddle(item.value as string, LONG_STRING_TRUNCATE_LENGTH) : null;  const textToCopy = typeof item.copyable === "function" ? item.copyable(item.value) : String(item.value);  // PII data attributes (only set if both piiType and piiEntity are provided) const piiAttrs = item.piiType && item.piiEntity ? { "data-pii-type": item.piiType, "data-pii-entity": item.piiEntity, } : {};  // For long strings, render both truncated (mobile) and full (desktop) versions // CSS classes control which is visible based on screen size // Tooltip content is wrapped in span with PII attributes to allow masking by Curtain extension const hasPiiAttrs = Object.keys(piiAttrs).length > 0; const valueDisplay = isLongString ? ( <> {/* Mobile: show truncated with tooltip */} <Tooltip content={hasPiiAttrs ? <span {...piiAttrs}>{String(item.value)}</span> : String(item.value)}> <span className={twMerge("md:hidden", item.href ? "hover:underline cursor-pointer" : "")} {...piiAttrs}> {truncatedValue} </span> </Tooltip> {/* Desktop: show full value
- **Switch** - Switch  Toggle switch component for binary on/off states. Provides an accessible alternative to checkboxes for settings and preferences.
- **Tab** - Tab trigger element.
- **TabList** - TabList container.
- **TabPanel** - TabPanel content area.
- **Tabs** - Tabs  Tabbed interface with styled tabs and panels. @param variant - "default" for action-default styling, "brand" for action-brand styling
- **TextArea** - Allow user resizing of the textarea. Defaults to false (non-resizable). When true, enables vertical resize.
- **TextAreaWithChips** - TextAreaWithChips  Enhanced textarea component with chip/tag support. Enables rich text input with embedded chips for mentions, tags, or structured data entry.
- **TextCell** - Component
- **TextField** - Renders an Edges TextField with label, description, validation states and optional search/clear/password affordances.
- **TextLink** - TextLink  Styled text link component for navigation and actions. Supports internal/external links, button mode, and multiple visual variants.  @param LinkComponent - Optional custom Link component (e.g., Next.js Link) for client-side navigation
- **TimeControls** - TimeControls  Sophisticated time control component with responsive behavior and calendar integration. Features preset ranges, custom date picker, and window size selection.  **Responsive Behavior:** - < 600px: Compact mode with Select dropdowns - ≥ 600px: Expanded mode with ToggleButton group for presets  @example ```tsx const [dateRange, setDateRange] = useState({ after: subDays(new Date(), 7), before: new Date() }); const [windowSize, setWindowSize] = useState<WindowSize>("HOUR");  <TimeControls dateRange={dateRange} onDateRangeChange={setDateRange} windowSize={windowSize} onWindowSizeChange={setWindowSize} presetRanges={presetRanges} allowDatePicker /> ```
- **TimeField** - Renders an Edges TimeField with label, description, validation states, and segmented time input.
- **Timeline** - Timeline  A vertical timeline component for displaying hierarchical or sequential information. Connects items with a visual line to show relationships or flow.  @example ```tsx <Timeline> <TimelineItem>First item</TimelineItem> <TimelineItem>Second item</TimelineItem> <TimelineItem>Third item</TimelineItem> </Timeline> ```
- **TimelineItem** - Component
- **ToggleButton** - Value used for group selection state
- **Tooltip** - Tooltip  Lightweight content container that appears on hover/focus/press.
- **TopNav** - TopNav  Horizontal navigation bar component for application headers. Includes mobile menu toggle, user avatar, theme switcher, and customizable action areas.
- **Tray** - Tray  Bottom anchored overlay optimized for mobile experiences. Provides optional header/footer slots that align with Dialog & Drawer APIs.
