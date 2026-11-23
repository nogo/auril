// The bar along the top: the app's name, the offline notice, and the user
// with sign-out. Navigation links go between the name and the spacer.
import { AurilElement, html } from '../auril/index.js';
import { store } from './state.js';
import { logout } from './session.js';

class AppBar extends AurilElement {
  onConnect() {
    this.watch();
    this.delegate('click', '#logout', () => logout());
  }

  render() {
    const s = store.state;
    return html`<header class="app-bar">
      <a class="name" href="./">__APP_NAME__</a>
      <span class="spacer"></span>
      ${!s.online && html`<span class="caption" role="status">Offline</span>`}
      ${s.session && html`<span class="caption">${s.session.user?.name ?? ''}</span>
        <button type="button" id="logout" class="borderless">Sign out</button>`}
    </header>`;
  }
}
customElements.define('app-bar', AppBar);
