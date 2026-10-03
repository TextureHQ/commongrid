/**
 * Layout constants for the Suggest Edit drawer (EditEntityPanel).
 *
 * The app shell (`ShellLayoutClient` / `TopBar`) renders a persistent top nav
 * whose inner row is `height: 60px` and which is `position: sticky; top: 0;
 * z-index: 60` (see `.cg-nav` / `.cg-nav-inner` in `app/globals.css`).
 *
 * The Edges `Drawer` anchors its panel at `top: 0; bottom: 0` beneath a modal
 * overlay at `z-50`. Because the nav sits at `z-60`, the top 60px of the drawer
 * — including its own header/close controls — renders *underneath* the nav and
 * appears clipped, most visibly on short viewports and mobile (CG-322).
 *
 * Offsetting the drawer below the nav and shrinking its height by the same
 * amount keeps the drawer header and actions reachable at every viewport.
 *
 * IMPORTANT: this must stay a static string literal, not a template built from
 * {@link SHELL_HEADER_HEIGHT_PX}. Tailwind only generates arbitrary-value
 * utilities (`!top-[60px]`, `!h-[calc(100dvh-60px)]`) that it can see verbatim
 * in source; a dynamically composed class name would be silently dropped from
 * the build and the fix would regress. The unit test asserts the literal keeps
 * matching the documented nav height.
 */
export const SHELL_HEADER_HEIGHT_PX = 60;

/**
 * Tailwind classes that offset the Suggest Edit drawer below the sticky shell
 * header. Kept as a static literal for Tailwind's content scanner (see above).
 */
export const EDIT_ENTITY_DRAWER_CLASSNAME = "!top-[60px] !h-[calc(100dvh-60px)]";
