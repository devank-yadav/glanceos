import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { Icon } from "../editor/icons";
import { IconButton } from "./IconButton";

// Shell-level context so a page's header can open the mobile drawer without
// prop-drilling. Pages render their own <PageHeader/> at the top of their body.
export const ShellCtx = createContext<{ openDrawer: () => void }>({ openDrawer: () => {} });

export function PageHeader({ title, actions }: { title: string; actions?: ComponentChildren }) {
  const { openDrawer } = useContext(ShellCtx);
  return (
    <header class="page-header glass">
      <IconButton class="drawer-btn" icon={<Icon.list />} label="Open menu" onClick={openDrawer} />
      <h1 class="page-title">{title}</h1>
      <span class="spacer" />
      {actions && <div class="header-actions">{actions}</div>}
    </header>
  );
}
