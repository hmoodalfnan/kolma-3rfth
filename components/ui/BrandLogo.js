/**
 * The program wordmark (كلّما عرفته), rendered from the logo art.
 *
 * Two pre-tinted PNGs are shipped: a green wordmark for light/cream surfaces and
 * a cream wordmark for dark surfaces. CSS in globals.css shows exactly one based
 * on the active theme, so the mark always has contrast without any JS.
 */
export function BrandLogo({ className = '', priority = false }) {
  return (
    <span className={`inline-block ${className}`}>
      <img
        src="/logo-green.png"
        alt="كلّما عرفته"
        className="brand-logo-light block h-full w-auto object-contain"
        loading={priority ? 'eager' : 'lazy'}
        draggable={false}
      />
      <img
        src="/logo.png"
        alt="كلّما عرفته"
        className="brand-logo-dark h-full w-auto object-contain"
        loading={priority ? 'eager' : 'lazy'}
        draggable={false}
      />
    </span>
  );
}
