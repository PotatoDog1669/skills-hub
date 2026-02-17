import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { forwardRef } from 'react';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
};

function navigate(href: string, replace = false) {
  if (replace) {
    window.history.replaceState({}, '', href);
  } else {
    window.history.pushState({}, '', href);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, onClick, target, ...rest },
  ref
) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (target && target !== '_self') return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;

    event.preventDefault();
    navigate(href, false);
  };

  return <a ref={ref} href={href} target={target} onClick={handleClick} {...rest} />;
});

export default Link;
