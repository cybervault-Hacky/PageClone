import { IconClone, IconSettings } from './Icons';

/** Popup top bar: brand mark + title, settings action on the right. */
export function Header() {
  return (
    <header className="app-header">
      <div className="brand">
        <IconClone className="brand__mark" width={18} height={18} />
        <h1 className="brand__name">PageClone</h1>
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label="Settings"
        aria-disabled="true"
        title="Settings"
      >
        <IconSettings width={16} height={16} />
      </button>
    </header>
  );
}
