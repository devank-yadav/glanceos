import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Icon } from "../editor/icons";
import { SECTION, useRoute } from "../router";
import { IconButton } from "./IconButton";

// Shell-level context so a page's header can open the mobile drawer without
// prop-drilling. Pages render their own <PageHeader/> at the top of their body.
export const ShellCtx = createContext<{ openDrawer: () => void }>({ openDrawer: () => {} });

export function PageHeader({ title, actions }: { title: string; actions?: ComponentChildren }) {
  const { openDrawer } = useContext(ShellCtx);
  const route = useRoute();
  const section = SECTION[route.name]; // app-wide breadcrumb: glanceos / <section>
  return (
    <header class="page-header glass">
      <IconButton class="drawer-btn" icon={<Icon.list />} label="Open menu" onClick={openDrawer} />
      <div class="page-head-text">
        <nav class="page-crumbs" aria-label="Breadcrumb">
          <a href="#/">glanceos</a>
          <span class="crumb-sep" aria-hidden="true">/</span>
          <span aria-current="page">{section?.label ?? title}</span>
        </nav>
        <h1 class="page-title">{title}</h1>
      </div>
      <span class="spacer" />
      {actions && <div class="header-actions">{actions}</div>}
    </header>
  );
}
