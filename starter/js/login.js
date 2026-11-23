// The login screen: the app's name and one link to the identity provider.
// Shown whenever there is no session.
import { AurilElement, html } from '../auril/index.js';
import { loginUrl } from './api.js';

class LoginScreen extends AurilElement {
  render() {
    return html`<section class="state">
      <h1>__APP_NAME__</h1>
      <a class="button primary" href="${loginUrl()}">Sign in</a>
    </section>`;
  }
}
customElements.define('login-screen', LoginScreen);
