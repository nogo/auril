// Preloaded before every test (see bunfig.toml). Registers happy-dom globals
// (window, document, customElements, HTMLElement, Event, …) so DOM-dependent
// kernel tests run headless. Dev-only; never vendored into apps.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
